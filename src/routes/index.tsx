import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, FolderKanban, Plus, TrendingUp } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/")({
  component: DashboardRoute,
  head: () => ({ meta: [{ title: "Dashboard — Studio" }] }),
});

function DashboardRoute() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const toggleDone = useMutation({
    mutationFn: async (t: { id: string; project_id: string; title: string; status: string }) => {
      const nextStatus = t.status === "done" ? "todo" : "done";
      const { error } = await supabase
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", t.id);
      if (error) throw error;
      if (user) {
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          task_id: t.id,
          project_id: t.project_id,
          action: nextStatus === "done" ? "task.completed" : "task.updated",
          meta: { title: t.title },
        });
      }
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: counters } = useQuery({
    queryKey: ["dash-counters"],
    queryFn: async () => {
      const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [a, b, c] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "done")
          .gte("completed_at", sevenAgo),
      ]);
      return {
        active: a.count ?? 0,
        inProgress: b.count ?? 0,
        completed: c.count ?? 0,
      };
    },
  });

  const { data: dash } = useQuery({
    queryKey: ["dash-projects"],
    queryFn: async () => {
      const { data: projs } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(9);
      const projects = projs ?? [];
      const ids = projects.map((p) => p.id);

      const { data: taskRows } = ids.length
        ? await supabase
            .from("tasks")
            .select("id,project_id,title,status,updated_at")
            .in("project_id", ids)
            .order("updated_at", { ascending: false })
        : { data: [] };
      const tasks = taskRows ?? [];

      const taskIds = tasks.map((t) => t.id);
      const { data: assignRows } = taskIds.length
        ? await supabase.from("task_assignees").select("task_id,user_id").in("task_id", taskIds)
        : { data: [] };
      const userIds = Array.from(new Set((assignRows ?? []).map((a) => a.user_id)));
      const { data: profRows } = userIds.length
        ? await supabase.from("profiles").select("id,name").in("id", userIds)
        : { data: [] };
      const profMap = new Map((profRows ?? []).map((p) => [p.id, p.name] as const));
      const assigneesByTask = (assignRows ?? []).reduce<Record<string, string[]>>((acc, a) => {
        const name = profMap.get(a.user_id);
        if (!name) return acc;
        (acc[a.task_id] ??= []).push(name);
        return acc;
      }, {});

      return { projects, tasks, assigneesByTask };
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["dash-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("id,action,meta,created_at,actor_id")
        .order("created_at", { ascending: false })
        .limit(12);
      const rows = data ?? [];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
      const { data: profs } = actorIds.length
        ? await supabase.from("profiles").select("id,name").in("id", actorIds)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p.name] as const));
      return rows.map((r) => ({ ...r, actorName: r.actor_id ? map.get(r.actor_id) ?? null : null }));
    },
  });



  type DashTask = NonNullable<typeof dash>["tasks"][number];
  const tasksByProject = (dash?.tasks ?? []).reduce<Record<string, DashTask[]>>((acc, t) => {
    (acc[t.project_id] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Hey there ✦</h1>
          <p className="mt-1 text-muted-foreground">
            Everything happening across the agency, at a glance.
          </p>
        </div>
        <Button asChild className="rounded-full" size="lg">
          <Link to="/projects">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Counter color="mint" icon={<FolderKanban />} label="Active projects" value={counters?.active ?? 0} />
        <Counter color="sky" icon={<TrendingUp />} label="Tasks in progress" value={counters?.inProgress ?? 0} />
        <Counter color="lavender" icon={<CheckCircle2 />} label="Completed (7d)" value={counters?.completed ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Projects</h2>
            <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          {!dash?.projects.length ? (
            <EmptyCard
              title="No projects yet"
              body="Create your first project to start tracking work for a client."
              cta={{ to: "/projects", label: "Create a project" }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {dash.projects.map((p) => {
                const ts = (tasksByProject[p.id] ?? []).slice(0, 3);
                return (
                  <Link
                    key={p.id}
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="group rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-pop"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${pastelClasses(p.color)} font-bold`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold">{p.name}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(p.status)}`}
                          >
                            {statusLabel(p.status)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.client_name || "No client"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {ts.length === 0 ? (
                        <p className="text-xs italic text-muted-foreground">No tasks yet</p>
                      ) : (
                        ts.map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{t.title}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {dash.assigneesByTask[t.id]?.[0] && (
                                <span className="text-[11px] text-muted-foreground">
                                  {dash.assigneesByTask[t.id][0].split(" ")[0]}
                                </span>
                              )}
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusPillClasses(t.status)}`}>
                                {statusLabel(t.status)}
                              </span>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Activity</h2>
            {!activity?.length ? (
              <p className="text-sm text-muted-foreground">
                No activity yet — assign a task to start the feed.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lavender" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
                        <span className="text-muted-foreground">
                          {humanAction(a.action, (a.meta as Record<string, unknown> | null) ?? null)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Counter({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pastelClasses(color)}`}>
          {icon}
        </span>
        <span className="font-display text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyCard({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {cta && (
        <Button asChild className="mt-4 rounded-full">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}

function humanAction(action: string, meta: Record<string, unknown> | null): string {
  switch (action) {
    case "task.created":
      return `created task "${meta?.title ?? ""}"`;
    case "task.completed":
      return `completed task "${meta?.title ?? ""}"`;
    case "task.updated":
      return `updated task "${meta?.title ?? ""}"`;
    case "task.assigned":
      return `assigned a task`;
    case "task.commented":
      return `commented on a task`;
    case "project.created":
      return `created project "${meta?.name ?? ""}"`;
    case "project.updated":
      return `updated project "${meta?.name ?? ""}"`;
    case "domain.renewed":
      return `marked ${meta?.domain ?? "a domain"} as renewed`;
    default:
      return action;
  }
}
