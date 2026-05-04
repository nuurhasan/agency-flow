import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

interface Props {
  taskId: string;
}

export function TaskChecklist({ taskId }: Props) {
  const qc = useQueryClient();
  const [newItem, setNewItem] = React.useState("");

  const queryKey = ["task-checklist", taskId];

  const { data: items = [] } = useQuery<ChecklistItem[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_checklist_items")
        .select("id,task_id,title,done,position")
        .eq("task_id", taskId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const nextPos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
      const { error } = await supabase.from("task_checklist_items").insert({
        task_id: taskId,
        title: trimmed,
        position: nextPos,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewItem("");
      qc.invalidateQueries({ queryKey, refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("task_checklist_items")
        .update({ done })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ChecklistItem[]>(queryKey);
      qc.setQueryData<ChecklistItem[]>(queryKey, (old) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, done } : i)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Failed to update");
    },
    onSettled: () => qc.invalidateQueries({ queryKey, refetchType: "all" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey, refetchType: "all" }),
    onError: (e: Error) => toast.error(e.message),
  });

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <CheckSquare className="h-3.5 w-3.5" />
          Checklist
        </p>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/40"
            >
              <Checkbox
                checked={item.done}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ id: item.id, done: !!checked })
                }
              />
              <span
                className={`flex-1 text-sm ${
                  item.done ? "text-muted-foreground line-through" : ""
                }`}
              >
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(item.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete item"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newItem.trim()) addMutation.mutate(newItem);
        }}
      >
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add a checklist item…"
          className="h-8 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          disabled={!newItem.trim() || addMutation.isPending}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
