import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { pickColorFromString, pastelClasses } from "@/lib/pastel";

export const Route = createFileRoute("/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team — Studio" }] }),
});

function TeamPage() {
  const { data: members } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,avatar_url").order("name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r) => {
        if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
      });
      return (profs ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "member" }));
    },
  });

  const { data: workload = {} } = useQuery({
    queryKey: ["team-workload"],
    queryFn: async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const weekAhead = new Date(today.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

      const { data: openTasks } = await supabase
        .from("tasks")
        .select("id,due_date,status")
        .neq("status", "done");
      const taskIds = (openTasks ?? []).map((t) => t.id);
      if (!taskIds.length) return {} as Record<string, { total: number; overdue: number; thisWeek: number }>;

      const { data: assignees } = await supabase
        .from("task_assignees")
        .select("task_id,user_id")
        .in("task_id", taskIds);

      const taskById = new Map((openTasks ?? []).map((t) => [t.id, t]));
      const result: Record<string, { total: number; overdue: number; thisWeek: number }> = {};
      (assignees ?? []).forEach((a) => {
        const t = taskById.get(a.task_id);
        if (!t) return;
        const bucket = (result[a.user_id] ??= { total: 0, overdue: 0, thisWeek: 0 });
        bucket.total += 1;
        if (t.due_date) {
          if (t.due_date < todayStr) bucket.overdue += 1;
          else if (t.due_date <= weekAhead) bucket.thisWeek += 1;
        }
      });
      return result;
    },
  });

  return (
    <div className="space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky text-sky-ink">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Team</h1>
            <p className="text-sm text-muted-foreground">Everyone with access to Studio, with current workload.</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(members ?? []).map((m) => {
          const initials = (m.name || m.email).split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
          const w = workload[m.id] ?? { total: 0, overdue: 0, thisWeek: 0 };
          return (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.name || m.email} /> : null}
                  <AvatarFallback className={`${pastelClasses(pickColorFromString(m.id))} text-sm font-semibold`}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name || m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${m.role === "admin" ? "bg-lavender text-lavender-ink" : "bg-mint text-mint-ink"}`}>
                  {m.role}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums">{w.total}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${w.overdue > 0 ? "text-coral-ink" : ""}`}>{w.overdue}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overdue</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums">{w.thisWeek}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">This week</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
