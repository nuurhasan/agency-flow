import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};
const PRIORITIES = ["low", "medium", "high"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  task?: {
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: (typeof STATUSES)[number];
    priority: (typeof PRIORITIES)[number];
    due_date: string | null;
  } | null;
  members: Array<{ id: string; name: string }>;
  projects?: Array<{ id: string; name: string }>;
  initialAssignees?: string[];
}

export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  task,
  members,
  projects,
  initialAssignees = [],
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => initial(task, projectId));
  const [assignees, setAssignees] = React.useState<string[]>(initialAssignees);

  React.useEffect(() => {
    setForm(initial(task, projectId));
    setAssignees(initialAssignees);
  }, [task, projectId, open, initialAssignees]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      let id = task?.id;
      if (task) {
        const { error } = await supabase
          .from("tasks")
          .update({
            title: form.title,
            description: form.description || null,
            status: form.status,
            priority: form.priority,
            due_date: form.due_date || null,
            project_id: form.project_id,
          })
          .eq("id", task.id);
        if (error) throw error;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          task_id: task.id,
          project_id: form.project_id,
          action: form.status === "done" && task.status !== "done" ? "task.completed" : "task.updated",
          meta: { title: form.title },
        });
      } else {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            title: form.title,
            description: form.description || null,
            status: form.status,
            priority: form.priority,
            due_date: form.due_date || null,
            project_id: form.project_id,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          task_id: id,
          project_id: form.project_id,
          action: "task.created",
          meta: { title: form.title },
        });
      }

      // sync assignees
      if (id) {
        const { data: existing } = await supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", id);
        const have = new Set((existing ?? []).map((r) => r.user_id));
        const want = new Set(assignees);
        const toAdd = assignees.filter((u) => !have.has(u));
        const toRemove = (existing ?? []).filter((r) => !want.has(r.user_id)).map((r) => r.user_id);
        if (toAdd.length) {
          await supabase.from("task_assignees").insert(toAdd.map((u) => ({ task_id: id!, user_id: u })));
          await supabase.from("activity_log").insert({
            actor_id: user.id,
            task_id: id,
            project_id: form.project_id,
            action: "task.assigned",
            meta: { title: form.title, count: toAdd.length },
          });
          // notify (best-effort, non-blocking)
          supabase.functions
            .invoke("send-task-assignment-email", {
              body: { taskId: id, assigneeIds: toAdd },
            })
            .catch(() => undefined);
        }
        if (toRemove.length) {
          await supabase.from("task_assignees").delete().eq("task_id", id).in("user_id", toRemove);
        }
      }
    },
    onSuccess: () => {
      toast.success(task ? "Task updated" : "Task created");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error("No task");
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      if (user) {
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: task.project_id,
          action: "task.deleted",
          meta: { title: task.title },
        });
      }
    },
    onSuccess: () => {
      toast.success("Task deleted");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Assignees get an email when added.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={form.title}
              required
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          {projects && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.project_id}
                onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as typeof form.priority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Due</Label>
              <Input
                id="t-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Assignees</Label>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2">
              {members.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">No team members yet.</p>
              )}
              {members.map((m) => {
                const checked = assignees.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setAssignees((a) => (v ? [...a, m.id] : a.filter((x) => x !== m.id)))
                      }
                    />
                    <span className="text-sm">{m.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !form.project_id} className="rounded-full">
              {mutation.isPending ? "Saving…" : task ? "Save" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(t: Props["task"], projectId: string | undefined) {
  return {
    title: t?.title ?? "",
    description: t?.description ?? "",
    status: t?.status ?? ("todo" as const),
    priority: t?.priority ?? ("medium" as const),
    due_date: t?.due_date ?? "",
    project_id: t?.project_id ?? projectId ?? "",
  };
}
