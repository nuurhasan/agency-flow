import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { TaskDialog } from "@/components/TaskDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";

export const Route = createFileRoute("/projects/$projectId")({
  component: () => (
    <AuthGate>
      <ProjectDetailPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Project — Studio" }] }),
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

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskRow | null>(null);
  const [editingAssignees, setEditingAssignees] = React.useState<string[]>([]);

  const toggleDone = useMutation({
    mutationFn: async (t: TaskRow) => {
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

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type,description,due_date")
        .eq("id", projectId)
        .maybeSingle();
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,project_id,title,description,status,priority,due_date,updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      return (data ?? []) as TaskRow[];
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
    queryKey: ["project-task-assignees", projectId, taskIds.join(",")],
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

  const memberById = new Map(members.map((m) => [m.id, m.name] as const));
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

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

  if (!project) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="font-display text-lg font-semibold">Project not found</p>
        <Button asChild variant="ghost" className="mt-3">
          <Link to="/projects"><ArrowLeft className="h-4 w-4" /> Back to projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="flex flex-wrap items-start gap-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${pastelClasses(project.color)} text-xl font-bold`}>
          {project.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{project.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(project.status)}`}>
              {statusLabel(project.status)}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {project.service_type}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.client_name || "No client"}
            {project.due_date ? ` · Due ${new Date(project.due_date).toLocaleDateString()}` : ""}
          </p>
          {project.description && (
            <p className="mt-3 text-sm text-foreground/80">{project.description}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Tasks</h2>
          <Button onClick={openNew} className="rounded-full">
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
            <p className="font-display text-lg font-semibold">No tasks yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create the first task to start tracking work for this project.
            </p>
            <Button onClick={openNew} className="mt-4 rounded-full">
              <Plus className="h-4 w-4" /> Add a task
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="open">
            <TabsList>
              <TabsTrigger value="open">Open ({openTasks.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({doneTasks.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="open" className="mt-4">
              <TaskList
                tasks={openTasks}
                assigneeMap={assigneeMap}
                memberById={memberById}
                onToggle={(t) => toggleDone.mutate(t)}
                onEdit={openEdit}
              />
            </TabsContent>
            <TabsContent value="completed" className="mt-4">
              <TaskList
                tasks={doneTasks}
                assigneeMap={assigneeMap}
                memberById={memberById}
                onToggle={(t) => toggleDone.mutate(t)}
                onEdit={openEdit}
                emptyText="No completed tasks yet."
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        projectId={projectId}
        task={editingTask}
        members={members}
        initialAssignees={editingAssignees}
      />
    </div>
  );
}

function priorityPill(p: "low" | "medium" | "high") {
  switch (p) {
    case "high":
      return "bg-coral text-coral-ink";
    case "medium":
      return "bg-butter text-butter-ink";
    default:
      return "bg-muted text-muted-foreground";
  }
}
