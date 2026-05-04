import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export function humanAction(action: string, meta: Record<string, unknown> | null): string {
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
    case "task.approved":
      return `approved task "${meta?.title ?? ""}"`;
    case "project.created":
      return `created project "${meta?.name ?? ""}"`;
    case "project.updated":
      return `updated project "${meta?.name ?? ""}"`;
    case "project.status_changed":
      return `changed project status to ${meta?.status ?? ""}`;
    case "sprint.activated":
      return `activated a sprint`;
    case "sprint.completed":
      return `completed a sprint`;
    case "template.applied":
      return `applied a template`;
    case "domain.renewed":
      return `marked ${meta?.domain ?? "a domain"} as renewed`;
    default:
      return action;
  }
}

export function ActivityFeed({
  projectId,
  limit = 30,
  emptyText = "No activity yet.",
}: {
  projectId?: string;
  limit?: number;
  emptyText?: string;
}) {
  const { data: activity, isLoading } = useQuery({
    queryKey: ["activity-feed", projectId ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("activity_log")
        .select("id,action,meta,created_at,actor_id,project_id")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      const rows = data ?? [];

      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]),
      );
      const projectIds = Array.from(
        new Set(rows.map((r) => r.project_id).filter(Boolean) as string[]),
      );

      const [profsRes, projsRes] = await Promise.all([
        actorIds.length
          ? supabase.from("profiles").select("id,name").in("id", actorIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        projectIds.length && !projectId
          ? supabase.from("projects").select("id,name,color").in("id", projectIds)
          : Promise.resolve({ data: [] as { id: string; name: string; color: string }[] }),
      ]);

      const actorMap = new Map((profsRes.data ?? []).map((p) => [p.id, p.name] as const));
      const projMap = new Map(
        (projsRes.data ?? []).map((p) => [p.id, { name: p.name, color: p.color }] as const),
      );

      return rows.map((r) => ({
        ...r,
        actorName: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
        projectName: r.project_id ? projMap.get(r.project_id)?.name ?? null : null,
      }));
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading activity…</p>;
  }

  if (!activity?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {activity.map((a) => (
        <li key={a.id} className="flex gap-3 px-5 py-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lavender" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
              <span className="text-muted-foreground">
                {humanAction(a.action, (a.meta as Record<string, unknown> | null) ?? null)}
              </span>
              {!projectId && a.projectName && (
                <>
                  {" "}
                  <span className="text-muted-foreground">in</span>{" "}
                  <span className="font-medium">{a.projectName}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
