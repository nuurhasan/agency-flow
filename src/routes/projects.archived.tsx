import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pastelClasses } from "@/lib/pastel";

export const Route = createFileRoute("/projects/archived")({
  component: () => (
    <AuthGate>
      <ArchivedProjectsPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Archived Projects — Studio" }] }),
});

function ArchivedProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-archived"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name,service_type,description,due_date,updated_at")
        .eq("status", "archived")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const unarchive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("projects")
        .update({ status: "active" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project restored");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to restore"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All projects
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Archived projects</h1>
          <p className="mt-1 text-muted-foreground">
            Projects you've put away. Restore any to bring it back into the active workspace.
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-16 text-center">
          <p className="font-display text-lg font-semibold">Nothing archived</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Archived projects will show up here. They stay out of the dashboard, lists, and tasks views until you restore them.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-pop"
            >
              <button
                type="button"
                onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: p.id } })}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${pastelClasses(p.color)} text-lg font-bold opacity-70`}
                >
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.client_name || "No client"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {p.service_type}
                </span>
              </button>
              {p.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-4 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => unarchive.mutate(p.id)}
                  disabled={unarchive.isPending}
                >
                  <ArchiveRestore className="h-4 w-4" /> Unarchive
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
