import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, ListChecks, Sparkles, X, CheckSquare } from "lucide-react";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { pastelClasses, priorityClasses } from "@/lib/pastel";
import { TaskStatusDropdown } from "@/components/TaskStatusDropdown";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { DueDatePill } from "@/components/ui/due-date-pill";
import { invalidateTaskData } from "@/lib/queryInvalidation";

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tasks — Studio" }] }),
});

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  updated_at: string;
  sprint_id: string | null;
};

const COLOR_BAR: Record<string, string> = {
  mint: "bg-mint",
  peach: "bg-peach",
  lavender: "bg-lavender",
  sky: "bg-sky",
  butter: "bg-butter",
  blush: "bg-blush",
  coral: "bg-coral",
};

function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");
  const [tab, setTab] = React.useState<"open" | "completed" | "mine">("open");

  const [taskOpen, setTaskOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewingTask, setViewingTask] = React.useState<TaskRow | null>(null);
  const [editingTask, setEditingTask] = React.useState<TaskRow | null>(null);
  const [editingAssignees, setEditingAssignees] = React.useState<string[]>([]);

  const { data: tasks = [] } = useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,project_id,title,description,status,priority,due_date,updated_at,sprint_id")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
      return (data ?? []) as TaskRow[];
    },
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ["sprints-min", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("sprints").select("id,name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status")
        .neq("status", "archived")
        .order("name");
      return (data ?? []) as { id: string; name: string; color: string; client_name: string; status: string }[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name").order("name");
      return data ?? [];
    },
  });

  const taskIds = tasks.map((t) => t.id);
  const { data: assigneeMap = {} } = useQuery({
    queryKey: ["all-task-assignees", taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_assignees")
        .select("task_id,user_id")
        .in("task_id", taskIds);
      return (data ?? []).reduce<Record<string, string[]>>((acc, r) => {
        (acc[r.task_id] ??= []).push(r.user_id);
        return acc;
      }, {});
    },
  });

  const projectById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );
  const memberById = React.useMemo(
    () => new Map(members.map((m) => [m.id, m] as const)),
    [members],
  );
  const sprintById = React.useMemo(
    () => new Map(sprints.map((s) => [s.id, s] as const)),
    [sprints],
  );

  const toggleDone = useMutation({
    mutationFn: async (vars: { task: TaskRow; nextStatus: TaskRow["status"] }) => {
      const { task: t, nextStatus } = vars;
      if (t.status === nextStatus) return;
      const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", t.id);
      if (error) throw error;
      if (user) {
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          task_id: t.id,
          project_id: t.project_id,
          action: nextStatus === "done" ? "task.completed" : "task.updated",
          meta: { title: t.title, status: nextStatus },
        });
      }
    },
    onSuccess: (_data, vars) => invalidateTaskData(qc, vars.task.project_id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!projectById.has(t.project_id)) return false;
      if (tab === "open" && t.status === "done") return false;
      if (tab === "completed" && t.status !== "done") return false;
      if (tab === "mine") {
        if (!user) return false;
        const ids = assigneeMap[t.id] ?? [];
        if (!ids.includes(user.id)) return false;
        if (t.status === "done") return false;
      }
      if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all") {
        const ids = assigneeMap[t.id] ?? [];
        if (assigneeFilter === "unassigned" ? ids.length > 0 : !ids.includes(assigneeFilter))
          return false;
      }
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, tab, search, projectFilter, priorityFilter, assigneeFilter, assigneeMap, user, projectById]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    filtered.forEach((t) => {
      const arr = map.get(t.project_id) ?? [];
      arr.push(t);
      map.set(t.project_id, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const an = projectById.get(a[0])?.name ?? "";
      const bn = projectById.get(b[0])?.name ?? "";
      return an.localeCompare(bn);
    });
  }, [filtered, projectById]);

  const counts = React.useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const mine = user
      ? tasks.filter(
          (t) => t.status !== "done" && (assigneeMap[t.id] ?? []).includes(user.id),
        ).length
      : 0;
    return { open, done, mine };
  }, [tasks, assigneeMap, user]);

  const openNew = () => {
    setEditingTask(null);
    setEditingAssignees([]);
    setTaskOpen(true);
  };

  const openEdit = (t: TaskRow) => {
    setEditingTask(t);
    setEditingAssignees(assigneeMap[t.id] ?? []);
    setTaskOpen(true);
  };

  const openView = (t: TaskRow) => {
    setViewingTask(t);
    setViewOpen(true);
  };

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (projectFilter !== "all") {
    activeFilters.push({
      key: "project",
      label: `Project: ${projectById.get(projectFilter)?.name ?? "—"}`,
      clear: () => setProjectFilter("all"),
    });
  }
  if (assigneeFilter !== "all") {
    activeFilters.push({
      key: "assignee",
      label:
        assigneeFilter === "unassigned"
          ? "Unassigned"
          : `Assignee: ${memberById.get(assigneeFilter)?.name ?? "—"}`,
      clear: () => setAssigneeFilter("all"),
    });
  }
  if (priorityFilter !== "all") {
    activeFilters.push({
      key: "priority",
      label: `Priority: ${priorityFilter}`,
      clear: () => setPriorityFilter("all"),
    });
  }
  if (search.trim()) {
    activeFilters.push({
      key: "search",
      label: `“${search.trim()}”`,
      clear: () => setSearch(""),
    });
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral text-coral-ink">
              <CheckSquare className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Tasks</h1>
              <p className="text-sm text-muted-foreground">
                Everything across the agency, in one place.
              </p>
            </div>
          </div>
          <Button onClick={openNew} disabled={projects.length === 0} className="rounded-full shadow-pop">
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-2 z-20 -mx-1 space-y-2 px-1">
        <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border bg-card/80 p-3 shadow-soft backdrop-blur-md">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-9"
            />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={f.clear}
                className="group inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium shadow-soft transition-colors hover:bg-muted"
              >
                {f.label}
                <X className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            ))}
            <button
              onClick={() => {
                setProjectFilter("all");
                setAssigneeFilter("all");
                setPriorityFilter("all");
                setSearch("");
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="mine">Assigned to me ({counts.mine})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.done})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-6">
          {grouped.length === 0 ? (
            tab === "open" && counts.open === 0 && tasks.length > 0 ? (
              <InboxZero />
            ) : (
              <EmptyState onNew={openNew} hasProjects={projects.length > 0} />
            )
          ) : (
            grouped.map(([pid, list], gIdx) => {
              const p = projectById.get(pid);
              return (
                <section
                  key={pid}
                  style={{ animationDelay: `${gIdx * 40}ms` }}
                  className="animate-fade-in-up space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${pastelClasses(p?.color)} text-xs font-bold`}
                    >
                      {(p?.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: pid }}
                      className="font-display text-base font-semibold hover:underline"
                    >
                      {p?.name ?? "Unknown project"}
                    </Link>
                    {p?.client_name && (
                      <span className="text-xs text-muted-foreground">· {p.client_name}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {list.length} task{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
                    {list.map((t) => (
                      <TaskRowItem
                        key={t.id}
                        task={t}
                        projectColor={p?.color ?? "lavender"}
                        sprintName={t.sprint_id ? sprintById.get(t.sprint_id)?.name ?? null : null}
                        people={(assigneeMap[t.id] ?? [])
                          .map((id) => memberById.get(id))
                          .filter(Boolean) as { id: string; name: string }[]}
                        onComplete={() => toggleDone.mutate({ task: t, nextStatus: "done" })}
                        onReopen={() => toggleDone.mutate({ task: t, nextStatus: "todo" })}
                        onChangeStatus={(next) => toggleDone.mutate({ task: t, nextStatus: next })}
                        onEdit={() => openView(t)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        task={editingTask}
        members={members}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        initialAssignees={editingAssignees}
      />
      <TaskDetailDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        task={viewingTask}
        projectName={viewingTask ? projectById.get(viewingTask.project_id)?.name : undefined}
        members={members}
        assignees={
          viewingTask
            ? (assigneeMap[viewingTask.id] ?? [])
                .map((id) => memberById.get(id))
                .filter(Boolean) as { id: string; name: string }[]
            : []
        }
        onEdit={() => viewingTask && openEdit(viewingTask)}
      />
    </div>
  );
}

function TaskRowItem({
  task,
  projectColor,
  sprintName,
  people,
  onComplete,
  onReopen,
  onChangeStatus,
  onEdit,
}: {
  task: TaskRow;
  projectColor: string;
  sprintName?: string | null;
  people: { id: string; name: string }[];
  onComplete: () => void;
  onReopen: () => void;
  onChangeStatus: (next: TaskRow["status"]) => void;
  onEdit: () => void;
}) {
  const serverDone = task.status === "done";
  // Optimistic completion overlay: lets us show strikethrough → linger → fade out
  // BEFORE the row is removed from the list by the query refetch.
  const [completing, setCompleting] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  const showAsDone = serverDone || completing;

  const handleToggle = (checked: boolean | "indeterminate") => {
    if (serverDone) {
      // Re-opening a completed task: just flip immediately.
      onReopen();
      return;
    }
    if (checked === true && !completing) {
      // 1. Mark as done locally (strikethrough appears)
      setCompleting(true);
      // 2. Linger ~2s so user sees the completion state
      setTimeout(() => setLeaving(true), 1800);
      // 3. After fade/collapse animation finishes, persist to DB
      setTimeout(() => {
        onComplete();
        // setCompleting/setLeaving are reset implicitly: row unmounts on refetch
      }, 2250);
    }
  };

  return (
    <li
      className={`group relative flex items-center gap-3 py-3 pl-5 pr-5 transition-colors hover:bg-muted/40 ${leaving ? "animate-slide-out-left" : ""}`}
    >
      <span
        className={`absolute inset-y-2 left-0 w-1 rounded-r ${COLOR_BAR[projectColor] ?? "bg-lavender"}`}
        aria-hidden
      />
      <Checkbox
        checked={showAsDone}
        onCheckedChange={handleToggle}
        aria-label={showAsDone ? "Mark as not done" : "Mark as done"}
        className="h-5 w-5 rounded-md transition-transform active:scale-90"
      />
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium transition-all duration-300 ${showAsDone ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </p>
          <div className={`mt-1 flex flex-wrap items-center gap-2 transition-opacity duration-300 ${showAsDone ? "opacity-60" : ""}`}>
            {people.length ? (
              <AvatarStack people={people} max={3} size="xs" />
            ) : (
              <span className="text-xs italic text-muted-foreground">Unassigned</span>
            )}
            <DueDatePill date={task.due_date} done={showAsDone} />
            {sprintName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-lavender-ink/20 bg-lavender px-2 py-0.5 text-[11px] font-semibold text-lavender-ink shadow-soft">
                <Sparkles className="h-3 w-3" />
                Sprint · {sprintName}
              </span>
            )}
          </div>
        </div>
        {task.priority === "high" && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${priorityClasses(task.priority)} ${showAsDone ? "opacity-50" : ""}`}
          >
            High
          </span>
        )}
      </button>
      <TaskStatusDropdown
        status={showAsDone ? "done" : task.status}
        onChange={onChangeStatus}
        disabled={completing || leaving}
        className={showAsDone ? "opacity-80" : ""}
      />
    </li>
  );
}

function InboxZero() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-mint-ink">
        <Sparkles className="h-7 w-7" />
      </span>
      <p className="mt-3 font-display text-xl font-semibold">Inbox zero ✨</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Every open task is done. Take a breath — or queue up the next thing.
      </p>
    </div>
  );
}

function EmptyState({ onNew, hasProjects }: { onNew: () => void; hasProjects: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
        <ListChecks className="h-6 w-6" />
      </span>
      <p className="mt-3 font-display text-lg font-semibold">Nothing matches</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {hasProjects
          ? "Try adjusting your filters, or add a new task."
          : "Create a project first, then add tasks to it."}
      </p>
      {hasProjects && (
        <Button onClick={onNew} className="mt-4 rounded-full">
          <Plus className="h-4 w-4" /> New task
        </Button>
      )}
    </div>
  );
}
