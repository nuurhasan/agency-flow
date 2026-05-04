import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { invalidateTaskData } from "@/lib/queryInvalidation";

interface Props {
  projectId: string;
}

export function ApplyTemplateButton({ projectId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [templateId, setTemplateId] = React.useState<string>("");

  const { data: templates = [] } = useQuery({
    queryKey: ["task-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_templates")
        .select("id,name")
        .order("name");
      return data ?? [];
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!templateId || !user) return;
      const { data: items, error: itErr } = await supabase
        .from("task_template_items")
        .select("title,description,default_priority,default_due_offset_days,position")
        .eq("template_id", templateId)
        .order("position");
      if (itErr) throw itErr;
      if (!items?.length) {
        toast.info("Template has no tasks");
        return;
      }
      const today = new Date();
      const rows = items.map((it) => ({
        project_id: projectId,
        title: it.title,
        description: it.description,
        priority: it.default_priority,
        due_date: it.default_due_offset_days != null
          ? new Date(today.getTime() + it.default_due_offset_days * 86400_000).toISOString().slice(0, 10)
          : null,
        created_by: user.id,
        is_backlog: true,
      }));
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        actor_id: user.id,
        project_id: projectId,
        action: "template.applied",
        meta: { template_id: templateId, count: rows.length },
      });
      return rows.length;
    },
    onSuccess: (count) => {
      if (count) toast.success(`Added ${count} task${count === 1 ? "" : "s"} from template`);
      invalidateTaskData(qc, projectId);
      setOpen(false);
      setTemplateId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (templates.length === 0) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="rounded-full">
        <Sparkles className="h-4 w-4" /> Apply template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply task template</DialogTitle>
            <DialogDescription>
              Adds all tasks from the chosen template to this project's backlog.
            </DialogDescription>
          </DialogHeader>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => apply.mutate()} disabled={!templateId || apply.isPending} className="rounded-full">
              {apply.isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
