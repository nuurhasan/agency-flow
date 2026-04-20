import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "./AppShell";

/** Shows a loader while auth is hydrating, redirects to /login if signed out, otherwise renders the app shell. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const navigate = useNavigate();
  // Track whether we've ever seen an authenticated user. Once true, we keep the
  // shell mounted even if `user` momentarily flickers (e.g., token refresh),
  // which prevents a full-screen loader from flashing during route navigation.
  const hasAuthedRef = React.useRef(false);
  if (user) hasAuthedRef.current = true;

  React.useEffect(() => {
    if (!loading && !user && !hasAuthedRef.current) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading && !hasAuthedRef.current) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-pulse rounded-full bg-lavender" />
      </div>
    );
  }

  if (!user && !hasAuthedRef.current) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
