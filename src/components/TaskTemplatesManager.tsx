import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pastelClasses } from "@/lib/pastel";

interface TemplateItem {
  id?: string;
  title: string;
  description?: string | null;
  default_priority: "low" | "medium" | "high";
  default_due_offset_days: number | null;
  position: number;
}

export function TaskTemplatesManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<{ id?: string; name: string; description: string; color: string; items: TemplateItem[] } | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["task-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_templates")
        .select("id,name,description,color,icon")
        .order("name");
      return data ?? [];
    },
  });

  const { data: itemCounts = {} } = useQuery({
    queryKey: ["task-template-counts", templates.map((t) => t.id).join(",")],
    enabled: templates.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_template_items")
        .select("template_id")
        .in("template_id", templates.map((t) => t.id));
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        counts[r.template_id] = (counts[r.template_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const openNew = () => setEditing({ name: "", description: "", color: "lavender", items: [] });
  const openEdit = async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const { data: items } = await supabase
      .from("task_template_items")
      .select("id,title,description,default_priority,default_due_offset_days,position")
      .eq("template_id", id)
      .order("position");
    setEditing({
      id,
      name: tpl.name,
      description: tpl.description ?? "",
      color: tpl.color,
      items: (items ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        default_priority: i.default_priority,
        default_due_offset_days: i.default_due_offset_days,
        position: i.position,
      })),
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !user) return;
      let templateId = editing.id;
      if (templateId) {
        const { error } = await supabase
          .from("task_templates")
          .update({ name: editing.name, description: editing.description || null, color: editing.color })
          .eq("id", templateId);
        if (error) throw error;
        await supabase.from("task_template_items").delete().eq("template_id", templateId);
      } else {
        const { data, error } = await supabase
          .from("task_templates")
          .insert({ name: editing.name, description: editing.description || null, color: editing.color, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        templateId = data.id;
      }
      if (editing.items.length) {
        const rows = editing.items.map((it, idx) => ({
          template_id: templateId!,
          title: it.title,
          description: it.description || null,
          default_priority: it.default_priority,
          default_due_offset_days: it.default_due_offset_days,
          position: idx,
        }));
        const { error } = await supabase.from("task_template_items").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["task-templates"] });
      qc.invalidateQueries({ queryKey: ["task-template-counts"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["task-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed (admins only)"),
  });

  const addItem = () => {
    if (!editing) return;
    setEditing({
      ...editing,
      items: [...editing.items, { title: "", default_priority: "medium", default_due_offset_days: null, position: editing.items.length }],
    });
  };
  const updateItem = (idx: number, patch: Partial<TemplateItem>) => {
    if (!editing) return;
    const items = editing.items.slice();
    items[idx] = { ...items[idx], ...patch };
    setEditing({ ...editing, items });
  };
  const removeItem = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Task templates</h2>
        </div>
        <Button onClick={openNew} size="sm" className="rounded-full">
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Predefined task lists you can apply to any project (e.g. "New website kickoff").
      </p>

      {templates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          No templates yet. Create one to speed up project setup.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-3 p-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${pastelClasses(tpl.color)}`}>
                {tpl.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{tpl.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {itemCounts[tpl.id] ?? 0} task{(itemCounts[tpl.id] ?? 0) === 1 ? "" : "s"}
                  {tpl.description ? ` · ${tpl.description}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(tpl.id)} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(tpl.id)} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Name</Label>
                  <Input id="tpl-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="New website kickoff" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-color">Color</Label>
                  <Select value={editing.color} onValueChange={(v) => setEditing({ ...editing, color: v })}>
                    <SelectTrigger id="tpl-color"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["mint", "peach", "lavender", "sky", "butter", "blush", "coral"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc">Description</Label>
                <Textarea id="tpl-desc" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tasks ({editing.items.length})</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} className="rounded-full">
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </Button>
                </div>
                {editing.items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                    No tasks in this template yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editing.items.map((it, idx) => (
                      <div key={idx} className="grid gap-2 rounded-xl border border-border bg-muted/20 p-2 sm:grid-cols-[1fr_120px_120px_36px]">
                        <Input
                          value={it.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                          placeholder="Task title"
                        />
                        <Select value={it.default_priority} onValueChange={(v) => updateItem(idx, { default_priority: v as TemplateItem["default_priority"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="+days"
                          value={it.default_due_offset_days ?? ""}
                          onChange={(e) => updateItem(idx, { default_due_offset_days: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} aria-label="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name.trim()} className="rounded-full">
              <Check className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
