import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Inbox } from "lucide-react";
import { priorityClasses } from "@/lib/pastel";
import type { BoardTask } from "@/components/SprintBoard";
import { BACKLOG_DROP_ID } from "@/components/SprintBoard";

interface Props {
  tasks: BoardTask[];
  onEdit?: (taskId: string) => void;
}

export function BacklogList({ tasks, onEdit }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_DROP_ID });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Inbox className="h-3.5 w-3.5" /> Backlog
        </p>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <BacklogCard key={t.id} task={t} onEdit={onEdit} />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No backlog items. Drop tasks here to send them back.
          </p>
        )}
      </div>
    </div>
  );
}

function BacklogCard({ task, onEdit }: { task: BoardTask; onEdit?: (id: string) => void }) {
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
        onClick={() => onEdit?.(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate text-sm font-medium">{task.title}</span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClasses(task.priority)}`}
        >
          {task.priority}
        </span>
      </button>
    </div>
  );
}
