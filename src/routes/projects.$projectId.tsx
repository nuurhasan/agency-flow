import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, KeyRound, Trash2, Users, Zap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AuthGate } from "@/components/AuthGate";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { ProjectDialog } from "@/components/ProjectDialog";

import { CredentialList, useCredentialActions, type Cred } from "@/components/CredentialList";
import { SprintsTab } from "@/components/SprintsTab";
import { MembersTab } from "@/components/MembersTab";
import { ActivityFeed } from "@/components/ActivityFeed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { TaskStatusDropdown } from "@/components/TaskStatusDropdown";

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
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  updated_at: string;
  sprint_id: string | null;
  is_backlog: boolean;
};

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewingTask, setViewingTask] = React.useState<TaskRow | null>(null);
  const [editingTask, setEditingTask] = React.useState<TaskRow | null>(null);
  const [editingAssignees, setEditingAssignees] = React.useState<string[]>([]);
  const [editProjectOpen, setEditProjectOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const credActions = useCredentialActions();
  const CredDialog = credActions.Dialog;

  const deleteProject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects" });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to delete (admins only)"),
  });

  type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";
  const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "archived"];

  const setStatus = useMutation({
    mutationFn: async (next: ProjectStatus) => {
      const { error } = await supabase
        .from("projects")
        .update({ status: next })
        .eq("id", projectId);
      if (error) throw error;
      if (user) {
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: projectId,
          action: "project.status_changed",
          meta: { status: next },
        });
      }
    },
    onSuccess: (_d, next) => {
      toast.success(next === "archived" ? "Project archived" : `Status set to ${statusLabel(next)}`);
      qc.invalidateQueries();
      if (next === "archived") navigate({ to: "/projects/archived" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ["project-credentials", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_credentials")
        .select("id,project_id,label,url,username,notes,created_by,password_encrypted")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      return (data ?? []).map((c) => ({
        id: c.id,
        project_id: c.project_id,
        label: c.label,
        url: c.url,
        username: c.username,
        notes: c.notes,
        created_by: c.created_by,
        has_password: !!c.password_encrypted,
      })) as Cred[];
    },
  });

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

  const updateStatus = useMutation({
    mutationFn: async (vars: { task: TaskRow; nextStatus: TaskRow["status"] }) => {
      const { task: t, nextStatus } = vars;
      if (t.status === nextStatus) return;
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
          meta: { title: t.title, status: nextStatus },
        });
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries();
      toast.success(`Status set to ${statusLabel(vars.nextStatus)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,icon,client_name,status,service_type,description,due_date,owner_id")
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
        .select("id,project_id,title,description,status,priority,due_date,updated_at,sprint_id,is_backlog")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      return (data ?? []) as TaskRow[];
    },
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ["project-sprints", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sprints")
        .select("id,name,status,end_date")
        .eq("project_id", projectId);
      return data ?? [];
    },
  });
  const activeSprint = sprints.find((s) => s.status === "active");

  const { data: projectMemberRows = [] } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_members")
        .select("user_id,role")
        .eq("project_id", projectId);
      return data ?? [];
    },
  });
  const memberCount = projectMemberRows.length;
  const projectMemberIds = React.useMemo(
    () => new Set(projectMemberRows.map((r) => r.user_id)),
    [projectMemberRows],
  );

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name").order("name");
      return data ?? [];
    },
  });
  // Restrict the assignee filter dropdown to project members only
  const projectMembers = React.useMemo(
    () => members.filter((m) => projectMemberIds.has(m.id)),
    [members, projectMemberIds],
  );

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
  const matchesAssignee = (id: string) => {
    if (assigneeFilter === "all") return true;
    const ids = assigneeMap[id] ?? [];
    if (assigneeFilter === "unassigned") return ids.length === 0;
    return ids.includes(assigneeFilter);
  };
  const matchesStatus = (t: TaskRow) => statusFilter === "all" || t.status === statusFilter;
  const visibleTasks = tasks.filter((t) => matchesAssignee(t.id) && matchesStatus(t));
  const openTasks = visibleTasks.filter((t) => t.status !== "done");
  const doneTasks = visibleTasks.filter((t) => t.status === "done");
  const isArchived = project?.status === "archived";

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
            <Select
              value={project.status}
              onValueChange={(v) => setStatus.mutate(v as ProjectStatus)}
              disabled={setStatus.isPending}
            >
              <SelectTrigger
                className={`h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 py-0 text-[11px] font-medium shadow-none focus:ring-0 ${statusPillClasses(project.status)}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {project.service_type}
            </span>
            {activeSprint && (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-medium text-mint-ink">
                <Zap className="h-3 w-3" /> {activeSprint.name}
                {activeSprint.end_date ? ` · ends ${new Date(activeSprint.end_date).toLocaleDateString()}` : ""}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.client_name || "No client"}
            {project.due_date ? ` · Due ${new Date(project.due_date).toLocaleDateString()}` : ""}
          </p>
          {project.description && (
            <p className="mt-3 text-sm text-foreground/80">{project.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setEditProjectOpen(true)}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setStatus.mutate(isArchived ? "active" : "archived")}
            disabled={setStatus.isPending}
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="h-4 w-4" /> Unarchive
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" /> Archive
              </>
            )}
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes <strong>{project.name}</strong> along with its tasks,
                  credentials, and activity. This action cannot be undone. Only admins can delete
                  projects.
                </AlertDialogDescription>
              </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  deleteProject.mutate();
                }}
                disabled={deleteProject.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteProject.isPending ? "Deleting…" : "Delete project"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="sprints">Sprints ({sprints.length})</TabsTrigger>
            <TabsTrigger value="credentials">
              <KeyRound className="h-3.5 w-3.5" /> Credentials ({credentials.length})
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users className="h-3.5 w-3.5" /> Members ({memberCount})
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="h-3.5 w-3.5" /> Activity
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button onClick={openNew} className="rounded-full">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </div>
        </div>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          {tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
              <p className="font-display text-lg font-semibold">No tasks yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Create the first task to get started.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={openNew} className="rounded-full">
                  <Plus className="h-4 w-4" /> Add a task
                </Button>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="open">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="open">Open ({openTasks.length})</TabsTrigger>
                  <TabsTrigger value="completed">Completed ({doneTasks.length})</TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-[160px] rounded-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="h-9 w-[200px] rounded-full">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All assignees</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {projectMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <TabsContent value="open" className="mt-4">
                <TaskList
                  tasks={openTasks}
                  assigneeMap={assigneeMap}
                  memberById={memberById}
                  onToggle={(t) => toggleDone.mutate(t)}
                  onEdit={openView}
                  emptyText={
                    assigneeFilter === "all"
                      ? "Nothing here."
                      : "No open tasks match this filter."
                  }
                />
              </TabsContent>
              <TabsContent value="completed" className="mt-4">
                <TaskList
                  tasks={doneTasks}
                  assigneeMap={assigneeMap}
                  memberById={memberById}
                  onToggle={(t) => toggleDone.mutate(t)}
                  onEdit={openView}
                  emptyText={
                    assigneeFilter === "all"
                      ? "No completed tasks yet."
                      : "No completed tasks match this filter."
                  }
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="sprints" className="mt-4">
          <SprintsTab
            projectId={projectId}
            tasks={tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              due_date: t.due_date,
              sprint_id: t.sprint_id,
              is_backlog: t.is_backlog,
            }))}
            onEditTask={(id) => {
              const t = tasks.find((x) => x.id === id);
              if (t) openView(t);
            }}
          />
        </TabsContent>

        <TabsContent value="credentials" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={credActions.openNew} className="rounded-full">
              <Plus className="h-4 w-4" /> New credential
            </Button>
          </div>
          <CredentialList
            credentials={credentials}
            onEdit={credActions.openEdit}
            onDelete={credActions.onDelete}
          />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersTab projectId={projectId} ownerId={project.owner_id} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityFeed
            projectId={projectId}
            limit={50}
            emptyText="No activity yet for this project."
          />
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        projectId={projectId}
        task={editingTask}
        members={members}
        initialAssignees={editingAssignees}
      />
      <TaskDetailDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        task={viewingTask}
        projectName={project.name}
        assignees={
          viewingTask
            ? (assigneeMap[viewingTask.id] ?? [])
                .map((id) => {
                  const name = memberById.get(id);
                  return name ? { id, name } : null;
                })
                .filter(Boolean) as { id: string; name: string }[]
            : []
        }
        onEdit={() => viewingTask && openEdit(viewingTask)}
      />
      <CredDialog
        open={credActions.open}
        onOpenChange={credActions.setOpen}
        projectId={projectId}
        credential={credActions.editing}
      />
      <ProjectDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        project={project}
      />
    </div>
  );
}

function TaskList({
  tasks,
  assigneeMap,
  memberById,
  onToggle,
  onEdit,
  emptyText = "Nothing here.",
}: {
  tasks: TaskRow[];
  assigneeMap: Record<string, string[]>;
  memberById: Map<string, string>;
  onToggle: (t: TaskRow) => void;
  onEdit: (t: TaskRow) => void;
  emptyText?: string;
}) {
  if (!tasks.length) {
    return (
      <p className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {tasks.map((t) => {
        const names = (assigneeMap[t.id] ?? [])
          .map((id) => memberById.get(id))
          .filter(Boolean) as string[];

        return (
          <TaskListItem
            key={t.id}
            task={t}
            names={names}
            onToggle={() => onToggle(t)}
            onEdit={() => onEdit(t)}
          />
        );
      })}
    </ul>
  );
}

function TaskListItem({
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
  const serverDone = task.status === "done";
  const [completing, setCompleting] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  const showAsDone = serverDone || completing;

  const handleToggle = (checked: boolean | "indeterminate") => {
    if (serverDone) {
      onToggle();
      return;
    }

    if (checked === true && !completing) {
      setCompleting(true);
      window.setTimeout(() => setLeaving(true), 1800);
      window.setTimeout(() => onToggle(), 2250);
    }
  };

  return (
    <li
      className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${leaving ? "animate-slide-out-left" : ""}`}
    >
      <Checkbox
        checked={showAsDone}
        onCheckedChange={handleToggle}
        aria-label={showAsDone ? "Mark as not done" : "Mark as done"}
        className="h-5 w-5 rounded-md"
      />
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-medium transition-all duration-300 ${showAsDone ? "text-muted-foreground line-through" : ""}`}
          >
            {task.title}
          </p>
          <p
            className={`truncate text-xs text-muted-foreground transition-opacity duration-300 ${showAsDone ? "opacity-60" : ""}`}
          >
            {names.length ? names.join(", ") : "Unassigned"}
            {task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString()}` : ""}
          </p>
        </div>
        {task.priority === "high" && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${priorityPill(task.priority)} ${showAsDone ? "opacity-50" : ""}`}
          >
            High
          </span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(showAsDone ? "done" : task.status)}`}
        >
          {statusLabel(showAsDone ? "done" : task.status)}
        </span>
      </button>
    </li>
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
