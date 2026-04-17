import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";

export const Route = createFileRoute("/hosting")({
  component: () => (
    <AuthGate>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Hosting & Clients</h1>
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
          <p className="font-display text-lg font-semibold">Coming up next</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Domain management with expiry reminders (1 month out, then every 5 days) is coming next.
          </p>
        </div>
      </div>
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Hosting & Clients — Studio" }] }),
});
