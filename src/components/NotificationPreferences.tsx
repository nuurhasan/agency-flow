import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Prefs = {
  user_id: string;
  mode: "instant" | "digest" | "off";
  digest_frequency: "hourly" | "daily";
  digest_hour: number;
  event_task_assigned: boolean;
  event_task_status_changed: boolean;
  event_task_comment: boolean;
  event_task_mention: boolean;
  event_task_due_soon: boolean;
  event_project_update: boolean;
  event_client_approval: boolean;
};

const EVENT_LABELS: Array<{ key: keyof Prefs; label: string; hint?: string }> = [
  { key: "event_task_assigned", label: "Task assigned to me" },
  { key: "event_task_status_changed", label: "Status changes on my tasks" },
  { key: "event_task_comment", label: "New comments on my tasks" },
  { key: "event_task_mention", label: "Mentions (@you)", hint: "Always instant" },
  { key: "event_task_due_soon", label: "Due / overdue reminders" },
  { key: "event_client_approval", label: "Awaiting client approval", hint: "Always instant" },
  { key: "event_project_update", label: "Project updates" },
];

export function NotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notification-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Prefs | null;
    },
  });

  const [local, setLocal] = React.useState<Prefs | null>(null);
  React.useEffect(() => {
    if (data) setLocal(data);
    else if (user)
      setLocal({
        user_id: user.id,
        mode: "instant",
        digest_frequency: "daily",
        digest_hour: 9,
        event_task_assigned: true,
        event_task_status_changed: true,
        event_task_comment: true,
        event_task_mention: true,
        event_task_due_soon: true,
        event_project_update: true,
        event_client_approval: true,
      });
  }, [data, user]);

  const save = useMutation({
    mutationFn: async () => {
      if (!local || !user) return;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ ...local, user_id: user.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification settings saved");
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading || !local) {
    return (
      <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) =>
    setLocal((p) => (p ? { ...p, [k]: v } : p));

  return (
    <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint text-mint-ink">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Email notifications</h2>
          <p className="text-xs text-muted-foreground">
            Choose how often you want to hear from us.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Delivery mode</Label>
          <Select
            value={local.mode}
            onValueChange={(v) => set("mode", v as Prefs["mode"])}
          >
            <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="instant">Instant — one email per event</SelectItem>
              <SelectItem value="digest">Digest — batched summary</SelectItem>
              <SelectItem value="off">Off — no emails</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {local.mode === "digest" && (
          <>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select
                value={local.digest_frequency}
                onValueChange={(v) =>
                  set("digest_frequency", v as Prefs["digest_frequency"])
                }
              >
                <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Every hour</SelectItem>
                  <SelectItem value="daily">Once a day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {local.digest_frequency === "daily" && (
              <div className="space-y-1.5">
                <Label>Send at</Label>
                <Select
                  value={String(local.digest_hour)}
                  onValueChange={(v) => set("digest_hour", parseInt(v, 10))}
                >
                  <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h.toString().padStart(2, "0")}:00 UTC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>

      {local.mode !== "off" && (
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">Event types</p>
          <div className="space-y-3">
            {EVENT_LABELS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor={key} className="cursor-pointer">
                    {label}
                  </Label>
                  {hint && (
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  )}
                </div>
                <Switch
                  id={key}
                  checked={local[key] as boolean}
                  onCheckedChange={(v) => set(key, v as never)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full"
        >
          {save.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </section>
  );
}
