import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

interface EmailLogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface EmailDiagnostics {
  checkedAt: string;
  sender: { senderDomain: string; fromDomain: string };
  state: {
    retry_after_until: string | null;
    batch_size: number;
    send_delay_ms: number;
    auth_email_ttl_minutes: number;
    transactional_email_ttl_minutes: number;
    updated_at: string;
  } | null;
  suppressed: Array<{ reason: string | null; source: string | null; created_at: string }>;
  summary: { total: number; sent: number; failed: number; suppressed: number; pending: number };
  logs: EmailLogRow[];
  provider: { available: boolean; events: Array<Record<string, unknown>>; error: string | null };
}

async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again");
  return session.access_token;
}

export function EmailActivityLog() {
  const { user } = useAuth();
  const [recipient, setRecipient] = React.useState(user?.email ?? "");
  const [trackedMessageId, setTrackedMessageId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user?.email && !recipient) setRecipient(user.email);
  }, [recipient, user?.email]);

  const { data = [], isLoading } = useQuery<EmailLogRow[], Error>({
    queryKey: ["email-send-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      // Dedup by message_id, keep latest row
      const seen = new Set<string>();
      return ((data ?? []) as EmailLogRow[]).filter((r) => {
        if (!r.message_id) return true;
        if (seen.has(r.message_id)) return false;
        seen.add(r.message_id);
        return true;
      });
    },
    refetchInterval: 30_000,
  });

  const diagnostics = useQuery<EmailDiagnostics>({
    queryKey: ["email-diagnostics", recipient, trackedMessageId],
    queryFn: async () => {
      const token = await getSessionToken();
      const params = new URLSearchParams();
      if (recipient.trim()) params.set("recipient", recipient.trim());
      if (trackedMessageId) params.set("messageId", trackedMessageId);
      const res = await fetch(`/api/email-debug?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load diagnostics");
      return json as EmailDiagnostics;
    },
    enabled: false,
  });

  const sendDiagnostic = useMutation({
    mutationFn: async () => {
      const token = await getSessionToken();
      const res = await fetch("/api/email-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientEmail: recipient.trim() || user?.email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.reason || "Failed to queue diagnostic email");
      }
      return json as { messageId: string; recipientEmail: string };
    },
    onSuccess: (result) => {
      setTrackedMessageId(result.messageId);
      toast.success(`Diagnostic email queued to ${result.recipientEmail}`);
      setTimeout(() => diagnostics.refetch(), 8_000);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to queue diagnostic email"),
  });

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
          <Mail className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Email activity</h2>
          <p className="text-xs text-muted-foreground">
            Last 100 emails. Useful to debug delivery issues and spot spikes.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="name@example.com"
            className="sm:flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => diagnostics.refetch()}
            disabled={diagnostics.isFetching}
          >
            {diagnostics.isFetching ? "Checking…" : "Run diagnostics"}
          </Button>
          <Button
            type="button"
            className="rounded-full"
            onClick={() => sendDiagnostic.mutate()}
            disabled={sendDiagnostic.isPending}
          >
            {sendDiagnostic.isPending ? "Sending…" : "Send diagnostic email"}
          </Button>
        </div>

        {trackedMessageId && (
          <p className="font-mono text-xs text-muted-foreground">Tracking message: {trackedMessageId}</p>
        )}

        {diagnostics.data && (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="space-y-1 rounded-2xl bg-card p-3">
              <p className="font-medium">Queue status</p>
              <p className="text-xs text-muted-foreground">
                Sent {diagnostics.data.summary.sent} · Pending {diagnostics.data.summary.pending} · Failed {diagnostics.data.summary.failed} · Suppressed {diagnostics.data.summary.suppressed}
              </p>
              <p className="text-xs text-muted-foreground">
                Rate limit: {diagnostics.data.state?.retry_after_until ? new Date(diagnostics.data.state.retry_after_until).toLocaleString() : "clear"}
              </p>
            </div>
            <div className="space-y-1 rounded-2xl bg-card p-3">
              <p className="font-medium">Provider trace</p>
              {diagnostics.data.provider.error ? (
                <p className="text-xs text-muted-foreground">{diagnostics.data.provider.error}</p>
              ) : diagnostics.data.provider.events.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {diagnostics.data.provider.events.length} provider event(s) found for this recipient.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No provider events found yet.</p>
              )}
            </div>
            {diagnostics.data.suppressed.length > 0 && (
              <div className="rounded-2xl bg-card p-3 md:col-span-2">
                <p className="font-medium">Suppression found</p>
                <p className="text-xs text-muted-foreground">
                  Latest reason: {diagnostics.data.suppressed[0]?.reason ?? "Unknown"}
                </p>
              </div>
            )}
            {diagnostics.data.provider.events.length > 0 && (
              <div className="rounded-2xl bg-card p-3 md:col-span-2">
                <p className="font-medium">Latest provider events</p>
                <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                  {diagnostics.data.provider.events.slice(0, 5).map((event, index) => (
                    <p key={`${String(event.messageId ?? event.event ?? index)}-${index}`}>
                      {String(event.date ?? event.ts ?? "")} {String(event.event ?? event.type ?? "event")} {String(event.reason ?? event.subject ?? "")}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No emails sent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Template</th>
                <th className="py-2 pr-4">To</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.template_name}</td>
                  <td className="py-2 pr-4">{r.recipient_email}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      variant={
                        r.status === "sent"
                          ? "default"
                          : r.status === "failed" || r.status === "dlq"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                    {r.error_message && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.error_message}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
