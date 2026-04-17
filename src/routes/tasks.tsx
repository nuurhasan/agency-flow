import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <AuthGate>
      <Placeholder title="Tasks" body="Global task list with filters, assignment, and email notifications is coming next." />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Tasks — Studio" }] }),
});

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="font-display text-lg font-semibold">Coming up next</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
