import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, History, Play, Plus, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SprintDialog } from "@/components/SprintDialog";
import { SprintBoard, type BoardTask } from "@/components/SprintBoard";

type Sprint = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "active" | "completed";
  created_at: string;
};

interface Props {
  projectId: string;
  tasks: BoardTask[];
  onEditTask?: (taskId: string) => void;
  onCreateTaskInSprint?: (sprintId: string) => void;
}

export function SprintsTab({ projectId, tasks, onEditTask, onCreateTaskInSprint }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Sprint | null>(null);
  const [completeId, setCompleteId] = React.useState<string | null>(null);

  const { data: sprints = [] } = useQuery({
    queryKey: ["project-sprints", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sprints")
        .select("id,project_id,name,goal,start_date,end_date,status,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Sprint[];
    },
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("activate_sprint", { _sprint_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sprint started");
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(
        msg.includes("another_sprint_active")
          ? "Another sprint is already active. Complete it first."
          : msg
      );
    },
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("complete_sprint", { _sprint_id: id });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (moved) => {
      toast.success(
        moved > 0
          ? `Sprint completed. ${moved} task${moved === 1 ? "" : "s"} returned to backlog.`
          : "Sprint completed"
      );
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      setCompleteId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerSelection, setPickerSelection] = React.useState<string[]>([]);

  const addFromBacklog = useMutation({
    mutationFn: async ({ sprintId, taskIds }: { sprintId: string; taskIds: string[] }) => {
      if (taskIds.length === 0) return 0;
      const { error } = await supabase
        .from("tasks")
        .update({ sprint_id: sprintId, is_backlog: false })
        .in("id", taskIds);
      if (error) throw error;
      return taskIds.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} task${n === 1 ? "" : "s"} to sprint`);
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
      setPickerOpen(false);
      setPickerSelection([]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const activeSprint = sprints.find((s) => s.status === "active") ?? null;
  const plannedSprints = sprints.filter((s) => s.status === "planned");
  const pastSprints = sprints.filter((s) => s.status === "completed");

  const backlogTasks = tasks.filter((t) => t.is_backlog && !t.sprint_id);
  const sprintTasks = activeSprint
    ? tasks.filter((t) => t.sprint_id === activeSprint.id)
    : [];

  const completionStats = (sprintId: string) => {
    const list = tasks.filter((t) => t.sprint_id === sprintId);
    const done = list.filter((t) => t.status === "done").length;
    return { done, total: list.length };
  };

  const incompleteIfCompleted = completeId
    ? tasks.filter((t) => t.sprint_id === completeId && t.status !== "done").length
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Sprints</h2>
          <p className="text-sm text-muted-foreground">
            Plan focused work in time-boxed iterations.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="rounded-full"
          >
            <Plus className="h-4 w-4" /> New sprint
          </Button>
        )}
      </div>

      {/* Active sprint */}
      {activeSprint ? (
        <ActiveSprintCard
          sprint={activeSprint}
          stats={completionStats(activeSprint.id)}
          isAdmin={isAdmin}
          onComplete={() => setCompleteId(activeSprint.id)}
          onEdit={() => {
            setEditing(activeSprint);
            setDialogOpen(true);
          }}
          onNewTask={
            onCreateTaskInSprint ? () => onCreateTaskInSprint(activeSprint.id) : undefined
          }
          onAddFromBacklog={
            backlogTasks.length > 0
              ? () => {
                  setPickerSelection([]);
                  setPickerOpen(true);
                }
              : undefined
          }
          backlogCount={backlogTasks.length}
        />
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-display text-base font-semibold">No active sprint</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {plannedSprints.length > 0
              ? "Start one of your planned sprints below to begin."
              : isAdmin
                ? "Create a sprint to start planning work."
                : "An admin can create a sprint."}
          </p>
        </div>
      )}

      {/* Board + backlog */}
      {activeSprint && (
        <SprintBoard
          sprintId={activeSprint.id}
          projectId={projectId}
          sprintTasks={sprintTasks}
          backlogTasks={backlogTasks}
          onEditTask={onEditTask}
        />
      )}

      {/* Planned sprints */}
      {plannedSprints.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Planned
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {plannedSprints.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatRange(s.start_date, s.end_date) || "No dates set"}
                    {s.goal ? ` · ${s.goal}` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => activate.mutate(s.id)}
                    disabled={activate.isPending}
                  >
                    <Play className="h-4 w-4" /> Start
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sprint history */}
      {pastSprints.length > 0 && (
        <section>
          <Accordion type="single" collapsible>
            <AccordionItem value="history" className="rounded-2xl border border-border bg-card px-4">
              <AccordionTrigger>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4" /> Sprint history ({pastSprints.length})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="divide-y divide-border">
                  {pastSprints.map((s) => {
                    const stats = completionStats(s.id);
                    return (
                      <li key={s.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{s.name}</p>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {stats.done} of {stats.total} task{stats.total === 1 ? "" : "s"} completed
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRange(s.start_date, s.end_date) || "No dates"}
                          {s.goal ? ` · ${s.goal}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      )}

      <SprintDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        sprint={editing}
      />

      <AlertDialog open={!!completeId} onOpenChange={(o) => !o && setCompleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this sprint?</AlertDialogTitle>
            <AlertDialogDescription>
              {incompleteIfCompleted > 0
                ? `${incompleteIfCompleted} unfinished task${incompleteIfCompleted === 1 ? "" : "s"} will return to the backlog.`
                : "All tasks are done — nice work!"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (completeId) complete.mutate(completeId);
              }}
              disabled={complete.isPending}
            >
              {complete.isPending ? "Completing…" : "Complete sprint"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActiveSprintCard({
  sprint,
  stats,
  isAdmin,
  onComplete,
  onEdit,
}: {
  sprint: Sprint;
  stats: { done: number; total: number };
  isAdmin: boolean;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const pct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);
  const daysLeft = daysUntil(sprint.end_date);

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-mint-ink">
              Active
            </span>
            <h3 className="font-display text-xl font-bold tracking-tight">{sprint.name}</h3>
          </div>
          {sprint.goal && (
            <p className="mt-1 text-sm text-foreground/80">{sprint.goal}</p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatRange(sprint.start_date, sprint.end_date) || "No dates set"}
            {daysLeft !== null && (
              <span>
                · {daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`}
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" className="rounded-full" onClick={onComplete}>
              Complete sprint
            </Button>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {stats.done} of {stats.total} task{stats.total === 1 ? "" : "s"} completed
          </span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>
    </div>
  );
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "";
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "?";
  return `${fmt(start)} → ${fmt(end)}`;
}

function daysUntil(end: string | null): number | null {
  if (!end) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - now.getTime()) / 86400000);
}
