import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Globe2,
  Pencil,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGate } from "@/components/AuthGate";
import { DomainDialog } from "@/components/DomainDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/domains")({
  component: DomainsPage,
  head: () => ({ meta: [{ title: "Domains — Studio" }] }),
});

type CustomerType = "paying" | "non-paying";

type DomainRow = {
  id: string;
  client_name: string;
  domain: string;
  provider: string | null;
  domain_expiry: string | null;
  hosting_expiry: string | null;
  notes: string | null;
  renewed: boolean;
  customer_type: CustomerType;
};

type ProfileLite = { id: string; name: string; email: string };

type SortKey = "domain" | "client_name" | "provider" | "domain_expiry" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "expired" | "urgent" | "soon" | "healthy";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / 86400000);
}

function urgencyClasses(days: number | null, renewed: boolean): string {
  if (renewed) return "bg-mint text-mint-ink";
  if (days === null) return "bg-muted text-muted-foreground";
  if (days < 0) return "bg-destructive text-destructive-foreground";
  if (days < 30) return "bg-coral text-coral-ink";
  if (days < 60) return "bg-butter text-butter-ink";
  return "bg-mint text-mint-ink";
}

function urgencyLabel(days: number | null, renewed: boolean): string {
  if (renewed) return "Renewed";
  if (days === null) return "No date";
  if (days < 0) return `Expired ${-days}d`;
  if (days === 0) return "Today";
  return `${days}d left`;
}

function statusWeight(d: DomainRow): number {
  if (d.renewed) return 4;
  const days = daysUntil(d.domain_expiry);
  if (days === null) return 5;
  if (days < 0) return 0;
  if (days < 30) return 1;
  if (days < 60) return 2;
  return 3;
}

function bucketOf(d: DomainRow): "expired" | "urgent" | "soon" | "healthy" | "none" {
  if (d.renewed) return "healthy";
  const days = daysUntil(d.domain_expiry);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days < 30) return "urgent";
  if (days < 60) return "soon";
  return "healthy";
}

function DomainsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<DomainRow | null>(null);
  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<DomainRow | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["client_domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_domains")
        .select("*")
        .order("domain_expiry", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        customer_type: (d.customer_type ?? "paying") as CustomerType,
      })) as DomainRow[];
    },
  });

  const { data: assigneeMap = {} } = useQuery<Record<string, ProfileLite[]>>({
    queryKey: ["domain-assignees-all", domains.map((d) => d.id).join(",")],
    enabled: domains.length > 0,
    queryFn: async () => {
      const ids = domains.map((d) => d.id);
      const [{ data: rows }, { data: profs }] = await Promise.all([
        supabase.from("domain_assignees").select("domain_id,user_id").in("domain_id", ids),
        supabase.from("profiles").select("id,name,email"),
      ]);
      const profById = new Map((profs ?? []).map((p) => [p.id, p as ProfileLite]));
      const map: Record<string, ProfileLite[]> = {};
      for (const r of rows ?? []) {
        if (!map[r.domain_id]) map[r.domain_id] = [];
        const p = profById.get(r.user_id);
        if (p) map[r.domain_id].push(p);
      }
      return map;
    },
  });

  const renewMutation = useMutation({
    mutationFn: async (d: DomainRow) => {
      const newExpiry = d.domain_expiry
        ? bumpYear(d.domain_expiry)
        : new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
      const { error } = await supabase
        .from("client_domains")
        .update({ domain_expiry: newExpiry, renewed: true })
        .eq("id", d.id);
      if (error) throw error;
      await supabase
        .from("domain_reminder_state")
        .upsert({ domain_id: d.id, last_sent_at: null, next_due_at: null });
    },
    onSuccess: () => {
      toast.success("Marked as renewed");
      qc.invalidateQueries({ queryKey: ["client_domains"] });
      qc.invalidateQueries({ queryKey: ["nav-domains-expiring"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (d: DomainRow) => {
      await supabase.from("domain_assignees").delete().eq("domain_id", d.id);
      await supabase.from("domain_reminder_state").delete().eq("domain_id", d.id);
      const { error } = await supabase.from("client_domains").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Domain deleted");
      qc.invalidateQueries({ queryKey: ["client_domains"] });
      qc.invalidateQueries({ queryKey: ["nav-domains-expiring"] });
      setConfirmDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const q = search.trim().toLowerCase();
  const matchSearch = React.useCallback(
    (d: DomainRow) =>
      !q ||
      d.domain.toLowerCase().includes(q) ||
      d.client_name.toLowerCase().includes(q) ||
      (d.provider ?? "").toLowerCase().includes(q) ||
      (d.notes ?? "").toLowerCase().includes(q),
    [q],
  );

  const matchStatus = React.useCallback(
    (d: DomainRow) => statusFilter === "all" || bucketOf(d) === statusFilter,
    [statusFilter],
  );

  const payingDomains = React.useMemo(
    () => domains.filter((d) => d.customer_type === "paying" && matchSearch(d) && matchStatus(d)),
    [domains, matchSearch, matchStatus],
  );
  const nonPayingDomains = React.useMemo(
    () =>
      domains.filter((d) => d.customer_type === "non-paying" && matchSearch(d) && matchStatus(d)),
    [domains, matchSearch, matchStatus],
  );

  const stats = React.useMemo(() => {
    let expired = 0;
    let urgent = 0;
    let soon = 0;
    let healthy = 0;
    for (const d of domains) {
      if (d.renewed) {
        healthy++;
        continue;
      }
      const days = daysUntil(d.domain_expiry);
      if (days === null) continue;
      if (days < 0) expired++;
      else if (days < 30) urgent++;
      else if (days < 60) soon++;
      else healthy++;
    }
    return { expired, urgent, soon, healthy };
  }, [domains]);

  const totalFiltered = payingDomains.length + nonPayingDomains.length;

  return (
    <AuthGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Domains</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track every client domain renewal. Assignees get a reminder email when expiry gets close.
            </p>
          </div>
          <Button
            className="rounded-full"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add domain
          </Button>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryPill
            label="Expired"
            value={stats.expired}
            className="bg-destructive/10 text-destructive"
            active={statusFilter === "expired"}
            onClick={() => setStatusFilter((s) => (s === "expired" ? "all" : "expired"))}
          />
          <SummaryPill
            label="< 30 days"
            value={stats.urgent}
            className="bg-coral/30 text-coral-ink"
            active={statusFilter === "urgent"}
            onClick={() => setStatusFilter((s) => (s === "urgent" ? "all" : "urgent"))}
          />
          <SummaryPill
            label="30–60 days"
            value={stats.soon}
            className="bg-butter/40 text-butter-ink"
            active={statusFilter === "soon"}
            onClick={() => setStatusFilter((s) => (s === "soon" ? "all" : "soon"))}
          />
          <SummaryPill
            label="Healthy"
            value={stats.healthy}
            className="bg-mint/40 text-mint-ink"
            active={statusFilter === "healthy"}
            onClick={() => setStatusFilter((s) => (s === "healthy" ? "all" : "healthy"))}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search domain, client, registrar, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-full pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {totalFiltered} of {domains.length}
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Loading domains…
          </div>
        ) : (
          <div className="space-y-8">
            <DomainSection
              title="Paying Customers"
              accent="bg-mint text-mint-ink"
              rows={payingDomains}
              totalCount={domains.filter((d) => d.customer_type === "paying").length}
              assigneeMap={assigneeMap}
              isAdmin={isAdmin}
              onEdit={(d) => {
                setEditing(d);
                setOpen(true);
              }}
              onRenew={(d) => renewMutation.mutate(d)}
              onDelete={(d) => setConfirmDelete(d)}
              renewing={renewMutation.isPending}
              emptyMessage="No paying customer domains yet."
            />
            <DomainSection
              title="Non-Paying / Internal / Charity Customers"
              accent="bg-lavender text-lavender-ink"
              rows={nonPayingDomains}
              totalCount={domains.filter((d) => d.customer_type === "non-paying").length}
              assigneeMap={assigneeMap}
              isAdmin={isAdmin}
              onEdit={(d) => {
                setEditing(d);
                setOpen(true);
              }}
              onRenew={(d) => renewMutation.mutate(d)}
              onDelete={(d) => setConfirmDelete(d)}
              renewing={renewMutation.isPending}
              emptyMessage="No non-paying / internal / charity domains yet."
            />
          </div>
        )}
      </div>

      <DomainDialog open={open} onOpenChange={setOpen} domain={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete domain?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.domain} will be removed permanently. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthGate>
  );
}

function DomainSection({
  title,
  accent,
  rows,
  totalCount,
  assigneeMap,
  isAdmin,
  onEdit,
  onRenew,
  onDelete,
  renewing,
  emptyMessage,
}: {
  title: string;
  accent: string;
  rows: DomainRow[];
  totalCount: number;
  assigneeMap: Record<string, ProfileLite[]>;
  isAdmin: boolean;
  onEdit: (d: DomainRow) => void;
  onRenew: (d: DomainRow) => void;
  onDelete: (d: DomainRow) => void;
  renewing: boolean;
  emptyMessage: string;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("domain_expiry");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = React.useMemo(() => {
    const arr = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = statusWeight(a) - statusWeight(b);
        if (cmp === 0) {
          const da = daysUntil(a.domain_expiry) ?? Number.MAX_SAFE_INTEGER;
          const db = daysUntil(b.domain_expiry) ?? Number.MAX_SAFE_INTEGER;
          cmp = da - db;
        }
      } else if (sortKey === "domain_expiry") {
        const av = a.domain_expiry ?? "";
        const bv = b.domain_expiry ?? "";
        if (!av && bv) cmp = 1;
        else if (av && !bv) cmp = -1;
        else cmp = av.localeCompare(bv);
      } else {
        const av = (a[sortKey] ?? "").toString().toLowerCase();
        const bv = (b[sortKey] ?? "").toString().toLowerCase();
        cmp = av.localeCompare(bv);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold", accent)}>
          {title}
        </span>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {totalCount}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Globe2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <SortableHead label="Domain" k="domain" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Client" k="client_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Registrar" k="provider" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Expiry" k="domain_expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <TableHead className="text-muted-foreground">Assignees</TableHead>
                <TableHead className="w-[1%] text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((d) => {
                const days = daysUntil(d.domain_expiry);
                const assignees = assigneeMap[d.id] ?? [];
                return (
                  <TableRow key={d.id} className={cn(d.renewed && "opacity-70")}>
                    <TableCell className="py-3 font-medium">
                      <div className="flex flex-col">
                        <span className="truncate">{d.domain}</span>
                        {d.notes && (
                          <span className="truncate text-xs text-muted-foreground">{d.notes}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm">{d.client_name}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {d.provider || "—"}
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      {d.domain_expiry ? formatDate(d.domain_expiry) : "—"}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", urgencyClasses(days, d.renewed))}
                      >
                        {urgencyLabel(days, d.renewed)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      {assignees.length > 0
                        ? assignees.map((a) => a.name || a.email).join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!d.renewed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-full px-2"
                            title="Mark renewed"
                            onClick={() => onRenew(d)}
                            disabled={renewing}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-full px-2"
                          title="Edit"
                          onClick={() => onEdit(d)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-full px-2 text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => onDelete(d)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function SortableHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

function SummaryPill({
  label,
  value,
  className,
  active,
  onClick,
}: {
  label: string;
  value: number;
  className: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-2xl px-4 py-3 text-left transition-all hover:scale-[1.02] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
        active && "ring-2 ring-foreground/40 shadow-md scale-[1.02]",
      )}
    >
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-80">
        {label}
        {active && " ·  clear"}
      </p>
    </button>
  );
}

function formatDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function bumpYear(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
