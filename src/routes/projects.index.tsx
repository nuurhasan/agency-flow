import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as React from "react";
import { Activity, Archive, FolderKanban, LayoutGrid, Plus, Search, Users2, Zap } from "lucide-react";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ActivityFeed } from "@/components/ActivityFeed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projects — Studio" }] }),
});

function ProjectsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [service, setService] = React.useState<string>("all");
  const [groupByClient, setGroupByClient] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("turgon.projects.groupByClient") === "1";
  });
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("turgon.projects.groupByClient", groupByClient ? "1" : "0");
    }
  }, [groupByClient]);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-list"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["projects-list-tasks"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["active-sprints"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["all-tasks"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["dash-projects"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["dash-counters"], refetchType: "all" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type,due_date,description")
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: activeSprints = [] } = useQuery({
    queryKey: ["active-sprints"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sprints")
        .select("id,project_id,name")
        .eq("status", "active");
      return data ?? [];
    },
  });
  const activeSprintByProject = React.useMemo(
    () => new Map(activeSprints.map((s) => [s.project_id, s])),
    [activeSprints],
  );

  const projectIds = React.useMemo(() => (projects ?? []).map((p) => p.id), [projects]);

  const { data: taskData } = useQuery({
    queryKey: ["projects-list-tasks", projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select("id,project_id,title,status,updated_at")
        .in("project_id", projectIds)
        .order("updated_at", { ascending: false });
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

      return { tasks, assigneesByTask, projectPeopleByProject };
    },
  });

  type DashTask = NonNullable<typeof taskData>["tasks"][number];
  const tasksByProject = React.useMemo(() => {
    return (taskData?.tasks ?? []).reduce<Record<string, DashTask[]>>((acc, t) => {
      (acc[t.project_id] ??= []).push(t);
      return acc;
    }, {});
  }, [taskData]);

  const filtered = (projects ?? []).filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (service !== "all" && p.service_type !== service) return false;
    if (q && !`${p.name} ${p.client_name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-mint-ink">
              <FolderKanban className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Projects</h1>
              <p className="text-sm text-muted-foreground">All client work, in one colorful place.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/projects/archived">
                <Archive className="h-4 w-4" /> Archived
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)} className="rounded-full shadow-pop">
              <Plus className="h-4 w-4" /> New project
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All projects</TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-6">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects or clients…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["planning", "active", "on_hold", "completed"].map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Service" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {["website", "seo", "hosting", "maintenance", "branding", "other"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 p-16 text-center">
              <p className="font-display text-lg font-semibold">No projects match</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Try clearing filters, or create a new project to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p, idx) => {
                const allTasks = tasksByProject[p.id] ?? [];
                const ts = allTasks.slice(0, 3);
                const total = allTasks.length;
                const done = allTasks.filter((t) => t.status === "done").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const people = taskData?.projectPeopleByProject?.[p.id] ?? [];
                const sprint = activeSprintByProject.get(p.id);
                return (
                  <div
                    key={p.id}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    className="group gradient-sheen relative animate-fade-in-up overflow-hidden rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-glow hover:border-primary/30"
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
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
                          {sprint && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-medium text-mint-ink">
                              <Zap className="h-2.5 w-2.5" /> {sprint.name}
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
                              {taskData?.assigneesByTask[t.id]?.[0] && (
                                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                                  {taskData.assigneesByTask[t.id][0].split(" ")[0]}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {p.due_date && (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Due {new Date(p.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityFeed
            limit={50}
            emptyText="No activity yet across your projects — assign or update a task to start the feed."
          />
        </TabsContent>
      </Tabs>

      <ProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
