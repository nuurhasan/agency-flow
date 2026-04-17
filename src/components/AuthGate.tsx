import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "./AppShell";

/** Shows a loader while auth is hydrating, redirects to /login if signed out, otherwise renders the app shell. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-pulse rounded-full bg-lavender" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
