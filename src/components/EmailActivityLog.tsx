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
  metadata: { provider_message_id?: string | null } | null;
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

  const { data, isLoading } = useQuery<EmailLogRow[]>({
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
      return (data ?? []).filter((r) => {
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
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
