import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Globe2,
  Users,
  Settings,
  LogOut,
  AlertCircle,
  KeyRound,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
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
import gloriaLogo from "@/assets/gloria9-logo.png";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/vault", label: "Vault", icon: KeyRound },
  { to: "/domains", label: "Domains", icon: Globe2 },
  { to: "/team", label: "Team", icon: Users },
] as const;

const COLLAPSED_KEY = "turgon.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  });
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed]);

  const [mobileOpen, setMobileOpen] = React.useState(false);
  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

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

  const sidebarWidth = collapsed ? "4.5rem" : "16rem";

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar transition-[width,transform] duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo / brand */}
        <div className="flex h-16 items-center gap-2 border-b border-border px-3">
          <Link to="/" className="flex items-center gap-2 overflow-hidden" aria-label="Gloria9 home">
            <img src={gloriaLogo} alt="" className="h-9 w-9 shrink-0 object-contain" />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {/* Active indicator bar */}
                    {active && (
                      <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-primary" />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-foreground")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer / domain alert */}
        <div className="border-t border-border p-2">
          <Link
            to="/domains"
            title={collapsed ? `${expiringCount} expiring` : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
              expiringCount > 0
                ? "bg-coral text-coral-ink hover:bg-coral/80"
                : "bg-mint text-mint-ink hover:bg-mint/80",
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>{expiringCount} expiring</span>}
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div
        style={{ marginLeft: undefined }}
        className="flex min-h-screen flex-col transition-[margin] duration-200 ease-out md:[margin-left:var(--shell-sidebar-w)]"
        // Apply margin via inline style on md+ using a CSS variable
        // (Tailwind arbitrary value picks up the CSS var so layout shifts on collapse.)
        ref={(el) => {
          if (el) el.style.setProperty("--shell-sidebar-w", sidebarWidth);
        }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>

          <p className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:block">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>

          <div className="ml-auto flex items-center gap-2">
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
                    <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
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
        </header>

        <main key={location.pathname} className="mx-auto w-full max-w-7xl flex-1 animate-in fade-in duration-200 px-4 pt-8 pb-24 md:px-8 md:pb-32">
          {children}
        </main>
      </div>
    </div>
  );
}
