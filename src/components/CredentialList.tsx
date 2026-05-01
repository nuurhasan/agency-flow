import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Copy, ExternalLink, Pencil, Trash2, KeyRound, History, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CredentialDialog, type CredentialRow } from "@/components/CredentialDialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { invalidateCredentialData } from "@/lib/queryInvalidation";

type Cred = CredentialRow & {
  created_by: string | null;
  has_password: boolean;
  project?: { id: string; name: string; color: string | null } | null;
};

export function CredentialList({
  credentials,
  showProject = false,
  onEdit,
  onDelete,
}: {
  credentials: Cred[];
  showProject?: boolean;
  onEdit: (c: Cred) => void;
  onDelete: (c: Cred) => void;
}) {
  if (!credentials.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
          <KeyRound className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-semibold">No credentials yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Securely store FTP, cPanel, WP-admin, DNS or registrar logins per project.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {credentials.map((c) => (
        <CredentialRowItem
          key={c.id}
          credential={c}
          showProject={showProject}
          onEdit={() => onEdit(c)}
          onDelete={() => onDelete(c)}
        />
      ))}
    </ul>
  );
}

function CredentialRowItem({
  credential,
  showProject,
  onEdit,
  onDelete,
}: {
  credential: Cred;
  showProject: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [revealing, setRevealing] = React.useState(false);
  const canReveal = isAdmin || credential.created_by === user?.id;

  const reveal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reveal_credential_password", {
        _credential_id: credential.id,
      });
      if (error) throw error;
      if (user) {
        await supabase
          .from("credential_reveal_log")
          .insert({ credential_id: credential.id, actor_id: user.id });
      }
      return data as string | null;
    },
    onSuccess: (val) => {
      setRevealed(val ?? "");
      qc.invalidateQueries({ queryKey: ["credential-log", credential.id], refetchType: "all" });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg.includes("unauthorized") ? "Only the creator or an admin can reveal this." : msg);
    },
    onSettled: () => setRevealing(false),
  });

  const handleReveal = () => {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    if (!credential.has_password) {
      toast.info("No password stored for this credential.");
      return;
    }
    setRevealing(true);
    reveal.mutate();
  };

  const copyValue = async (value: string | null | undefined, what: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const copyPassword = async () => {
    if (!canReveal) {
      toast.error("Only the creator or an admin can copy the password.");
      return;
    }
    if (!credential.has_password) {
      toast.info("No password stored.");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("reveal_credential_password", {
        _credential_id: credential.id,
      });
      if (error) throw error;
      if (user) {
        await supabase
          .from("credential_reveal_log")
          .insert({ credential_id: credential.id, actor_id: user.id });
      }
      qc.invalidateQueries({ queryKey: ["credential-log", credential.id], refetchType: "all" });
      await copyValue((data as string) ?? "", "Password");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy");
    }
  };

  return (
    <li className="group flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-lavender-ink">
        <KeyRound className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{credential.label}</p>
          {!credential.has_password && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3" /> No password
            </span>
          )}
          {canReveal && credential.has_password && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mint/60 px-2 py-0.5 text-[10px] text-mint-ink">
              <ShieldCheck className="h-3 w-3" /> Can reveal
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {showProject && credential.project && (
            <span className="font-medium text-foreground/70">{credential.project.name}</span>
          )}
          {credential.username && (
            <button
              type="button"
              onClick={() => copyValue(credential.username, "Username")}
              className="inline-flex items-center gap-1 hover:text-foreground"
              title="Copy username"
            >
              {credential.username}
              <Copy className="h-3 w-3" />
            </button>
          )}
          {credential.url && (
            <a
              href={credential.url.startsWith("http") ? credential.url : `https://${credential.url}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              {credential.url.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs">
            {revealed !== null ? revealed || "(empty)" : "•".repeat(12)}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleReveal}
            disabled={revealing || !canReveal}
            title={canReveal ? (revealed !== null ? "Hide" : "Reveal") : "Only creator or admin"}
          >
            {revealed !== null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={copyPassword}
            disabled={!canReveal}
            title="Copy password"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {credential.notes && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{credential.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <RevealLogSheet credentialId={credential.id} label={credential.label} />
        <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
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
                <AlertDialogTitle>Delete this credential?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes “{credential.label}” and its audit log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </li>
  );
}

function RevealLogSheet({ credentialId, label }: { credentialId: string; label: string }) {
  const [open, setOpen] = React.useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["credential-log", credentialId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("credential_reveal_log")
        .select("id,actor_id,revealed_at")
        .eq("credential_id", credentialId)
        .order("revealed_at", { ascending: false })
        .limit(50);
      const ids = Array.from(new Set((data ?? []).map((d) => d.actor_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id,name,email").in("id", ids)
        : { data: [] as Array<{ id: string; name: string; email: string }> };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p] as const));
      return (data ?? []).map((d) => ({
        ...d,
        actor: byId.get(d.actor_id),
      }));
    },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Reveal log">
          <History className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reveal log — {label}</SheetTitle>
          <SheetDescription>Who has viewed this credential.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No reveals yet.
            </p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{e.actor?.name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{e.actor?.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.revealed_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function useCredentialActions() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Cred | null>(null);
  const [open, setOpen] = React.useState(false);

  const remove = useMutation({
    mutationFn: async (c: Cred) => {
      const { error } = await supabase.from("project_credentials").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: (_data, c) => {
      toast.success("Credential deleted");
      invalidateCredentialData(qc, c.project_id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return {
    editing,
    open,
    setOpen,
    openEdit: (c: Cred) => {
      setEditing(c);
      setOpen(true);
    },
    openNew: () => {
      setEditing(null);
      setOpen(true);
    },
    onDelete: (c: Cred) => remove.mutate(c),
    Dialog: CredentialDialog,
  };
}

export type { Cred };
