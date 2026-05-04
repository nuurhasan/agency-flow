import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LAST_PROJECT_KEY = "turgon.quickadd.lastProject";

export function QuickAddTask() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global shortcut: ⌘K / Ctrl+K (also "n" when not typing)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (!typing && (e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ["quickadd-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name")
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  React.useEffect(() => {
    if (!open) return;
    const last = typeof window !== "undefined" ? window.localStorage.getItem(LAST_PROJECT_KEY) : null;
    const valid = projects.find((p) => p.id === last);
    setProjectId(valid?.id ?? projects[0]?.id ?? "");
    setTitle("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, projects]);

  const create = useMutation({
    mutationFn: async ({ keepOpen }: { keepOpen: boolean }) => {
      if (!user) throw new Error("Not signed in");
      if (!title.trim()) throw new Error("Add a title");
      if (!projectId) throw new Error("Pick a project");
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: title.trim(),
          project_id: projectId,
          created_by: user.id,
          status: "todo",
          priority: "medium",
          is_backlog: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("activity_log").insert({
        actor_id: user.id,
        task_id: data.id,
        project_id: projectId,
        action: "task.created",
        meta: { title: title.trim() },
      });
      window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
      return { keepOpen };
    },
    onSuccess: ({ keepOpen }) => {
      toast.success("Task added");
      qc.invalidateQueries({ queryKey: ["all-tasks"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["dash-projects"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["dash-counters"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["projects-list-tasks"], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["my-day"], refetchType: "all" });
      if (keepOpen) {
        setTitle("");
        inputRef.current?.focus();
      } else {
        setOpen(false);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-3 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" /> Quick add
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </span>
        </div>
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create.mutate({ keepOpen: e.shiftKey });
            }
          }}
          className="h-11 text-base"
        />
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={create.isPending || !title.trim() || !projectId}
            onClick={() => create.mutate({ keepOpen: false })}
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enter to add · Shift+Enter to add &amp; keep open
        </p>
      </DialogContent>
    </Dialog>
  );
}
