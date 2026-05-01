import type { QueryClient } from "@tanstack/react-query";

export function invalidateProjectData(qc: QueryClient, projectId?: string) {
  qc.invalidateQueries({ queryKey: ["projects-list"] });
  qc.invalidateQueries({ queryKey: ["projects-list-tasks"] });
  qc.invalidateQueries({ queryKey: ["projects-min"] });
  qc.invalidateQueries({ queryKey: ["projects-archived"] });
  qc.invalidateQueries({ queryKey: ["dash-projects"] });
  qc.invalidateQueries({ queryKey: ["dash-counters"] });
  qc.invalidateQueries({ queryKey: ["active-sprints"] });
  qc.invalidateQueries({ queryKey: ["activity-feed"] });

  if (projectId) {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["project-members", projectId] });
  }
}

export function invalidateTaskData(qc: QueryClient, projectId?: string) {
  qc.invalidateQueries({ queryKey: ["all-tasks"] });
  qc.invalidateQueries({ queryKey: ["all-task-assignees"] });
  qc.invalidateQueries({ queryKey: ["dash-projects"] });
  qc.invalidateQueries({ queryKey: ["dash-counters"] });
  qc.invalidateQueries({ queryKey: ["projects-list-tasks"] });
  qc.invalidateQueries({ queryKey: ["activity-feed"] });

  if (projectId) {
    qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["project-sprints", projectId] });
    qc.invalidateQueries({ queryKey: ["project-task-assignees", projectId] });
  }
}

export function invalidateCredentialData(qc: QueryClient, projectId?: string) {
  qc.invalidateQueries({ queryKey: ["all-credentials"] });
  if (projectId) {
    qc.invalidateQueries({ queryKey: ["project-credentials", projectId] });
  }
}

export function invalidateDomainData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["client_domains"] });
  qc.invalidateQueries({ queryKey: ["domain-assignees-all"] });
  qc.invalidateQueries({ queryKey: ["nav-domains-expiring"] });
}