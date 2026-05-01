import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CredentialList, useCredentialActions, type Cred } from "@/components/CredentialList";

export const Route = createFileRoute("/vault")({
  component: VaultPage,
  head: () => ({ meta: [{ title: "Credentials Vault — Studio" }] }),
});

function VaultPage() {
  const [search, setSearch] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-min"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name,color").order("name");
      return data ?? [];
    },
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ["all-credentials"],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_credentials")
        .select("id,project_id,label,url,username,notes,created_by,password_encrypted")
        .order("updated_at", { ascending: false });
      return (data ?? []).map((c) => ({
        id: c.id,
        project_id: c.project_id,
        label: c.label,
        url: c.url,
        username: c.username,
        notes: c.notes,
        created_by: c.created_by,
        has_password: !!c.password_encrypted,
      })) as Cred[];
    },
  });

  const projectById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const enriched: Cred[] = React.useMemo(
    () =>
      credentials.map((c) => ({
        ...c,
        project: projectById.get(c.project_id) ?? null,
      })),
    [credentials, projectById],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((c) => {
      if (projectFilter !== "all" && c.project_id !== projectFilter) return false;
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        (c.username ?? "").toLowerCase().includes(q) ||
        (c.url ?? "").toLowerCase().includes(q) ||
        (c.project?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [enriched, search, projectFilter]);

  const actions = useCredentialActions();
  const Dialog = actions.Dialog;

  return (
    <div className="space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
              <KeyRound className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Credentials Vault</h1>
              <p className="text-sm text-muted-foreground">
                Encrypted FTP, cPanel, WP-admin, DNS &amp; registrar logins.
              </p>
            </div>
          </div>
          <Button
            onClick={actions.openNew}
            disabled={projects.length === 0}
            className="rounded-full shadow-pop"
          >
            <Plus className="h-4 w-4" /> New credential
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border bg-card/80 p-3 shadow-soft backdrop-blur">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label, username, URL, project…"
            className="pl-9"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CredentialList
        credentials={filtered}
        showProject
        onEdit={actions.openEdit}
        onDelete={actions.onDelete}
      />

      <Dialog
        open={actions.open}
        onOpenChange={actions.setOpen}
        credential={actions.editing}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
