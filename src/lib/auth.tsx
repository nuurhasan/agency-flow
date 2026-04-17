import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "member";

interface AuthState {
  loading: boolean;
  user: User | null;
  profile: { id: string; name: string; email: string; avatar_url: string | null } | null;
  role: Role | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<AuthState["profile"]>(null);
  const [role, setRole] = React.useState<Role | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadProfileAndRole = React.useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setRole(null);
      return;
    }
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,name,email,avatar_url").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);
    setProfile(prof ?? null);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    setRole(isAdmin ? "admin" : roles && roles.length > 0 ? "member" : null);
  }, []);

  React.useEffect(() => {
    // 1) subscribe FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // defer to avoid deadlocks
      setTimeout(() => {
        loadProfileAndRole(session?.user ?? null);
      }, 0);
    });
    // 2) then read existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      loadProfileAndRole(session?.user ?? null).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfileAndRole]);

  const value: AuthState = {
    loading,
    user,
    profile,
    role,
    isAdmin: role === "admin",
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      await loadProfileAndRole(user);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
