import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasRecoveryHash, validateRecoveryPassword } from "@/lib/passwordRecovery";
import gloriaLogo from "@/assets/gloria9-logo.png";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [
    { title: "Reset password — Turgon" },
    { name: "description", content: "Securely reset your Turgon workspace password." },
    { property: "og:title", content: "Reset password — Turgon" },
    { property: "og:description", content: "Restore access to your Turgon workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
});

const RECOVERY_KEY = "turgon-password-recovery";

function ResetPasswordPage() {
  const [state, setState] = React.useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const recoveryHash = hasRecoveryHash(window.location.hash);
    const linkError = new URLSearchParams(window.location.hash.slice(1)).has("error") ||
      new URLSearchParams(window.location.search).has("error");
    const check = async (isRecovery: boolean) => {
      if (!isRecovery || linkError) {
        sessionStorage.removeItem(RECOVERY_KEY);
        if (active) setState("invalid");
        return;
      }
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !data.user) {
        sessionStorage.removeItem(RECOVERY_KEY);
        setState("invalid");
      } else {
        sessionStorage.setItem(RECOVERY_KEY, data.user.id);
        setState("ready");
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setTimeout(() => { if (active) void check(true); }, 0);
      if (event === "SIGNED_OUT" && active) {
        sessionStorage.removeItem(RECOVERY_KEY);
        setState((current) => current === "done" ? current : "invalid");
      }
    });
    // getSession waits for Cloud Auth to consume the URL tokens before validating the user.
    void supabase.auth.getSession().then(({ data }) => {
      const previousRecovery = Boolean(data.session?.user.id && sessionStorage.getItem(RECOVERY_KEY) === data.session.user.id);
      return check(recoveryHash || previousRecovery);
    }).catch(() => { if (active) setState("invalid"); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateRecoveryPassword(password, confirmation);
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user || sessionStorage.getItem(RECOVERY_KEY) !== data.user.id) {
        setState("invalid");
        return;
      }
      // Recovery sessions are exempt from the current-password requirement.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      sessionStorage.removeItem(RECOVERY_KEY);
      setPassword("");
      setConfirmation("");
      setState("done");
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <img src={gloriaLogo} alt="Gloria9" className="mx-auto mb-6 h-20 w-20 object-contain" />
        <section className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-soft">
          <h1 className="text-center font-display text-2xl font-semibold">Reset your password</h1>
          {state === "checking" && <p role="status" className="text-center text-sm text-muted-foreground">Checking your reset link…</p>}
          {state === "invalid" && <>
            <p role="alert" className="text-sm text-muted-foreground">This reset link is invalid or has expired. Request a new link to continue.</p>
            <Button asChild variant="outline" className="w-full"><Link to="/login">Return to sign in</Link></Button>
          </>}
          {state === "done" && <>
            <p role="status" className="text-sm text-muted-foreground">Your password has been updated. Sign in with your new password.</p>
            <Button asChild className="w-full"><Link to="/login">Sign in</Link></Button>
          </>}
          {state === "ready" && <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
          </form>}
        </section>
      </div>
    </div>
  );
}