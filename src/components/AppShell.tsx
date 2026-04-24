import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, ListChecks, Globe2, Users, Settings, LogOut, Sparkles, AlertCircle, KeyRound, UserCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/vault", label: "Vault", icon: KeyRound },
  { to: "/hosting", label: "Hosting", icon: Globe2 },
  { to: "/team", label: "Team", icon: Users },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: expiringCount = 0 } = useQuery({
    queryKey: ["nav-domains-expiring"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const sixtyAhead = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
      const { count } = await supabase
        .from("client_domains")
        .select("id", { count: "exact", head: true })
        .gte("domain_expiry", today)
        .lte("domain_expiry", sixtyAhead)
        .eq("renewed", false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const initials = (profile?.name || profile?.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-lime text-lime-ink">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">Studio</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-lime text-lime-ink"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/hosting"
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                expiringCount > 0
                  ? "bg-coral text-coral-ink hover:bg-coral/90"
                  : "bg-mint text-mint-ink hover:bg-mint/90",
              )}
              title={expiringCount > 0 ? `${expiringCount} domain${expiringCount === 1 ? "" : "s"} expiring within 60 days` : "No domains expiring soon"}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {expiringCount} expiring
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Avatar className="h-9 w-9 border border-border transition-opacity hover:opacity-80">
                    {profile?.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt={profile.name || "Avatar"} />
                    ) : null}
                    <AvatarFallback className="bg-peach text-peach-ink text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium leading-none">{profile?.name || "Account"}</span>
                    {profile?.email ? (
                      <span className="text-xs leading-none text-muted-foreground">{profile.email}</span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/account">
                    <UserCircle className="h-4 w-4" />
                    Account settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    await signOut();
                    navigate({ to: "/login" });
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-2 md:hidden">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-lime text-lime-ink"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main key={location.pathname} className="mx-auto w-full max-w-7xl animate-in fade-in duration-200 px-4 pt-8 pb-24 md:px-8 md:pb-32">{children}</main>
    </div>
  );
}
