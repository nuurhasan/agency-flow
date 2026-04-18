import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { Archive, Plus, Search } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { ProjectDialog } from "@/components/ProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pastelClasses, statusLabel, statusPillClasses } from "@/lib/pastel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/projects/")({
  component: () => (
    <AuthGate>
      <ProjectsPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Projects — Studio" }] }),
});

function ProjectsPage() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [service, setService] = React.useState<string>("all");

  const { data: projects } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,color,client_name,status,service_type,due_date,description")
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = (projects ?? []).filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (service !== "all" && p.service_type !== service) return false;
    if (q && !`${p.name} ${p.client_name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">All client work, in one colorful place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="rounded-full" size="lg">
            <Link to="/projects/archived">
              <Archive className="h-4 w-4" /> Archived
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)} className="rounded-full" size="lg">
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects or clients…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["planning", "active", "on_hold", "completed"].map((s) => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {["website", "seo", "hosting", "maintenance", "branding", "other"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-16 text-center">
          <p className="font-display text-lg font-semibold">No projects match</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Try clearing filters, or create a new project to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="group rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-pop"
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${pastelClasses(p.color)} text-lg font-bold`}>
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.client_name || "No client"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {p.service_type}
                </span>
              </div>
              {p.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                {p.status !== "active" ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPillClasses(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                ) : <span />}
                {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString()}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
