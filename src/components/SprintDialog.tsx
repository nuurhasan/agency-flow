import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Sprint = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sprint?: Sprint | null;
}

export function SprintDialog({ open, onOpenChange, projectId, sprint }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => initial(sprint));

  React.useEffect(() => {
    setForm(initial(sprint));
  }, [sprint, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (sprint) {
        const { error } = await supabase
          .from("sprints")
          .update({
            name: form.name,
            goal: form.goal || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
          })
          .eq("id", sprint.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sprints").insert({
          project_id: projectId,
          name: form.name,
          goal: form.goal || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          created_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(sprint ? "Sprint updated" : "Sprint created");
      qc.invalidateQueries({ queryKey: ["project-sprints", projectId], refetchType: "all" });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{sprint ? "Edit sprint" : "New sprint"}</DialogTitle>
          <DialogDescription>
            Group tasks into a focused time-boxed effort.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={form.name}
              required
              placeholder="Sprint 1"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-start">Start date</Label>
              <Input
                id="s-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-end">End date</Label>
              <Input
                id="s-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-goal">Goal</Label>
            <Textarea
              id="s-goal"
              rows={3}
              placeholder="What do we want to ship by the end of this sprint?"
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="rounded-full">
              {mutation.isPending ? "Saving…" : sprint ? "Save" : "Create sprint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(s: Sprint | null | undefined) {
  return {
    name: s?.name ?? "",
    goal: s?.goal ?? "",
    start_date: s?.start_date ?? "",
    end_date: s?.end_date ?? "",
  };
}
