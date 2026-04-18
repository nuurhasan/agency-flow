import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { priorityClasses } from "@/lib/pastel";

export type BoardTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  sprint_id: string | null;
  is_backlog: boolean;
};

const COLUMNS: Array<{ id: BoardTask["status"]; label: string }> = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "done", label: "Done" },
];

interface Props {
  sprintId: string;
  projectId: string;
  tasks: BoardTask[];
  /** Allow dropping tasks from the backlog into this board */
  acceptBacklog?: boolean;
}

const BACKLOG_DROP_ID = "__backlog__";

export function SprintBoard({ sprintId, projectId, tasks, acceptBacklog = true }: Props) {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = React.useState<BoardTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const moveTask = useMutation({
    mutationFn: async ({
      task,
      target,
    }: {
      task: BoardTask;
      target: BoardTask["status"] | typeof BACKLOG_DROP_ID;
    }) => {
      if (target === BACKLOG_DROP_ID) {
        const { error } = await supabase
          .from("tasks")
          .update({ sprint_id: null, is_backlog: true })
          .eq("id", task.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("tasks")
        .update({
          status: target,
          sprint_id: sprintId,
          is_backlog: false,
        })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move task"),
  });

  const onDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string;
    setActiveTask(tasks.find((t) => t.id === id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!task) return;

    if (overId === BACKLOG_DROP_ID) {
      if (task.is_backlog) return;
      moveTask.mutate({ task, target: BACKLOG_DROP_ID });
      return;
    }

    const target = overId as BoardTask["status"];
    if (target === task.status && task.sprint_id === sprintId) return;
    moveTask.mutate({ task, target });
  };

  const grouped = React.useMemo(() => {
    const map: Record<BoardTask["status"], BoardTask[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of tasks) {
      if (t.sprint_id === sprintId) map[t.status].push(t);
    }
    return map;
  }, [tasks, sprintId]);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <Column key={col.id} id={col.id} label={col.label} tasks={grouped[col.id]} />
        ))}
      </div>
      {acceptBacklog && <BacklogDropHint />}
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  id,
  label,
  tasks,
}: {
  id: BoardTask["status"];
  label: string;
  tasks: BoardTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[160px] flex-col gap-2 rounded-2xl border p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Drop tasks here
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      <TaskCard task={task} />
    </div>
  );
}

function TaskCard({ task, dragging = false }: { task: BoardTask; dragging?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-3 shadow-soft ${
        dragging ? "rotate-2 shadow-pop" : ""
      }`}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses(task.priority)}`}
        >
          {task.priority}
        </span>
        {task.due_date && (
          <span className="text-[11px] text-muted-foreground">
            Due {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function BacklogDropHint() {
  // Reserved for future inline hint; the actual backlog droppable lives in BacklogList.
  return null;
}

export { BACKLOG_DROP_ID };
