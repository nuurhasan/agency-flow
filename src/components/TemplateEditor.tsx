import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const PRIORITIES = ["low", "medium", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

type Item = {
  id?: string;
  title: string;
  description: string | null;
  position: number;
  default_priority: Priority;
  default_due_offset_days: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string | null;
}

export function TemplateEditor({ open, onOpenChange, templateId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);

  const { data: existing } = useQuery({
    queryKey: ["template-edit", templateId],
    enabled: open && !!templateId,
    queryFn: async () => {
      const [{ data: tpl }, { data: its }] = await Promise.all([
        supabase
          .from("task_templates")
          .select("id,name,description")
          .eq("id", templateId!)
          .maybeSingle(),
        supabase
          .from("task_template_items")
          .select("id,title,description,position,default_priority,default_due_offset_days")
          .eq("template_id", templateId!)
          .order("position"),
      ]);
      return { tpl, its: its ?? [] };
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (templateId && existing?.tpl) {
      setName(existing.tpl.name);
      setDescription(existing.tpl.description ?? "");
      setItems(
        (existing.its ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          position: i.position,
          default_priority: i.default_priority as Priority,
          default_due_offset_days: i.default_due_offset_days,
        })),
      );
    } else if (!templateId) {
      setName("");
      setDescription("");
      setItems([{ title: "", description: null, position: 0, default_priority: "medium", default_due_offset_days: null }]);
    }
  }, [open, templateId, existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!name.trim()) throw new Error("Name required");
      const cleanItems = items
        .map((i, idx) => ({ ...i, position: idx }))
        .filter((i) => i.title.trim());
      if (!cleanItems.length) throw new Error("Add at least one item");

      let id = templateId ?? null;
      if (id) {
        const { error } = await supabase
          .from("task_templates")
          .update({ name, description: description || null })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("task_templates")
          .insert({ name, description: description || null, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }

      // Replace items: delete all, re-insert (simplest reliable strategy)
      await supabase.from("task_template_items").delete().eq("template_id", id!);
      const { error: insErr } = await supabase.from("task_template_items").insert(
        cleanItems.map((i) => ({
          template_id: id!,
          title: i.title,
          description: i.description,
          position: i.position,
          default_priority: i.default_priority,
          default_due_offset_days: i.default_due_offset_days,
        })),
      );
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success(templateId ? "Template updated" : "Template created");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));
  const addItem = () =>
    setItems((arr) => [
      ...arr,
      { title: "", description: null, position: arr.length, default_priority: "medium", default_due_offset_days: null },
    ]);
  const moveItem = (idx: number, dir: -1 | 1) => {
    setItems((arr) => {
      const next = [...arr];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{templateId ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Reusable checklist. Apply it to any project to bulk-create tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tasks in this template</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4" /> Add task
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Move up"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Task title"
                        value={it.title}
                        onChange={(e) => updateItem(idx, { title: e.target.value })}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={it.default_priority}
                          onValueChange={(v) => updateItem(idx, { default_priority: v as Priority })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITIES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="Due offset (days from start)"
                          value={it.default_due_offset_days ?? ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              default_due_offset_days:
                                e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full">
            {save.isPending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
