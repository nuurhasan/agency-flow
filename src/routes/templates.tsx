import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ListChecks, Pencil, Trash2, Sparkles, Layers } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TemplateEditor } from "@/components/TemplateEditor";
import { ApplyTemplateDialog } from "@/components/ApplyTemplateDialog";

export const Route = createFileRoute("/templates")({
  component: () => (
    <AuthGate>
      <TemplatesPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Task Templates — Studio" }] }),
});

function TemplatesPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [applyTemplateSeed, setApplyTemplateSeed] = React.useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["task-templates-with-counts"],
    queryFn: async () => {
      const { data: tpls } = await supabase
        .from("task_templates")
        .select("id,name,description,color,icon,updated_at")
        .order("name");
      const ids = (tpls ?? []).map((t) => t.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: items } = await supabase
          .from("task_template_items")
          .select("template_id")
          .in("template_id", ids);
        (items ?? []).forEach((i) => {
          counts[i.template_id] = (counts[i.template_id] ?? 0) + 1;
        });
      }
      return (tpls ?? []).map((t) => ({ ...t, item_count: counts[t.id] ?? 0 }));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-min"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name").order("name");
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openNew = () => {
    setEditingId(null);
    setEditorOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setEditorOpen(true);
  };
  const openApply = (id?: string) => {
    setApplyTemplateSeed(id ?? null);
    setApplyOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-peach text-peach-ink">
              <Layers className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Task Templates</h1>
              <p className="text-sm text-muted-foreground">
                Reusable checklists for repeatable agency workflows.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openApply()}
              disabled={templates.length === 0 || projects.length === 0}
              className="rounded-full"
            >
              <Sparkles className="h-4 w-4" /> Apply to project
            </Button>
            <Button onClick={openNew} className="rounded-full shadow-pop">
              <Plus className="h-4 w-4" /> New template
            </Button>
          </div>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
            <ListChecks className="h-6 w-6" />
          </span>
          <p className="mt-3 font-display text-lg font-semibold">No templates yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Build your first checklist to bulk-create tasks for new projects.
          </p>
          <Button onClick={openNew} className="mt-4 rounded-full">
            <Plus className="h-4 w-4" /> New template
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t, idx) => (
            <li
              key={t.id}
              style={{ animationDelay: `${idx * 40}ms` }}
              className="animate-fade-in-up group flex flex-col rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-pop"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t.item_count} task{t.item_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t.id)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            “{t.name}” and its {t.item_count} item{t.item_count === 1 ? "" : "s"} will be removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(t.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
              {t.description && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{t.description}</p>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openApply(t.id)}
                disabled={projects.length === 0 || t.item_count === 0}
                className="mt-4 rounded-full"
              >
                <Sparkles className="h-4 w-4" /> Apply to project
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TemplateEditor open={editorOpen} onOpenChange={setEditorOpen} templateId={editingId} />
      <ApplyTemplateDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        projects={projects}
        key={applyTemplateSeed ?? "new"}
      />
    </div>
  );
}
