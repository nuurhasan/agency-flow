import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as React from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AuthGate>
      <SettingsPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Settings — Studio" }] }),
});

function SettingsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });

  const [agencyName, setAgencyName] = React.useState("");
  const [leadDays, setLeadDays] = React.useState(30);
  const [signupsEnabled, setSignupsEnabled] = React.useState(true);

  React.useEffect(() => {
    if (settings) {
      setAgencyName(settings.agency_name);
      setLeadDays(settings.reminder_lead_days);
      setSignupsEnabled(settings.signups_enabled);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ agency_name: agencyName, reminder_lead_days: leadDays, signups_enabled: signupsEnabled })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="font-display text-lg font-semibold">Admins only</p>
        <p className="mt-1 text-sm text-muted-foreground">Ask an admin to manage agency settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-butter text-butter-ink">
            <SettingsIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Agency-wide configuration.</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="space-y-1.5">
          <Label htmlFor="agency-name">Agency name</Label>
          <Input id="agency-name" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-days">Reminder lead time (days before expiry)</Label>
          <Input
            id="lead-days"
            type="number"
            min={1}
            max={180}
            value={leadDays}
            onChange={(e) => setLeadDays(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            How many days before a domain expires to start sending reminders. Reminders repeat every 5 days.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4">
          <div>
            <p className="font-medium">Allow new signups</p>
            <p className="text-xs text-muted-foreground">
              Once your team is in, switch this off to prevent strangers from joining.
            </p>
          </div>
          <Switch checked={signupsEnabled} onCheckedChange={setSignupsEnabled} />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full">
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
