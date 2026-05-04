import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export function EmailActivityLog() {
  const { data, isLoading } = useQuery({
    queryKey: ["email-send-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
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
