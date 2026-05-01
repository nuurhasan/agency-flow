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
import { invalidateCredentialData } from "@/lib/queryInvalidation";

export type CredentialRow = {
  id: string;
  project_id: string;
  label: string;
  url: string | null;
  username: string | null;
  notes: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  credential?: CredentialRow | null;
  projects?: Array<{ id: string; name: string }>;
}

export function CredentialDialog({ open, onOpenChange, projectId, credential, projects }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = React.useState(() => init(credential, projectId));
  const [password, setPassword] = React.useState("");
  const [touchedPassword, setTouchedPassword] = React.useState(false);

  React.useEffect(() => {
    setForm(init(credential, projectId));
    setPassword("");
    setTouchedPassword(false);
  }, [credential, projectId, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!form.project_id) throw new Error("Pick a project");
      let id = credential?.id;
      if (credential) {
        const { error } = await supabase
          .from("project_credentials")
          .update({
            label: form.label,
            url: form.url || null,
            username: form.username || null,
            notes: form.notes || null,
            project_id: form.project_id,
          })
          .eq("id", credential.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("project_credentials")
          .insert({
            label: form.label,
            url: form.url || null,
            username: form.username || null,
            notes: form.notes || null,
            project_id: form.project_id,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      if (id && touchedPassword) {
        const { error } = await supabase.rpc("save_credential_password", {
          _credential_id: id,
          _password: password,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(credential ? "Credential updated" : "Credential added");
      invalidateCredentialData(qc, form.project_id);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{credential ? "Edit credential" : "New credential"}</DialogTitle>
          <DialogDescription>
            Passwords are encrypted at rest. Only the creator and admins can reveal them.
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
            <Label htmlFor="c-label">Label</Label>
            <Input
              id="c-label"
              required
              placeholder="e.g. WP Admin, cPanel, Cloudflare DNS"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          {projects && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.project_id}
                onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-url">URL</Label>
              <Input
                id="c-url"
                placeholder="https://…"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-username">Username</Label>
              <Input
                id="c-username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-password">Password</Label>
            <Input
              id="c-password"
              type="password"
              placeholder={credential ? "Leave blank to keep current" : "Enter password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setTouchedPassword(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !form.label || !form.project_id}
              className="rounded-full"
            >
              {mutation.isPending ? "Saving…" : credential ? "Save" : "Add credential"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function init(c: CredentialRow | null | undefined, projectId: string | undefined) {
  return {
    label: c?.label ?? "",
    url: c?.url ?? "",
    username: c?.username ?? "",
    notes: c?.notes ?? "",
    project_id: c?.project_id ?? projectId ?? "",
  };
}
