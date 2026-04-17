import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, ListChecks } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { TaskDialog } from "@/components/TaskDialog";
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
import { pastelClasses, statusLabel, statusPillClasses, priorityClasses } from "@/lib/pastel";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <AuthGate>
      <TasksPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Tasks — Studio" }] }),
});

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "waiting" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  updated_at: string;
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
  const [editingTask, setEditingTask] = React.useState<TaskRow | null>(null);
  const [editingAssignees, setEditingAssignees] = React.useState<string[]>([]);

  const { data: tasks = [] } = useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,project_id,title,description,status,priority,due_date,updated_at")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
      return (data ?? []) as TaskRow[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name")
        .order("name");
      return data ?? [];
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
    () => new Map(members.map((m) => [m.id, m.name] as const)),
    [members],
  );

  const toggleDone = useMutation({
    mutationFn: async (t: TaskRow) => {
      const nextStatus = t.status === "done" ? "todo" : "done";
      const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", t.id);
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

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
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
  }, [tasks, tab, search, projectFilter, priorityFilter, assigneeFilter, assigneeMap, user]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Everything across the agency, in one place.
          </p>
        </div>
        <Button onClick={openNew} disabled={projects.length === 0} className="rounded-full">
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border bg-card p-3 shadow-soft">
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="mine">Assigned to me ({counts.mine})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.done})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-6">
          {grouped.length === 0 ? (
            <EmptyState onNew={openNew} hasProjects={projects.length > 0} />
          ) : (
            grouped.map(([pid, list]) => {
              const p = projectById.get(pid);
              return (
                <section key={pid} className="space-y-2">
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
                  <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
                    {list.map((t) => (
                      <TaskRowItem
                        key={t.id}
                        task={t}
                        names={(assigneeMap[t.id] ?? [])
                          .map((id) => memberById.get(id))
                          .filter(Boolean) as string[]}
                        onToggle={() => toggleDone.mutate(t)}
                        onEdit={() => openEdit(t)}
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
    </div>
  );
}

function TaskRowItem({
  task,
  names,
  onToggle,
  onEdit,
}: {
  task: TaskRow;
  names: string[];
  onToggle: () => void;
  onEdit: () => void;
}) {
  const done = task.status === "done";
  const overdue =
    !done && task.due_date ? new Date(task.due_date) < new Date(new Date().toDateString()) : false;
  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        className="h-5 w-5 rounded-md"
      />
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
            {task.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {names.length ? names.join(", ") : "Unassigned"}
            {task.due_date ? (
              <>
                {" · "}
                <span className={overdue ? "font-medium text-coral-ink" : ""}>
                  {overdue ? "Overdue " : "Due "}
                  {new Date(task.due_date).toLocaleDateString()}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses(task.priority)}`}
        >
          {task.priority}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(task.status)}`}
        >
          {statusLabel(task.status)}
        </span>
      </button>
    </li>
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
