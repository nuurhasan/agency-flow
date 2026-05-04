import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CalendarRange, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type MyTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string;
  project_name: string;
  project_color: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function MyDayInbox() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["my-day", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", user!.id);
      const ids = (rows ?? []).map((r) => r.task_id);
      if (!ids.length) return [] as MyTask[];
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id,title,due_date,status,project_id,projects(name,color)")
        .in("id", ids)
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false });
      return (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        status: t.status,
        project_id: t.project_id,
        project_name: (t as any).projects?.name ?? "",
        project_color: (t as any).projects?.color ?? "mint",
      })) as MyTask[];
    },
  });

  const groups = React.useMemo(() => {
    const today = ymd(new Date());
    const weekEnd = ymd(new Date(Date.now() + 7 * 86400_000));
    const overdue: MyTask[] = [];
    const dueToday: MyTask[] = [];
    const thisWeek: MyTask[] = [];
    (data ?? []).forEach((t) => {
      if (!t.due_date) return;
      if (t.due_date < today) overdue.push(t);
      else if (t.due_date === today) dueToday.push(t);
      else if (t.due_date <= weekEnd) thisWeek.push(t);
    });
    return { overdue, dueToday, thisWeek };
  }, [data]);

  const empty =
    !isLoading &&
    groups.overdue.length === 0 &&
    groups.dueToday.length === 0 &&
    groups.thisWeek.length === 0;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lavender text-lavender-ink">
          <Inbox className="h-4 w-4" />
        </span>
        <h2 className="font-display text-lg font-semibold">My Day</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : empty ? (
        <p className="text-sm italic text-muted-foreground">
          No tasks assigned to you with upcoming due dates. ✨
        </p>
      ) : (
        <div className="space-y-4">
          <Group
            label="Overdue"
            tasks={groups.overdue}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            tone="text-destructive"
          />
          <Group
            label="Today"
            tasks={groups.dueToday}
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            tone="text-foreground"
          />
          <Group
            label="This week"
            tasks={groups.thisWeek}
            icon={<CalendarRange className="h-3.5 w-3.5" />}
            tone="text-muted-foreground"
          />
        </div>
      )}
    </section>
  );
}

function Group({
  label,
  tasks,
  icon,
  tone,
}: {
  label: string;
  tasks: MyTask[];
  icon: React.ReactNode;
  tone: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", tone)}>
        {icon}
        {label}
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <ul className="space-y-1">
        {tasks.slice(0, 6).map((t) => (
          <li key={t.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: t.project_id }}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                {t.project_name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
