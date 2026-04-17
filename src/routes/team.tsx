import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { pickColorFromString, pastelClasses } from "@/lib/pastel";

export const Route = createFileRoute("/team")({
  component: () => (
    <AuthGate>
      <TeamPage />
    </AuthGate>
  ),
  head: () => ({ meta: [{ title: "Team — Studio" }] }),
});

function TeamPage() {
  const { data: members } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,avatar_url").order("name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r) => {
        if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
      });
      return (profs ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "member" }));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Team</h1>
        <p className="mt-1 text-muted-foreground">Everyone with access to Studio.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(members ?? []).map((m) => {
          const initials = (m.name || m.email).split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <Avatar className="h-11 w-11">
                <AvatarFallback className={`${pastelClasses(pickColorFromString(m.id))} text-sm font-semibold`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name || m.email}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${m.role === "admin" ? "bg-lavender text-lavender-ink" : "bg-mint text-mint-ink"}`}>
                {m.role}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
