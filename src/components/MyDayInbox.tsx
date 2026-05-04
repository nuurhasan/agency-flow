import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CalendarRange, Sparkles, Sun } from "lucide-react";
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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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

  const total = groups.overdue.length + groups.dueToday.length + groups.thisWeek.length;
  const empty = !isLoading && total === 0;

  const userName =
    (user?.user_metadata as any)?.name?.split(" ")?.[0] ??
    user?.email?.split("@")?.[0] ??
    "";

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {/* Header */}
      <div className="relative flex items-center justify-between gap-4 border-b border-border/60 bg-gradient-to-br from-[color-mix(in_oklab,var(--lavender)_55%,white)] via-card to-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-lavender-ink shadow-sm ring-1 ring-border/60">
            <Sun className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              My Day
            </p>
            <h2 className="font-display text-lg font-semibold leading-tight">
              {greeting()}{userName ? `, ${userName}` : ""}
            </h2>
          </div>
        </div>
        {!isLoading && total > 0 && (
          <div className="flex items-center gap-3 text-right">
            <Stat label="Overdue" value={groups.overdue.length} tone="text-destructive" />
            <Divider />
            <Stat label="Today" value={groups.dueToday.length} tone="text-foreground" />
            <Divider />
            <Stat label="Week" value={groups.thisWeek.length} tone="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-9 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-9 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-9 animate-pulse rounded-xl bg-muted/30" />
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-foreground/70">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">You're all clear.</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Nothing on your plate this week. Enjoy the calm — or queue up something new.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <Group
              label="Overdue"
              tasks={groups.overdue}
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              tone="destructive"
            />
            <Group
              label="Today"
              tasks={groups.dueToday}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              tone="today"
            />
            <Group
              label="This week"
              tasks={groups.thisWeek}
              icon={<CalendarRange className="h-3.5 w-3.5" />}
              tone="muted"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className={cn("font-display text-xl font-bold tabular-nums", tone)}>{value}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="h-8 w-px bg-border/70" aria-hidden />;
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
  tone: "destructive" | "today" | "muted";
}) {
  if (tasks.length === 0) return null;

  const headerTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "today"
      ? "text-foreground"
      : "text-muted-foreground";

  const dotTone =
    tone === "destructive"
      ? "bg-destructive"
      : tone === "today"
      ? "bg-[color:var(--sky)]"
      : "bg-muted-foreground/40";

  return (
    <div>
      <div className={cn("mb-2 flex items-center gap-1.5", headerTone)}>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {icon}
          {label} <span className="tabular-nums">({tasks.length})</span>
        </span>
      </div>
      <ul className="space-y-1">
        {tasks.slice(0, 6).map((t) => (
          <li key={t.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: t.project_id }}
              className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm transition-all hover:border-border hover:bg-muted/60"
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone)} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground/90 group-hover:text-foreground">
                {t.title}
              </span>
              <span className="hidden shrink-0 truncate rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                {t.project_name}
              </span>
            </Link>
          </li>
        ))}
        {tasks.length > 6 && (
          <li className="px-3 pt-1 text-[11px] text-muted-foreground">
            +{tasks.length - 6} more
          </li>
        )}
      </ul>
    </div>
  );
}
