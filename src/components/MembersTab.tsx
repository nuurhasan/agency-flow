import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Crown, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { pastelClasses, pickColorFromString } from "@/lib/pastel";

interface Props {
  projectId: string;
  ownerId: string;
}

export function MembersTab({ projectId, ownerId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user?.id === ownerId;

  const { data: members = [] } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("project_members")
        .select("user_id,role,added_at")
        .eq("project_id", projectId);
      const ids = (rows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url")
        .in("id", ids);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p] as const));
      return (rows ?? []).map((r) => ({
        ...r,
        profile: profMap.get(r.user_id) ?? null,
      }));
    },
  });

  const memberIdSet = new Set(members.map((m) => m.user_id));

  const { data: allPeople = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email")
        .order("name");
      return data ?? [];
    },
  });

  const candidates = allPeople.filter((p) => !memberIdSet.has(p.id));

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: userId,
        role: "member",
        added_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member added");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [pickerOpen, setPickerOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Only the people listed here can see this project.
          </p>
        </div>
        {isOwner && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button className="rounded-full" size="sm">
                <Plus className="h-4 w-4" /> Invite member
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                  Everyone is already a member.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {candidates.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        addMember.mutate(p.id);
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-all hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name || p.email}</p>
                        {p.name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                      </div>
                      <Check className="h-4 w-4 shrink-0 opacity-0" />
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <ul className="space-y-2">
        {members.map((m) => {
          const name = m.profile?.name || m.profile?.email || "Unknown";
          const initials = name
            .split(/\s+/)
            .map((s) => s[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const isThisOwner = m.role === "owner";
          return (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className={`${pastelClasses(pickColorFromString(m.user_id))} text-sm font-semibold`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {name}
                  {m.user_id === user?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.profile?.email}
                </p>
              </div>
              {isThisOwner ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-mint/60 px-2.5 py-0.5 text-[11px] font-medium text-mint-ink">
                  <Crown className="h-3 w-3" /> Owner
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Member
                </span>
              )}
              {isOwner && !isThisOwner && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                  onClick={() => removeMember.mutate(m.user_id)}
                  disabled={removeMember.isPending}
                  aria-label="Remove member"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
