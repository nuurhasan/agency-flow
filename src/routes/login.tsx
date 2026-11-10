import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import gloriaLogo from "@/assets/gloria9-logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [
    { title: "Sign in — Turgon" },
    { name: "description", content: "Sign in to Turgon to manage your agency's projects and tasks." },
    { property: "og:title", content: "Sign in — Turgon" },
    { property: "og:description", content: "Access your agency workspace in Turgon." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [forgotPassword, setForgotPassword] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const [resetError, setResetError] = React.useState("");

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResetError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={gloriaLogo}
            alt="Gloria9"
            className="mx-auto mb-3 h-20 w-20 object-contain"
          />
          <h1 className="font-display text-3xl font-bold">Welcome to Gloria9</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Project Management Internal
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="mb-5 text-center font-display text-lg font-semibold">
            {forgotPassword ? "Reset your password" : "Sign in"}
          </h2>

          {resetSent ? (
            <div className="space-y-4 text-center">
              <p role="status" className="text-sm text-muted-foreground">
                If an account exists for that email, a password reset link will be sent. Check your inbox and spam folder.
              </p>
              <Button variant="outline" className="w-full" onClick={() => { setForgotPassword(false); setResetSent(false); }}>
                Back to sign in
              </Button>
            </div>
          ) : (
          <form onSubmit={forgotPassword ? requestReset : handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
                required
              />
            </div>
            {!forgotPassword && <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>}

            {resetError && <p role="alert" className="text-sm text-destructive">{resetError}</p>}

            <Button type="submit" disabled={busy} className="w-full rounded-full" size="lg">
              {busy ? "Working…" : forgotPassword ? "Send reset link" : "Sign in"}
            </Button>
            <Button type="button" variant="link" className="w-full text-muted-foreground" disabled={busy}
              onClick={() => { setForgotPassword(!forgotPassword); setResetError(""); setPassword(""); }}>
              {forgotPassword ? "Back to sign in" : "Forgot password?"}
            </Button>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
