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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PASTEL_COLORS, pastelClasses } from "@/lib/pastel";

const SERVICE_TYPES = ["website", "seo", "hosting", "maintenance", "branding", "other"] as const;
const STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: {
    id: string;
    name: string;
    color: string;
    icon: string;
    description: string | null;
    status: (typeof STATUSES)[number];
    client_name: string;
    service_type: (typeof SERVICE_TYPES)[number];
    due_date: string | null;
  } | null;
}

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => initial(project));

  React.useEffect(() => {
    setForm(initial(project));
  }, [project, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (project) {
        const { error } = await supabase
          .from("projects")
          .update({
            name: form.name,
            color: form.color,
            description: form.description || null,
            status: form.status,
            client_name: form.client_name,
            service_type: form.service_type,
            due_date: form.due_date || null,
          })
          .eq("id", project.id);
        if (error) throw error;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: project.id,
          action: "project.updated",
          meta: { name: form.name },
        });
      } else {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            name: form.name,
            color: form.color,
            description: form.description || null,
            status: form.status,
            client_name: form.client_name,
            service_type: form.service_type,
            due_date: form.due_date || null,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: data.id,
          action: "project.created",
          meta: { name: form.name },
        });
      }
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project created");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Give it a name, a color, and a client. You can change everything later.
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
            <Label htmlFor="p-name">Project name</Label>
            <Input
              id="p-name"
              value={form.name}
              required
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-client">Client name</Label>
              <Input
                id="p-client"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-due">Due date</Label>
              <Input
                id="p-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service type</Label>
              <Select value={form.service_type} onValueChange={(v) => setForm((f) => ({ ...f, service_type: v as typeof form.service_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Color tag</Label>
            <div className="flex flex-wrap gap-2">
              {PASTEL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`h-9 w-9 rounded-2xl ${pastelClasses(c)} ring-offset-background transition-all ${form.color === c ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="rounded-full">
              {mutation.isPending ? "Saving…" : project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initial(p: Props["project"]) {
  return {
    name: p?.name ?? "",
    color: p?.color ?? "lavender",
    description: p?.description ?? "",
    status: p?.status ?? ("active" as const),
    client_name: p?.client_name ?? "",
    service_type: p?.service_type ?? ("website" as const),
    due_date: p?.due_date ?? "",
  };
}
