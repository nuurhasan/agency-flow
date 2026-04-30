import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
      className={`gradient-sheen rounded-2xl border p-3 shadow-soft bg-gradient-backlog transition-[box-shadow,transform,border-color] duration-200 ease-out ${
        isOver
          ? "border-peach-ink/60 ring-2 ring-peach-ink/40 scale-[1.015] shadow-glow-cta"
          : "border-peach-ink/20"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-peach-ink">
          <Inbox className="h-3.5 w-3.5" /> Backlog
        </p>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-peach-ink shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <BacklogCard key={t.id} task={t} onEdit={onEdit} />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-peach-ink/25 p-3 text-center text-xs text-peach-ink/70">
            No backlog items. Drop tasks here to send them back.
          </p>
        )}
      </div>
    </div>
  );
}

function BacklogCard({ task, onEdit }: { task: BoardTask; onEdit?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0 }
    : transform
      ? { transform: CSS.Translate.toString(transform) }
      : {};
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-soft transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-pop"
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
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