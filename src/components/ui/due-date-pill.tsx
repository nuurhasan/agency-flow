import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function dayDelta(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400_000);
}

export function DueDatePill({
  date,
  done,
  className,
}: {
  date: string | null | undefined;
  done?: boolean;
  className?: string;
}) {
  if (!date) return null;
  const delta = dayDelta(date);
  const overdue = !done && delta < 0;
  const soon = !done && delta >= 0 && delta <= 3;

  const tone = done
    ? "bg-muted text-muted-foreground"
    : overdue
      ? "bg-coral text-coral-ink"
      : soon
        ? "bg-butter text-butter-ink"
        : "bg-mint text-mint-ink";

  let label: string;
  if (overdue) {
    const d = Math.abs(delta);
    label = d === 1 ? "1d overdue" : `${d}d overdue`;
  } else if (delta === 0) {
    label = "Today";
  } else if (delta === 1) {
    label = "Tomorrow";
  } else if (delta > 0 && delta <= 7) {
    label = `In ${delta}d`;
  } else {
    label = new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <CalendarDays className="h-3 w-3" />
      {label}
    </span>
  );
}
