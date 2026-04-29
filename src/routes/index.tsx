import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CheckCircle2, FolderKanban, Plus, TrendingUp } from "lucide-react";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { ProjectDialog } from "@/components/ProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AvatarStack } from "@/components/ui/avatar-stack";

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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);

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

      // Project-level assignees (union of all task assignees per project)
      const projectAssignees = (assignRows ?? []).reduce<Record<string, Set<string>>>((acc, a) => {
        const t = tasks.find((tk) => tk.id === a.task_id);
        if (!t) return acc;
        (acc[t.project_id] ??= new Set()).add(a.user_id);
        return acc;
      }, {});
      const projectPeopleByProject: Record<string, { id: string; name: string }[]> = {};
      Object.entries(projectAssignees).forEach(([pid, set]) => {
        projectPeopleByProject[pid] = Array.from(set)
          .map((uid) => ({ id: uid, name: profMap.get(uid) ?? "?" }))
          .filter((p) => p.name !== "?");
      });

      return { projects, tasks, assigneesByTask, projectPeopleByProject };
    },
  });

  type DashTask = NonNullable<typeof dash>["tasks"][number];
  const tasksByProject = (dash?.tasks ?? []).reduce<Record<string, DashTask[]>>((acc, t) => {
    (acc[t.project_id] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="hero-gradient relative overflow-hidden rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{todayLabel()}</p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
              {greeting()} ✦
            </h1>
            <p className="mt-1 text-muted-foreground">
              Everything happening across the agency, at a glance.
            </p>
          </div>
          <Button onClick={() => setNewProjectOpen(true)} className="rounded-full shadow-pop" size="lg">
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      </div>
      <ProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Counter to="/projects" color="brand" icon={<FolderKanban />} label="Active projects" value={counters?.active ?? 0} />
        <Counter to="/tasks" color="brand" icon={<TrendingUp />} label="Tasks in progress" value={counters?.inProgress ?? 0} />
        <Counter to="/tasks" color="brand" icon={<CheckCircle2 />} label="Completed (7d)" value={counters?.completed ?? 0} />
      </div>

      <div>
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
            cta={{ label: "Create a project", onClick: () => setNewProjectOpen(true) }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dash.projects.map((p, idx) => {
                const allTasks = tasksByProject[p.id] ?? [];
                const ts = allTasks.slice(0, 3);
                const total = allTasks.length;
                const done = allTasks.filter((t) => t.status === "done").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const people = dash.projectPeopleByProject?.[p.id] ?? [];
                return (
                  <div
                    key={p.id}
                    style={{ animationDelay: `${idx * 50}ms` }}
                    className="group animate-fade-in-up rounded-3xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
                  >
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="flex items-start gap-3"
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-bold ring-0 transition-all group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-card ${pastelClasses(p.color)} ring-current/30`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold">{p.name}</p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {p.service_type}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="truncate text-xs text-muted-foreground">
                            {p.client_name || "No client"}
                          </p>
                          {p.status !== "active" && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusPillClasses(p.status)}`}
                            >
                              {statusLabel(p.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Progress */}
                    <div className="mt-4 flex items-center gap-3">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {done}/{total}
                      </span>
                      <AvatarStack people={people} max={3} size="xs" />
                    </div>

                    <div className="mt-3 space-y-0.5">
                      {ts.length === 0 ? (
                        <p className="px-1.5 py-1 text-xs italic text-muted-foreground">No tasks yet</p>
                      ) : (
                        ts.map((t) => {
                          const tdone = t.status === "done";
                          return (
                            <div
                              key={t.id}
                              className={`group/task relative flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-all ${tdone ? "opacity-60" : ""}`}
                            >
                              <span className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-muted/50 opacity-0 transition-all duration-200 group-hover/task:opacity-100" />
                              <Checkbox
                                checked={tdone}
                                onCheckedChange={() =>
                                  toggleDone.mutate({
                                    id: t.id,
                                    project_id: t.project_id,
                                    title: t.title,
                                    status: t.status,
                                  })
                                }
                                aria-label={tdone ? "Mark as not done" : "Mark as done"}
                                className="h-4 w-4 rounded"
                              />
                              <span className={`min-w-0 flex-1 truncate ${tdone ? "text-muted-foreground line-through" : ""}`}>
                                {t.title}
                              </span>
                              {dash.assigneesByTask[t.id]?.[0] && (
                                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                                  {dash.assigneesByTask[t.id][0].split(" ")[0]}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

function Counter({
  color,
  icon,
  label,
  value,
  to,
}: {
  color: "mint" | "sky" | "lavender" | "peach" | "butter" | "blush" | "coral" | "brand";
  icon: React.ReactNode;
  label: string;
  value: number;
  to: "/projects" | "/tasks" | "/domains" | "/team" | "/settings" | "/vault" | "/";
}) {
  const tints: Record<string, string> = {
    mint: "from-mint/70 to-mint/30 text-mint-ink",
    sky: "from-sky/70 to-sky/30 text-sky-ink",
    lavender: "from-lavender/70 to-lavender/30 text-lavender-ink",
    peach: "from-peach/70 to-peach/30 text-peach-ink",
    butter: "from-butter/80 to-butter/30 text-butter-ink",
    blush: "from-blush/70 to-blush/30 text-blush-ink",
    coral: "from-coral/70 to-coral/30 text-coral-ink",
    brand: "from-[#DBFDA5] to-[#EAFEC9] text-lime-ink",
  };
  const iconBg: Record<string, string> = {
    mint: "bg-white/60 text-mint-ink",
    sky: "bg-white/60 text-sky-ink",
    lavender: "bg-white/60 text-lavender-ink",
    peach: "bg-white/60 text-peach-ink",
    butter: "bg-white/60 text-butter-ink",
    blush: "bg-white/60 text-blush-ink",
    coral: "bg-white/60 text-coral-ink",
    brand: "bg-white/70 text-lime-ink",
  };
  return (
    <Link
      to={to}
      className={`group block rounded-3xl border border-border/50 bg-gradient-to-br p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-pop ${tints[color]}`}
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl backdrop-blur-sm ${iconBg[color]}`}>
          {icon}
        </span>
        <span className="font-display text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold opacity-80">{label}</p>
    </Link>
  );
}

function EmptyCard({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { to: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {cta && ("to" in cta ? (
        <Button asChild className="mt-4 rounded-full">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      ) : (
        <Button onClick={cta.onClick} className="mt-4 rounded-full">{cta.label}</Button>
      ))}
    </div>
  );
}

