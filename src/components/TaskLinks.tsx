import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Figma,
  Github,
  Link2,
  Plus,
  Trash2,
  Video,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TaskLink {
  id: string;
  task_id: string;
  url: string;
  label: string | null;
  kind: string;
  created_at: string;
}

interface Props {
  taskId: string;
}

function detectKind(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("figma.com")) return "figma";
    if (host.includes("loom.com")) return "loom";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "video";
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "drive";
    if (host.includes("github.com")) return "github";
    if (host.includes("notion.so") || host.includes("notion.com")) return "notion";
    return "other";
  } catch {
    return "other";
  }
}

function kindIcon(kind: string) {
  switch (kind) {
    case "figma":
      return <Figma className="h-3.5 w-3.5" />;
    case "loom":
    case "video":
      return <Video className="h-3.5 w-3.5" />;
    case "github":
      return <Github className="h-3.5 w-3.5" />;
    case "drive":
    case "notion":
      return <FileText className="h-3.5 w-3.5" />;
    default:
      return <Link2 className="h-3.5 w-3.5" />;
  }
}

function displayLabel(link: TaskLink) {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return link.url;
  }
}

export function TaskLinks({ taskId }: Props) {
  const qc = useQueryClient();
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const queryKey = ["task-links", taskId];

  const { data: links = [] } = useQuery<TaskLink[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_links")
        .select("id,task_id,url,label,kind,created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      // Validate URL
      let normalized = trimmedUrl;
      if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
      try {
        new URL(normalized);
      } catch {
        throw new Error("Invalid URL");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_links").insert({
        task_id: taskId,
        url: normalized,
        label: label.trim() || null,
        kind: detectKind(normalized),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setUrl("");
      setLabel("");
      setAdding(false);
      qc.invalidateQueries({ queryKey, refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey, refetchType: "all" }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Links & files
        </p>
        {!adding && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" /> Add
          </Button>
        )}
      </div>

      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((link) => (
            <li
              key={link.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/40"
            >
              <span className="text-muted-foreground">{kindIcon(link.kind)}</span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center gap-1 truncate text-sm text-primary hover:underline"
              >
                <span className="truncate">{displayLabel(link)}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
              </a>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(link.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete link"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form
          className="space-y-2 rounded-xl border border-border bg-muted/20 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://figma.com/..."
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!url.trim() || addMutation.isPending}
            >
              Add link
            </Button>
          </div>
        </form>
      )}

      {!adding && links.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          No links yet. Attach Figma boards, Loom recordings, briefs, or anything with a URL.
        </p>
      )}
    </div>
  );
}
