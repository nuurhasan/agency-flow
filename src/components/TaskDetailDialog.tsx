import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Flag, FolderKanban, Pencil, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { priorityClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { TaskComments } from "@/components/TaskComments";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TaskLinks } from "@/components/TaskLinks";

export interface TaskDetail {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskDetail | null;
  /** Pre-fetched assignees (avoids extra fetch when caller already has them) */
  assignees?: { id: string; name: string }[];
  /** Optional project name for display */
  projectName?: string;
  /**
   * All teammates available for @mention autocomplete in the comments
   * composer. When omitted, the dialog falls back to fetching profiles itself.
   */
  members?: { id: string; name: string }[];
  onEdit: () => void;
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  assignees,
  projectName,
  members,
  onEdit,
}: Props) {
  // Fetch assignees if not provided
  const { data: fetchedAssignees = [] } = useQuery({
    queryKey: ["task-detail-assignees", task?.id],
    enabled: open && !!task && !assignees,
    queryFn: async () => {
      if (!task) return [];
      const { data: rows } = await supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", task.id);
      const ids = (rows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", ids);
      return profs ?? [];
    },
  });

  // Fallback fetch of all profiles for @mention autocomplete when the caller
  // didn't supply a members list. Only fires when the dialog is open.
  const { data: fetchedMembers = [] } = useQuery({
    queryKey: ["task-detail-members"],
    enabled: open && !members,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name")
        .order("name");
      return data ?? [];
    },
  });

  const people = assignees ?? fetchedAssignees;
  const mentionMembers = members ?? fetchedMembers;

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl leading-snug">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClasses(task.status)}`}
            >
              {statusLabel(task.status)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${priorityClasses(task.priority)}`}
            >
              <Flag className="h-3 w-3" />
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {projectName && (
              <div className="flex items-start gap-2">
                <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Project</dt>
                  <dd className="font-medium">{projectName}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Due date</dt>
                <dd className="font-medium">
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "No due date"}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <User2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Assignees</dt>
                <dd className="mt-1 flex items-center gap-2">
                  {people.length === 0 ? (
                    <span className="text-sm italic text-muted-foreground">Unassigned</span>
                  ) : (
                    <>
                      <AvatarStack people={people} max={5} size="sm" />
                      <span className="text-sm">
                        {people.map((p) => p.name).join(", ")}
                      </span>
                    </>
                  )}
                </dd>
              </div>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            {task.description ? (
              <p className="whitespace-pre-wrap rounded-2xl bg-muted/40 p-3 text-sm leading-relaxed">
                {task.description}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description provided.</p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <TaskChecklist taskId={task.id} />
          </div>

          <div className="border-t border-border pt-4">
            <TaskLinks taskId={task.id} />
          </div>

          <div className="border-t border-border pt-4">
            <TaskComments
              taskId={task.id}
              projectId={task.project_id}
              taskTitle={task.title}
              members={mentionMembers}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
            className="rounded-full"
          >
            <Pencil className="h-4 w-4" /> Edit task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
