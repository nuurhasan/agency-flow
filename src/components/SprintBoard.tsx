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
import { GripVertical } from "lucide-react";
import { priorityClasses } from "@/lib/pastel";
import { BacklogList } from "@/components/BacklogList";

export type BoardTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  sprint_id: string | null;
  is_backlog: boolean;
};

const COLUMNS: Array<{
  id: BoardTask["status"];
  label: string;
  // Tailwind classes for the column's idle look
  tint: string;
  border: string;
  headerText: string;
  countBg: string;
  dropZone: string;
  // Classes when a card is being hovered over this column
  over: string;
}> = [
  {
    id: "todo",
    label: "To Do",
    tint: "bg-lavender",
    border: "border-lavender-ink/15",
    headerText: "text-lavender-ink",
    countBg: "bg-lavender-ink/10 text-lavender-ink",
    dropZone: "border-lavender-ink/25 text-lavender-ink/70",
    over: "border-lavender-ink/60 bg-lavender ring-2 ring-lavender-ink/30",
  },
  {
    id: "in_progress",
    label: "In Progress",
    tint: "bg-sky",
    border: "border-sky-ink/15",
    headerText: "text-sky-ink",
    countBg: "bg-sky-ink/10 text-sky-ink",
    dropZone: "border-sky-ink/25 text-sky-ink/70",
    over: "border-sky-ink/60 bg-sky ring-2 ring-sky-ink/30",
  },
  {
    id: "in_review",
    label: "In Review",
    tint: "bg-butter",
    border: "border-butter-ink/15",
    headerText: "text-butter-ink",
    countBg: "bg-butter-ink/10 text-butter-ink",
    dropZone: "border-butter-ink/25 text-butter-ink/70",
    over: "border-butter-ink/60 bg-butter ring-2 ring-butter-ink/30",
  },
  {
    id: "done",
    label: "Done",
    tint: "bg-mint",
    border: "border-mint-ink/15",
    headerText: "text-mint-ink",
    countBg: "bg-mint-ink/10 text-mint-ink",
    dropZone: "border-mint-ink/25 text-mint-ink/70",
    over: "border-mint-ink/60 bg-mint ring-2 ring-mint-ink/30",
  },
];

export const BACKLOG_DROP_ID = "__backlog__";

interface Props {
  sprintId: string;
  projectId: string;
  /** Tasks belonging to this sprint */
  sprintTasks: BoardTask[];
  /** Tasks in the backlog for this project */
  backlogTasks: BoardTask[];
  onEditTask?: (taskId: string) => void;
}

/**
 * Combined Sprint Board + Backlog with drag-and-drop between them.
 * Wraps the whole thing in a single DndContext so cards can move between
 * any column and the backlog.
 */
export function SprintBoard({
  sprintId,
  projectId,
  sprintTasks,
  backlogTasks,
  onEditTask,
}: Props) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const allTasks = React.useMemo(
    () => [...sprintTasks, ...backlogTasks],
    [sprintTasks, backlogTasks]
  );
  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) ?? null : null;

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
        .update({ status: target, sprint_id: sprintId, is_backlog: false })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move task"),
  });

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const task = allTasks.find((t) => t.id === e.active.id);
    if (!task) return;

    if (overId === BACKLOG_DROP_ID) {
      if (task.is_backlog) return;
      moveTask.mutate({ task, target: BACKLOG_DROP_ID });
      return;
    }

    const target = overId as BoardTask["status"];
    if (target === task.status && task.sprint_id === sprintId && !task.is_backlog) return;
    moveTask.mutate({ task, target });
  };

  const grouped = React.useMemo(() => {
    const map: Record<BoardTask["status"], BoardTask[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of sprintTasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [sprintTasks]);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              tasks={grouped[col.id]}
              onEditTask={onEditTask}
              tint={col.tint}
              border={col.border}
              headerText={col.headerText}
              countBg={col.countBg}
              dropZone={col.dropZone}
              over={col.over}
            />
          ))}
        </div>
        <BacklogList tasks={backlogTasks} onEdit={onEditTask} />
      </div>
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
  onEditTask,
  tint,
  border,
  headerText,
  countBg,
  dropZone,
  over,
}: {
  id: BoardTask["status"];
  label: string;
  tasks: BoardTask[];
  onEditTask?: (id: string) => void;
  tint: string;
  border: string;
  headerText: string;
  countBg: string;
  dropZone: string;
  over: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[160px] flex-col gap-2 rounded-2xl border p-3 transition-colors ${
        isOver ? over : `${border} ${tint}`
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <p className={`text-xs font-semibold uppercase tracking-wide ${headerText}`}>
          {label}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${countBg}`}>
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onClick={() => onEditTask?.(t.id)} />
        ))}
        {tasks.length === 0 && (
          <p className={`rounded-xl border border-dashed p-3 text-center text-xs ${dropZone}`}>
            Drop tasks here
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task, onClick }: { task: BoardTask; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-soft ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag task"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate text-sm font-medium">{task.title}</span>
        {task.priority === "high" && (
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses(task.priority)}`}
          >
            High
          </span>
        )}
      </button>
    </div>
  );
}

function TaskCard({ task, dragging = false }: { task: BoardTask; dragging?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-soft ${
        dragging ? "rotate-2 shadow-pop" : ""
      }`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{task.title}</span>
      {task.priority === "high" && (
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses(task.priority)}`}
        >
          High
        </span>
      )}
    </div>
  );
}
