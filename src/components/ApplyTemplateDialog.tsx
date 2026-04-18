import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  projects?: Array<{ id: string; name: string }>;
}

export function ApplyTemplateDialog({ open, onOpenChange, projectId, projects }: Props) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = React.useState<string>("");
  const [project, setProject] = React.useState<string>(projectId ?? "");
  const [startDate, setStartDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  React.useEffect(() => {
    if (open) {
      setTemplateId("");
      setProject(projectId ?? "");
      setStartDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, projectId]);

  const { data: templates = [] } = useQuery({
    queryKey: ["task-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_templates")
        .select("id,name,description")
        .order("name");
      return data ?? [];
    },
  });

  const { data: itemCount } = useQuery({
    queryKey: ["template-item-count", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { count } = await supabase
        .from("task_template_items")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId);
      return count ?? 0;
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!templateId || !project) throw new Error("Pick a template and project");
      const { data, error } = await supabase.rpc("apply_task_template", {
        _template_id: templateId,
        _project_id: project,
        _start_date: startDate || new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Created ${n} task${n === 1 ? "" : "s"} from template`);
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply a task template</DialogTitle>
          <DialogDescription>
            Bulk-create tasks from a saved checklist. Due dates are calculated from the start date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!!templateId && itemCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                Will create <strong>{itemCount}</strong> task{itemCount === 1 ? "" : "s"}.
              </p>
            )}
          </div>
          {projects && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-start">Start date (for due-date offsets)</Label>
            <Input
              id="t-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => apply.mutate()}
            disabled={apply.isPending || !templateId || !project}
            className="rounded-full"
          >
            {apply.isPending ? "Applying…" : "Apply template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
