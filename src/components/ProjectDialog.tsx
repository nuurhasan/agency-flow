import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
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
    owner_id?: string;
  } | null;
}

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => initial(project));
  const [memberIds, setMemberIds] = React.useState<string[]>([]);

  // Everyone in the agency (potential invitees)
  const { data: people = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email")
        .order("name");
      return data ?? [];
    },
  });

  // Existing members for this project (only when editing)
  const { data: existingMembers } = useQuery({
    queryKey: ["project-members", project?.id],
    enabled: !!project?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_members")
        .select("user_id,role")
        .eq("project_id", project!.id);
      return data ?? [];
    },
  });

  React.useEffect(() => {
    setForm(initial(project));
  }, [project, open]);

  React.useEffect(() => {
    if (!open) return;
    if (project && existingMembers) {
      setMemberIds(
        existingMembers
          .filter((m) => m.role !== "owner")
          .map((m) => m.user_id),
      );
    } else if (!project) {
      setMemberIds([]);
    }
  }, [open, project, existingMembers]);

  const ownerId = project?.owner_id ?? user?.id ?? "";
  const toggleMember = (id: string) => {
    if (id === ownerId) return; // owner is implicit, can't toggle off
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      let pid: string;
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
        pid = project.id;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: pid,
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
            owner_id: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        pid = data.id;
        await supabase.from("activity_log").insert({
          actor_id: user.id,
          project_id: pid,
          action: "project.created",
          meta: { name: form.name },
        });
      }

      // Sync members (only the owner can do this; non-owners' calls will be no-ops via RLS)
      if (project) {
        const existingIds = new Set(
          (existingMembers ?? [])
            .filter((m) => m.role !== "owner")
            .map((m) => m.user_id),
        );
        const desiredIds = new Set(memberIds.filter((id) => id !== ownerId));
        const toAdd = [...desiredIds].filter((id) => !existingIds.has(id));
        const toRemove = [...existingIds].filter((id) => !desiredIds.has(id));
        if (toAdd.length) {
          const { error } = await supabase.from("project_members").insert(
            toAdd.map((uid) => ({
              project_id: pid,
              user_id: uid,
              role: "member" as const,
              added_by: user.id,
            })),
          );
          if (error) throw error;
        }
        if (toRemove.length) {
          const { error } = await supabase
            .from("project_members")
            .delete()
            .eq("project_id", pid)
            .in("user_id", toRemove);
          if (error) throw error;
        }
      } else if (memberIds.length) {
        const desired = memberIds.filter((id) => id !== user.id);
        if (desired.length) {
          const { error } = await supabase.from("project_members").insert(
            desired.map((uid) => ({
              project_id: pid,
              user_id: uid,
              role: "member" as const,
              added_by: user.id,
            })),
          );
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project created");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const isOwner = !project || project.owner_id === user?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Give it a name, a color, and invite the people who should see it.
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
                  {SERVE_DUMMY_NEVER_USED(SERVICE_TYPES).map((s) => (
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Members</Label>
              <span className="text-[11px] text-muted-foreground">
                {isOwner ? "Tap to invite or remove" : "Only the owner can change members"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Only the owner and invited members can see this project.
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-border bg-background/50 p-2">
              {people.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No teammates yet.</p>
              )}
              {people.map((p) => {
                const isProjectOwner = p.id === ownerId;
                const checked = isProjectOwner || memberIds.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggleMember(p.id)}
                    disabled={isProjectOwner || !isOwner}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-all ${checked ? "bg-lavender/40 text-lavender-ink" : "hover:bg-muted"} ${isProjectOwner || !isOwner ? "cursor-default opacity-90" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {p.name || p.email}
                      {isProjectOwner && (
                        <span className="ml-1.5 rounded-full bg-mint/60 px-1.5 py-0.5 text-[10px] font-medium text-mint-ink">
                          owner
                        </span>
                      )}
                    </span>
                    {checked && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
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

// Trick to keep map stable
function SERVE_DUMMY_NEVER_USED<T>(arr: readonly T[]): readonly T[] {
  return arr;
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
