import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CheckCircle2, FolderKanban, Plus, TrendingUp } from "lucide-react";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { ProjectDialog } from "@/components/ProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AvatarStack } from "@/components/ui/avatar-stack";

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

const LOTR_QUOTES = [
  "All we have to decide is what to do with the time that is given us.",
  "Faithless is he that says farewell when the road darkens.",
  "Oft hope is born when all is forlorn.",
  "Courage will now be your best defence against the storm that is at hand—that and such hope as I bring.",
  "Do not then stumble at the end of the road.",
  "Not all those who wander are lost.",
  "The world is indeed full of peril, and in it there are many dark places; but still there is much that is fair, and though in all lands love is now mingled with grief, it grows perhaps the greater.",
  "The praise of the praiseworthy is above all rewards.",
  "For we put the thought of all that we love into all that we make.",
  "Memory is not what the heart desires. That is only a mirror.",
  "Often does hatred hurt itself!",
  "I wished to be loved by another, but I desire no man's pity.",
  "Few other griefs amid the ill chances of this world have more bitterness and shame for a man's heart than to behold the love of a lady so fair and brave that cannot be returned.",
  "You can trust us to stick to you through thick and thin—to the bitter end. And you can trust us to keep any secret of yours—closer than you yourself keep it. But you cannot trust us to let you face trouble alone, and go off without a word. We are your friends.",
  "I am going with him, if he climbs to the Moon.",
  "Don't go where I can't follow!",
  "For behold! the storm comes, and now all friends should gather together, lest each singly be destroyed.",
  "He stands not alone... You would die before your stroke fell.",
  "Come, Mr. Frodo! I can't carry it for you, but I can carry you.",
  "I am glad you are here with me. Here at the end of all things.",
  "The wide world is all about you: you can fence yourselves in, but you cannot forever fence it out.",
  "You step onto the road, and if you don't keep your feet, there's no knowing where you might be swept off to.",
  "Don't adventures ever have an end? I suppose not. Someone else always has to carry on the story.",
  "It's a dangerous business, Frodo, going out your door.",
  "The wise speak only of what they know.",
  "I don't know half of you half as well as I should like; and I like less than half of you half as well as you deserve.",
  "Yes, I am here. And you are lucky to be here too after all the absurd things you've done since you left home.",
  "Being a cheerful hobbit, he had not needed hope, as long as despair could be postponed.",
  "Elves and Dragons! Cabbages and potatoes are better for me and you. Don't go getting mixed up in the business of your betters, or you'll land in trouble too big for you.",
  "Speak, or I will make a dint in your hat that even a wizard will find it hard to deal with!",
  "It is useless to meet revenge with revenge; it will heal nothing.",
  "Even the smallest person can change the course of the future.",
  "Deeds will not be less valiant because they are unpraised.",
  "The burned hand teaches best. After that advice about fire goes to the heart.",
];

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const quote = React.useMemo(() => LOTR_QUOTES[Math.floor(Math.random() * LOTR_QUOTES.length)], []);

  const toggleDone = useMutation({
    mutationFn: async (t: { id: string; project_id: string; title: string; status: string }) => {
      const nextStatus = t.status === "done" ? "todo" : "done";
      const { error } = await supabase
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", t.id);
      if (error) throw error;
      if (user) {
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          task_id: t.id,
          project_id: t.project_id,
          action: nextStatus === "done" ? "task.completed" : "task.updated",
          meta: { title: t.title },
        });
      }
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: counters } = useQuery({
    queryKey: ["dash-counters"],
    queryFn: async () => {
      const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [a, b, c] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "done")
          .gte("completed_at", sevenAgo),
      ]);
      return {
        active: a.count ?? 0,
        inProgress: b.count ?? 0,
        completed: c.count ?? 0,
      };
    },
  });

  const { data: dash } = useQuery({
    queryKey: ["dash-projects"],
    queryFn: async () => {
      const { data: projs } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(9);
      const projects = projs ?? [];
      const ids = projects.map((p) => p.id);

      const { data: taskRows } = ids.length
        ? await supabase
            .from("tasks")
            .select("id,project_id,title,status,updated_at")
            .in("project_id", ids)
            .order("updated_at", { ascending: false })
        : { data: [] };
      const tasks = taskRows ?? [];

      const taskIds = tasks.map((t) => t.id);
      const { data: assignRows } = taskIds.length
        ? await supabase.from("task_assignees").select("task_id,user_id").in("task_id", taskIds)
        : { data: [] };
      const userIds = Array.from(new Set((assignRows ?? []).map((a) => a.user_id)));
      const { data: profRows } = userIds.length
        ? await supabase.from("profiles").select("id,name").in("id", userIds)
        : { data: [] };
      const profMap = new Map((profRows ?? []).map((p) => [p.id, p.name] as const));
      const assigneesByTask = (assignRows ?? []).reduce<Record<string, string[]>>((acc, a) => {
        const name = profMap.get(a.user_id);
        if (!name) return acc;
        (acc[a.task_id] ??= []).push(name);
        return acc;
      }, {});

      // Project-level assignees (union of all task assignees per project)
      const projectAssignees = (assignRows ?? []).reduce<Record<string, Set<string>>>((acc, a) => {
        const t = tasks.find((tk) => tk.id === a.task_id);
        if (!t) return acc;
        (acc[t.project_id] ??= new Set()).add(a.user_id);
        return acc;
      }, {});
      const projectPeopleByProject: Record<string, { id: string; name: string }[]> = {};
      Object.entries(projectAssignees).forEach(([pid, set]) => {
        projectPeopleByProject[pid] = Array.from(set)
          .map((uid) => ({ id: uid, name: profMap.get(uid) ?? "?" }))
          .filter((p) => p.name !== "?");
      });

      return { projects, tasks, assigneesByTask, projectPeopleByProject };
    },
  });

  type DashTask = NonNullable<typeof dash>["tasks"][number];
  const tasksByProject = (dash?.tasks ?? []).reduce<Record<string, DashTask[]>>((acc, t) => {
    (acc[t.project_id] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="hero-gradient relative overflow-hidden rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{todayLabel()}</p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
              Welcome to Turgon ✦
            </h1>
            <p className="mt-1 max-w-2xl italic text-muted-foreground">
              "{quote}"
            </p>
          </div>
          <Button onClick={() => setNewProjectOpen(true)} className="rounded-full shadow-pop" size="lg">
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      </div>
      <ProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Counter to="/projects" icon={<FolderKanban />} label="Active projects" value={counters?.active ?? 0} />
        <Counter to="/tasks" icon={<TrendingUp />} label="Tasks in progress" value={counters?.inProgress ?? 0} />
        <Counter to="/tasks" icon={<CheckCircle2 />} label="Completed (7d)" value={counters?.completed ?? 0} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Projects</h2>
          <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        {!dash?.projects.length ? (
          <EmptyCard
            title="No projects yet"
            body="Create your first project to start tracking work for a client."
            cta={{ label: "Create a project", onClick: () => setNewProjectOpen(true) }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dash.projects.map((p, idx) => {
                const allTasks = tasksByProject[p.id] ?? [];
                const ts = allTasks.slice(0, 3);
                const total = allTasks.length;
                const done = allTasks.filter((t) => t.status === "done").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const people = dash.projectPeopleByProject?.[p.id] ?? [];
                return (
                  <div
                    key={p.id}
                    style={{ animationDelay: `${idx * 50}ms` }}
                    className="group animate-fade-in-up rounded-3xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
                  >
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="flex items-start gap-3"
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-bold ring-0 transition-all group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-card ${pastelClasses(p.color)} ring-current/30`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold">{p.name}</p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {p.service_type}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="truncate text-xs text-muted-foreground">
                            {p.client_name || "No client"}
                          </p>
                          {p.status !== "active" && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusPillClasses(p.status)}`}
                            >
                              {statusLabel(p.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Progress */}
                    <div className="mt-4 flex items-center gap-3">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {done}/{total}
                      </span>
                      <AvatarStack people={people} max={3} size="xs" />
                    </div>

                    <div className="mt-3 space-y-0.5">
                      {ts.length === 0 ? (
                        <p className="px-1.5 py-1 text-xs italic text-muted-foreground">No tasks yet</p>
                      ) : (
                        ts.map((t) => {
                          const tdone = t.status === "done";
                          return (
                            <div
                              key={t.id}
                              className={`group/task relative flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-all ${tdone ? "opacity-60" : ""}`}
                            >
                              <span className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-muted/50 opacity-0 transition-all duration-200 group-hover/task:opacity-100" />
                              <Checkbox
                                checked={tdone}
                                onCheckedChange={() =>
                                  toggleDone.mutate({
                                    id: t.id,
                                    project_id: t.project_id,
                                    title: t.title,
                                    status: t.status,
                                  })
                                }
                                aria-label={tdone ? "Mark as not done" : "Mark as done"}
                                className="h-4 w-4 rounded"
                              />
                              <span className={`min-w-0 flex-1 truncate ${tdone ? "text-muted-foreground line-through" : ""}`}>
                                {t.title}
                              </span>
                              {dash.assigneesByTask[t.id]?.[0] && (
                                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                                  {dash.assigneesByTask[t.id][0].split(" ")[0]}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

function Counter({
  color,
  icon,
  label,
  value,
  to,
}: {
  color: "mint" | "sky" | "lavender" | "peach" | "butter" | "blush" | "coral" | "brand" | "vivid-green" | "vivid-blue" | "vivid-sunset";
  icon: React.ReactNode;
  label: string;
  value: number;
  to: "/projects" | "/tasks" | "/domains" | "/team" | "/settings" | "/vault" | "/";
}) {
  // Soft pastel surfaces — flat, low-saturation, brand-friendly
  const tints: Record<string, string> = {
    mint: "bg-mint text-mint-ink",
    sky: "bg-sky text-sky-ink",
    lavender: "bg-lavender text-lavender-ink",
    peach: "bg-peach text-peach-ink",
    butter: "bg-butter text-butter-ink",
    blush: "bg-blush text-blush-ink",
    coral: "bg-coral text-coral-ink",
    brand: "bg-primary/20 text-foreground",
    "vivid-green": "bg-mint text-mint-ink",
    "vivid-blue": "bg-sky text-sky-ink",
    "vivid-sunset": "bg-primary/25 text-foreground",
  };
  const iconBg: Record<string, string> = {
    mint: "bg-white/70 text-mint-ink",
    sky: "bg-white/70 text-sky-ink",
    lavender: "bg-white/70 text-lavender-ink",
    peach: "bg-white/70 text-peach-ink",
    butter: "bg-white/70 text-butter-ink",
    blush: "bg-white/70 text-blush-ink",
    coral: "bg-white/70 text-coral-ink",
    brand: "bg-white/80 text-foreground",
    "vivid-green": "bg-white/70 text-mint-ink",
    "vivid-blue": "bg-white/70 text-sky-ink",
    "vivid-sunset": "bg-white/80 text-foreground",
  };
  return (
    <Link
      to={to}
      className={`group relative block overflow-hidden rounded-xl border border-border p-5 shadow-soft transition-all duration-150 hover:-translate-y-0.5 hover:shadow-pop ${tints[color]}`}
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg[color]}`}>
          {icon}
        </span>
        <span className="font-display text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold opacity-80">{label}</p>
    </Link>
  );
}

function EmptyCard({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { to: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {cta && ("to" in cta ? (
        <Button asChild className="mt-4 rounded-full">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      ) : (
        <Button onClick={cta.onClick} className="mt-4 rounded-full">{cta.label}</Button>
      ))}
    </div>
  );
}

