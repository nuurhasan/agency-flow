import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, isAfter } from "date-fns";
import { Calendar, CheckCircle2, FolderKanban, Globe2, Plus, TrendingUp } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: DashboardRoute,
  head: () => ({ meta: [{ title: "Dashboard — Studio" }] }),
});

function DashboardRoute() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { data: counters } = useQuery({
    queryKey: ["dash-counters"],
    queryFn: async () => {
      const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const sixtyAhead = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const [a, b, c, d] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", sevenAgo),
        supabase.from("client_domains").select("id", { count: "exact", head: true }).gte("domain_expiry", today).lte("domain_expiry", sixtyAhead).eq("renewed", false),
      ]);
      return {
        active: a.count ?? 0,
        inProgress: b.count ?? 0,
        completed: c.count ?? 0,
        expiring: d.count ?? 0,
      };
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["dash-projects"],
    queryFn: async () => {
      const { data: projs } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(9);
      const ids = (projs ?? []).map((p) => p.id);
      const { data: tasks } = ids.length
        ? await supabase
            .from("tasks")
            .select("id,project_id,title,status,updated_at")
            .in("project_id", ids)
            .order("updated_at", { ascending: false })
        : { data: [] as never[] };
      const { data: assignees } = ids.length
        ? await supabase
            .from("task_assignees")
            .select("task_id,user_id,profiles:profiles!task_assignees_user_id_fkey(name)")
            .in("task_id", (tasks ?? []).map((t) => t.id))
        : { data: [] as never[] };
      return { projs: projs ?? [], tasks: tasks ?? [], assignees: (assignees ?? []) as Array<{ task_id: string; user_id: string; profiles: { name: string } | null }> };
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["dash-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("id,action,meta,created_at,actor_id,project_id,task_id,profiles:profiles!activity_log_actor_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as Array<{
        id: string;
        action: string;
        meta: Record<string, unknown> | null;
        created_at: string;
        profiles: { name: string } | null;
      }>;
    },
  });

  const { data: domains } = useQuery({
    queryKey: ["dash-domains"],
    queryFn: async () => {
      const sixtyAhead = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("client_domains")
        .select("id,client_name,domain,domain_expiry,renewed,domain_assignees(user_id,profiles:profiles!domain_assignees_user_id_fkey(name))")
        .lte("domain_expiry", sixtyAhead)
        .eq("renewed", false)
        .order("domain_expiry", { ascending: true })
        .limit(8);
      return (data ?? []) as Array<{
        id: string;
        client_name: string;
        domain: string;
        domain_expiry: string | null;
        renewed: boolean;
        domain_assignees: Array<{ user_id: string; profiles: { name: string } | null }>;
      }>;
    },
  });

  const tasksByProject = (projects?.tasks ?? []).reduce<Record<string, typeof projects.tasks>>((acc, t) => {
    (acc[t.project_id] ??= []).push(t);
    return acc;
  }, {});
  const assigneeNamesByTask = (projects?.assignees ?? []).reduce<Record<string, string[]>>((acc, a) => {
    if (!a.profiles?.name) return acc;
    (acc[a.task_id] ??= []).push(a.profiles.name);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Hey there ✦</h1>
          <p className="mt-1 text-muted-foreground">Everything happening across the agency, at a glance.</p>
        </div>
        <Button asChild className="rounded-full" size="lg">
          <Link to="/projects">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      {/* Counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Counter color="mint" icon={<FolderKanban />} label="Active projects" value={counters?.active ?? 0} />
        <Counter color="sky" icon={<TrendingUp />} label="Tasks in progress" value={counters?.inProgress ?? 0} />
        <Counter color="lavender" icon={<CheckCircle2 />} label="Completed (7d)" value={counters?.completed ?? 0} />
        <Counter color="coral" icon={<Globe2 />} label="Domains expiring" value={counters?.expiring ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Projects grid */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Projects</h2>
            <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
          {!projects?.projs.length ? (
            <EmptyCard
              title="No projects yet"
              body="Create your first project to start tracking work for a client."
              cta={{ to: "/projects", label: "Create a project" }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.projs.map((p) => {
                const ts = (tasksByProject[p.id] ?? []).slice(0, 3);
                return (
                  <Link
                    key={p.id}
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="group rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-pop"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${pastelClasses(p.color)} font-bold`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold">{p.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(p.status)}`}>
                            {statusLabel(p.status)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.client_name || "No client"}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {ts.length === 0 ? (
                        <p className="text-xs italic text-muted-foreground">No tasks yet</p>
                      ) : (
                        ts.map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{t.title}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {assigneeNamesByTask[t.id]?.[0] && (
                                <span className="text-[11px] text-muted-foreground">
                                  {assigneeNamesByTask[t.id][0].split(" ")[0]}
                                </span>
                              )}
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusPillClasses(t.status)}`}>
                                {statusLabel(t.status)}
                              </span>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Side: activity + expiring */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Activity</h2>
            {!activity?.length ? (
              <p className="text-sm text-muted-foreground">No activity yet — assign a task to start the feed.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lavender" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.profiles?.name ?? "Someone"}</span>{" "}
                        <span className="text-muted-foreground">{humanAction(a.action, a.meta)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Domains expiring</h2>
              <Link to="/hosting" className="text-xs text-muted-foreground hover:text-foreground">
                All
              </Link>
            </div>
            {!domains?.length ? (
              <p className="text-sm text-muted-foreground">Nothing expiring in the next 60 days. ✨</p>
            ) : (
              <ul className="space-y-3">
                {domains.map((d) => {
                  const days = d.domain_expiry
                    ? Math.ceil((new Date(d.domain_expiry).getTime() - Date.now()) / 86400_000)
                    : null;
                  const urgency =
                    days === null
                      ? "bg-muted text-muted-foreground"
                      : days < 0
                      ? "bg-destructive/15 text-destructive"
                      : days <= 30
                      ? "bg-coral text-coral-ink"
                      : "bg-butter text-butter-ink";
                  const owner = d.domain_assignees[0]?.profiles?.name;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.domain}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.client_name}
                          {owner ? ` · ${owner}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${urgency}`}>
                        <Calendar className="mr-1 inline h-3 w-3" />
                        {days === null ? "—" : days < 0 ? "Expired" : `${days}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pastelClasses(color)}`}>
          {icon}
        </span>
        <span className="font-display text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyCard({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {cta && (
        <Button asChild className="mt-4 rounded-full">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}

function humanAction(action: string, meta: Record<string, unknown> | null): string {
  switch (action) {
    case "task.created":
      return `created task "${meta?.title ?? ""}"`;
    case "task.completed":
      return `completed task "${meta?.title ?? ""}"`;
    case "task.updated":
      return `updated task "${meta?.title ?? ""}"`;
    case "task.assigned":
      return `assigned a task`;
    case "task.commented":
      return `commented on a task`;
    case "project.created":
      return `created project "${meta?.name ?? ""}"`;
    case "project.updated":
      return `updated project "${meta?.name ?? ""}"`;
    case "domain.renewed":
      return `marked ${meta?.domain ?? "a domain"} as renewed`;
    default:
      return action;
  }
}

// silence unused import warning for isAfter / format if removed
void isAfter;
void format;
