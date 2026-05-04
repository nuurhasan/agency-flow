import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  taskId: string;
  projectId: string;
  taskTitle: string;
  /** Members of the project — used for @mention autocomplete. */
  members: { id: string; name: string }[];
}

type CommentRow = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentions: string[];
  created_at: string;
};

/**
 * Renders the conversation thread for a task: a list of comments and a
 * composer with @mention autocomplete. Mentions are stored as user IDs in the
 * `mentions` array on `task_comments`, so we can later notify those users
 * without re-parsing the body.
 */
export function TaskComments({ taskId, projectId, taskTitle, members }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = React.useState("");
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete state
  const [menu, setMenu] = React.useState<{
    open: boolean;
    query: string;
    /** Index in textarea where the @ that opened the menu lives. */
    atIndex: number;
    /** Currently highlighted item in the dropdown. */
    activeIndex: number;
  }>({ open: false, query: "", atIndex: -1, activeIndex: 0 });

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("id,task_id,user_id,body,mentions,created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  const authorIds = React.useMemo(
    () => Array.from(new Set(comments.map((c) => c.user_id))),
    [comments],
  );
  const { data: authors = [] } = useQuery({
    queryKey: ["task-comment-authors", taskId, authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,avatar_url")
        .in("id", authorIds);
      return data ?? [];
    },
  });
  const authorById = React.useMemo(
    () => new Map(authors.map((a) => [a.id, a] as const)),
    [authors],
  );
  const memberById = React.useMemo(
    () => new Map(members.map((m) => [m.id, m] as const)),
    [members],
  );

  const post = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const text = body.trim();
      if (!text) return;
      const mentionIds = extractMentions(text, members);

      const { data: inserted, error } = await supabase
        .from("task_comments")
        .insert({
          task_id: taskId,
          user_id: user.id,
          body: text,
          mentions: mentionIds,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Activity entry — surfaced in ActivityFeed via humanAction("task.commented").
      await supabase.from("activity_log").insert({
        actor_id: user.id,
        task_id: taskId,
        project_id: projectId,
        action: "task.commented",
        meta: { title: taskTitle, comment_id: inserted.id, mentions: mentionIds.length },
      });

      // Notify mentioned teammates (best-effort, non-blocking).
      if (mentionIds.length) {
        supabase.functions
          .invoke("send-mention-email", {
            body: {
              taskId,
              commentId: inserted.id,
              mentionIds,
              snippet: text.slice(0, 240),
            },
          })
          .catch(() => undefined);
      }
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["task-comments", taskId], refetchType: "all" });
      qc.invalidateQueries({ queryKey: ["activity-feed"], refetchType: "all" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to post"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId], refetchType: "all" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  // ---- @mention autocomplete handlers ----

  const updateMenuFromCaret = (value: string, caret: number) => {
    // Find the most recent "@" before the caret on the current word.
    const upTo = value.slice(0, caret);
    const at = upTo.lastIndexOf("@");
    if (at === -1) {
      setMenu((m) => ({ ...m, open: false }));
      return;
    }
    // Must be at the start, or preceded by whitespace, to count as a mention.
    const prev = at === 0 ? " " : upTo[at - 1];
    if (!/\s/.test(prev)) {
      setMenu((m) => ({ ...m, open: false }));
      return;
    }
    const query = upTo.slice(at + 1);
    // Close on whitespace inside the query (mention complete).
    if (/\s/.test(query)) {
      setMenu((m) => ({ ...m, open: false }));
      return;
    }
    setMenu({ open: true, query, atIndex: at, activeIndex: 0 });
  };

  const matches = React.useMemo(() => {
    if (!menu.open) return [] as typeof members;
    const q = menu.query.toLowerCase();
    return members
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [menu.open, menu.query, members]);

  const insertMention = (member: { id: string; name: string }) => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? body.length;
    const before = body.slice(0, menu.atIndex);
    const after = body.slice(caret);
    // Use a "first name" token (no spaces) so the parser can re-resolve later.
    const token = `@${member.name.split(/\s+/)[0]}`;
    const next = `${before}${token} ${after}`;
    setBody(next);
    setMenu((m) => ({ ...m, open: false }));
    // Restore caret after the inserted token + space.
    requestAnimationFrame(() => {
      const pos = before.length + token.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu.open && matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu((m) => ({ ...m, activeIndex: (m.activeIndex + 1) % matches.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu((m) => ({
          ...m,
          activeIndex: (m.activeIndex - 1 + matches.length) % matches.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(matches[menu.activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu((m) => ({ ...m, open: false }));
        return;
      }
    }
    // Submit on Cmd/Ctrl+Enter.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (body.trim()) post.mutate();
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comments {comments.length > 0 && <span className="ml-1 font-normal">({comments.length})</span>}
      </p>

      {/* Thread */}
      <div className="space-y-2.5">
        {isLoading && comments.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No comments yet. Start the conversation.
          </p>
        ) : (
          comments.map((c) => {
            const author = authorById.get(c.user_id);
            const initials = (author?.name ?? "?")
              .split(/\s+/)
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const mine = c.user_id === user?.id;
            return (
              <div key={c.id} className="group flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lavender text-[11px] font-semibold text-lavender-ink">
                  {initials || "?"}
                </span>
                <div className="min-w-0 flex-1 rounded-2xl bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium">
                      {author?.name ?? "Unknown"}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </p>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(c.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {renderBody(c.body, memberById)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate();
        }}
        className="relative"
      >
        <Textarea
          ref={taRef}
          rows={2}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            updateMenuFromCaret(e.target.value, e.target.selectionStart ?? 0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Write a comment… use @ to mention"
          className="resize-none pr-24"
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="hidden text-[10px] text-muted-foreground sm:inline">⌘↵ to send</span>
          <Button
            type="submit"
            size="sm"
            disabled={!body.trim() || post.isPending}
            className="h-7 rounded-full px-3"
          >
            <Send className="h-3.5 w-3.5" />
            {post.isPending ? "Sending…" : "Send"}
          </Button>
        </div>

        {menu.open && matches.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-pop">
            <p className="border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Mention a teammate
            </p>
            <ul className="max-h-56 overflow-y-auto py-1">
              {matches.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(m);
                    }}
                    onMouseEnter={() =>
                      setMenu((prev) => ({ ...prev, activeIndex: i }))
                    }
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      i === menu.activeIndex ? "bg-muted" : ""
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lavender text-[10px] font-semibold text-lavender-ink">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * Resolve `@firstname` tokens to user IDs by matching against the project
 * member list. Case-insensitive. Returns unique IDs.
 */
function extractMentions(text: string, members: { id: string; name: string }[]): string[] {
  const ids = new Set<string>();
  const re = /(^|\s)@([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[2].toLowerCase();
    const hit = members.find((m) => {
      const first = m.name.split(/\s+/)[0]?.toLowerCase();
      return first === token;
    });
    if (hit) ids.add(hit.id);
  }
  return Array.from(ids);
}

/**
 * Render the comment body with @mention tokens highlighted as pills when
 * they resolve to a known project member.
 */
function renderBody(
  body: string,
  memberById: Map<string, { id: string; name: string }>,
): React.ReactNode {
  // Build a lookup by first-name (lowercased) for token resolution.
  const byFirstName = new Map<string, { id: string; name: string }>();
  memberById.forEach((m) => {
    const first = m.name.split(/\s+/)[0]?.toLowerCase();
    if (first && !byFirstName.has(first)) byFirstName.set(first, m);
  });

  const parts: React.ReactNode[] = [];
  const re = /(^|\s)@([A-Za-z0-9_-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(body)) !== null) {
    const start = match.index + match[1].length; // position of the "@"
    if (start > lastIndex) parts.push(body.slice(lastIndex, start));
    const token = match[2];
    const hit = byFirstName.get(token.toLowerCase());
    if (hit) {
      parts.push(
        <span
          key={`m-${key++}`}
          className="rounded-md bg-lavender/60 px-1 font-medium text-lavender-ink"
        >
          @{token}
        </span>,
      );
    } else {
      parts.push(`@${token}`);
    }
    lastIndex = start + 1 + token.length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}
