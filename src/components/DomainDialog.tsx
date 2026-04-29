import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DomainRow {
  id: string;
  client_name: string;
  domain: string;
  provider: string | null;
  domain_expiry: string | null;
  hosting_expiry: string | null;
  notes: string | null;
  renewed: boolean;
  customer_type?: "paying" | "non-paying";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain?: DomainRow | null;
}

export function DomainDialog({ open, onOpenChange, domain }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => initial(domain));
  const [assignees, setAssignees] = React.useState<string[]>([]);

  React.useEffect(() => {
    setForm(initial(domain));
  }, [domain, open]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,email")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Load existing assignees when editing
  useQuery({
    queryKey: ["domain-assignees", domain?.id, open],
    enabled: !!domain?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domain_assignees")
        .select("user_id")
        .eq("domain_id", domain!.id);
      if (error) throw error;
      setAssignees((data ?? []).map((r) => r.user_id));
      return data ?? [];
    },
  });

  React.useEffect(() => {
    if (open && !domain) setAssignees([]);
  }, [open, domain]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      let domainId = domain?.id;
      if (domain) {
        const { error } = await supabase
          .from("client_domains")
          .update({
            client_name: form.client_name,
            domain: form.domain,
            provider: form.provider || null,
            domain_expiry: form.domain_expiry || null,
            hosting_expiry: form.hosting_expiry || null,
            notes: form.notes || null,
            renewed: form.renewed,
            customer_type: form.customer_type,
          })
          .eq("id", domain.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("client_domains")
          .insert({
            client_name: form.client_name,
            domain: form.domain,
            provider: form.provider || null,
            domain_expiry: form.domain_expiry || null,
            hosting_expiry: form.hosting_expiry || null,
            notes: form.notes || null,
            renewed: form.renewed,
            customer_type: form.customer_type,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        domainId = data.id;
      }

      // Sync assignees
      if (domainId) {
        await supabase.from("domain_assignees").delete().eq("domain_id", domainId);
        if (assignees.length > 0) {
          const { error: aErr } = await supabase
            .from("domain_assignees")
            .insert(assignees.map((uid) => ({ domain_id: domainId!, user_id: uid })));
          if (aErr) throw aErr;
        }
        // Reset reminder state on save so cron re-evaluates
        await supabase.from("domain_reminder_state").upsert({
          domain_id: domainId,
          last_sent_at: null,
          next_due_at: null,
        });
      }
    },
    onSuccess: () => {
      toast.success(domain ? "Domain updated" : "Domain added");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{domain ? "Edit domain" : "Add domain"}</DialogTitle>
          <DialogDescription>
            Track domains and hosting expiry. Assign team members to get reminder emails.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-client">Client name</Label>
              <Input
                id="d-client"
                value={form.client_name}
                required
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-domain">Domain</Label>
              <Input
                id="d-domain"
                value={form.domain}
                placeholder="example.com"
                required
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-provider">Registrar / host</Label>
            <Input
              id="d-provider"
              value={form.provider}
              placeholder="GoDaddy, Cloudflare, Hetzner…"
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-dexp">Domain expiry</Label>
              <Input
                id="d-dexp"
                type="date"
                value={form.domain_expiry}
                onChange={(e) => setForm((f) => ({ ...f, domain_expiry: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-ctype">Customer type</Label>
              <Select
                value={form.customer_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, customer_type: v as "paying" | "non-paying" }))
                }
              >
                <SelectTrigger id="d-ctype">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paying">Paying</SelectItem>
                  <SelectItem value="non-paying">Non-Paying / Internal / Charity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned team members</Label>
            <div className="rounded-xl border border-border p-3 space-y-2 max-h-40 overflow-y-auto">
              {profiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team members yet.</p>
              ) : (
                profiles.map((p) => {
                  const checked = assignees.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setAssignees((prev) =>
                            v ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                          );
                        }}
                      />
                      <span>{p.name || p.email}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-notes">Notes</Label>
            <Textarea
              id="d-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.renewed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, renewed: !!v }))}
            />
            Mark as renewed (silences reminders)
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="rounded-full">
              {mutation.isPending ? "Saving…" : domain ? "Save changes" : "Add domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(d: Props["domain"]) {
  return {
    client_name: d?.client_name ?? "",
    domain: d?.domain ?? "",
    provider: d?.provider ?? "",
    domain_expiry: d?.domain_expiry ?? "",
    hosting_expiry: d?.hosting_expiry ?? "",
    notes: d?.notes ?? "",
    renewed: d?.renewed ?? false,
    customer_type: (d?.customer_type ?? "paying") as "paying" | "non-paying",
  };
}
