import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";

export const Route = createFileRoute("/projects/$projectId")({
  component: () => (
    <AuthGate>
      <ProjectDetailPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Project — Studio" }] }),
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
      <p className="font-display text-xl font-semibold">Project detail coming next</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Tasks, credentials, and details for project <code className="rounded bg-muted px-1.5">{projectId}</code> will live here.
      </p>
    </div>
  );
}
