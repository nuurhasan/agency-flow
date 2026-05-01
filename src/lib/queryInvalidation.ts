import type { QueryClient, InvalidateQueryFilters } from "@tanstack/react-query";

// refetchType: "all" makes BOTH active (mounted) and inactive queries refetch immediately.
// Without this, an inactive list (e.g. /projects when user is on dashboard) stays stale
// and won't refresh until the user hard-reloads, because refetchOnMount won't fire if
// data appears fresh once it's eventually re-fetched on visit.
const opts = { refetchType: "all" as const };

function inv(qc: QueryClient, filters: InvalidateQueryFilters) {
  qc.invalidateQueries({ ...filters, ...opts });
}

export function invalidateProjectData(qc: QueryClient, projectId?: string) {
  inv(qc, { queryKey: ["projects-list"] });
  inv(qc, { queryKey: ["projects-list-tasks"] });
  inv(qc, { queryKey: ["projects-min"] });
  inv(qc, { queryKey: ["projects-archived"] });
  inv(qc, { queryKey: ["dash-projects"] });
  inv(qc, { queryKey: ["dash-counters"] });
  inv(qc, { queryKey: ["active-sprints"] });
  inv(qc, { queryKey: ["activity-feed"] });

  if (projectId) {
    inv(qc, { queryKey: ["project", projectId] });
    inv(qc, { queryKey: ["project-members", projectId] });
  }
}

export function invalidateTaskData(qc: QueryClient, projectId?: string) {
  inv(qc, { queryKey: ["all-tasks"] });
  inv(qc, { queryKey: ["all-task-assignees"] });
  inv(qc, { queryKey: ["dash-projects"] });
  inv(qc, { queryKey: ["dash-counters"] });
  inv(qc, { queryKey: ["projects-list-tasks"] });
  inv(qc, { queryKey: ["activity-feed"] });

  if (projectId) {
    inv(qc, { queryKey: ["project-tasks", projectId] });
    inv(qc, { queryKey: ["project-sprints", projectId] });
    inv(qc, { queryKey: ["project-task-assignees", projectId] });
  }
}

export function invalidateCredentialData(qc: QueryClient, projectId?: string) {
  inv(qc, { queryKey: ["all-credentials"] });
  if (projectId) {
    inv(qc, { queryKey: ["project-credentials", projectId] });
  }
}

export function invalidateDomainData(qc: QueryClient) {
  inv(qc, { queryKey: ["client_domains"] });
  inv(qc, { queryKey: ["domain-assignees-all"] });
  inv(qc, { queryKey: ["nav-domains-expiring"] });
}
