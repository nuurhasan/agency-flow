import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Globe2, Pencil, Trash2, RefreshCw, Calendar, Server, Users } from "lucide-react";
import { toast } from "sonner";
import { AuthGate } from "@/components/AuthGate";
import { DomainDialog } from "@/components/DomainDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/hosting")({
  component: HostingPage,
  head: () => ({ meta: [{ title: "Hosting & Clients — Studio" }] }),
});

type DomainRow = {
  id: string;
  client_name: string;
  domain: string;
  provider: string | null;
  domain_expiry: string | null;
  hosting_expiry: string | null;
  notes: string | null;
  renewed: boolean;
};

type ProfileLite = { id: string; name: string; email: string };

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / 86400000);
}

function urgencyClasses(days: number | null, renewed: boolean): string {
  if (renewed || days === null) return "bg-muted text-muted-foreground";
  if (days < 0) return "bg-destructive text-destructive-foreground";
  if (days < 30) return "bg-coral text-coral-ink";
  if (days < 60) return "bg-butter text-butter-ink";
  return "bg-mint text-mint-ink";
}

function urgencyLabel(days: number | null, renewed: boolean): string {
  if (renewed) return "Renewed";
  if (days === null) return "No date";
  if (days < 0) return `Expired ${-days}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d left`;
}

function HostingPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<DomainRow | null>(null);
  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<DomainRow | null>(null);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["client_domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_domains")
        .select("*")
        .order("domain_expiry", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as DomainRow[];
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
      // Bump expiry +1 year, mark renewed=true, clear reminder state
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

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domains;
    return domains.filter(
      (d) =>
        d.domain.toLowerCase().includes(q) ||
        d.client_name.toLowerCase().includes(q) ||
        (d.provider ?? "").toLowerCase().includes(q),
    );
  }, [domains, search]);

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

  return (
    <AuthGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Hosting & Clients</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track every client domain and hosting renewal. Assignees get a weekly reminder email when expiry gets close.
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
          <SummaryPill label="Expired" value={stats.expired} className="bg-destructive/10 text-destructive" />
          <SummaryPill label="< 30 days" value={stats.urgent} className="bg-coral/30 text-coral-ink" />
          <SummaryPill label="30–60 days" value={stats.soon} className="bg-butter/40 text-butter-ink" />
          <SummaryPill label="Healthy" value={stats.healthy} className="bg-mint/40 text-mint-ink" />
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Search by domain, client, or registrar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm rounded-full"
          />
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
            Loading domains…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
              <Globe2 className="h-6 w-6" />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">
              {domains.length === 0 ? "No domains yet" : "Nothing matches your search"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {domains.length === 0
                ? "Add your first domain to track expiry and get reminded before it lapses."
                : "Try a different search term."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((d) => {
              const days = daysUntil(d.domain_expiry);
              const hostDays = daysUntil(d.hosting_expiry);
              const assignees = assigneeMap[d.id] ?? [];
              return (
                <Card
                  key={d.id}
                  className={cn(
                    "rounded-3xl border-border/60 transition-shadow hover:shadow-md",
                    d.renewed && "opacity-80",
                  )}
                >
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-semibold">{d.domain}</p>
                        <p className="truncate text-sm text-muted-foreground">{d.client_name}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("border-transparent shrink-0", urgencyClasses(days, d.renewed))}
                      >
                        {urgencyLabel(days, d.renewed)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{d.domain_expiry ? formatDate(d.domain_expiry) : "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Server className="h-3.5 w-3.5" />
                        <span>
                          {d.hosting_expiry
                            ? `Host: ${formatDate(d.hosting_expiry)}${
                                hostDays !== null ? ` (${hostDays}d)` : ""
                              }`
                            : "Host: —"}
                        </span>
                      </div>
                      {d.provider && (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <Globe2 className="h-3.5 w-3.5" />
                          <span className="truncate">{d.provider}</span>
                        </div>
                      )}
                      {assignees.length > 0 && (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span className="truncate">
                            {assignees.map((a) => a.name || a.email).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {d.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{d.notes}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!d.renewed && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-full"
                          onClick={() => renewMutation.mutate(d)}
                          disabled={renewMutation.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Mark renewed
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => {
                          setEditing(d);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(d)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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

function SummaryPill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", className)}>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
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
