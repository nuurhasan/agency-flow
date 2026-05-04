import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { UserCircle, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationPreferences } from "@/components/NotificationPreferences";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({ meta: [{ title: "Account — Studio" }] }),
});

function AccountPage() {
  const { user, profile, role, refresh } = useAuth();

  const [name, setName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  React.useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
      setEmail(profile.email ?? "");
    }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), avatar_url: avatarUrl.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const MIN_DIM = 200;
  const MAX_BYTES = 2 * 1024 * 1024;
  const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      if (!ACCEPT.includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image");
      if (file.size > MAX_BYTES) throw new Error("Image must be under 2 MB");

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not read image"));
        };
        img.src = url;
      });
      if (dims.w < MIN_DIM || dims.h < MIN_DIM) {
        throw new Error(`Image must be at least ${MIN_DIM}×${MIN_DIM}px`);
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;
      return publicUrl;
    },
    onSuccess: async (url) => {
      setAvatarUrl(url);
      toast.success("Profile picture updated");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const updateEmail = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Check your inbox to confirm the new email"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updatePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");
      if (newPassword !== confirmPassword) throw new Error("Passwords don't match");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const initials = (profile?.name || profile?.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="hero-gradient rounded-3xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-peach text-peach-ink">
            <UserCircle className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Account</h1>
            <p className="text-sm text-muted-foreground">
              Manage your profile, email, and password.
            </p>
          </div>
        </div>
      </div>

      {/* Profile */}
      <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border border-border">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || "Avatar"} /> : null}
            <AvatarFallback className="bg-peach text-peach-ink text-base font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">{profile?.name || "—"}</p>
            <p className="text-sm text-muted-foreground">
              {role ? role.charAt(0).toUpperCase() + role.slice(1) : "No role"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatar.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
              >
                {uploadAvatar.isPending ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="mr-2 h-3.5 w-3.5" /> Upload picture</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP • min 200×200px • max 2 MB
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending}
            className="rounded-full"
          >
            {saveProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </section>

      {/* Email */}
      <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div>
          <h2 className="font-display text-lg font-semibold">Email address</h2>
          <p className="text-xs text-muted-foreground">
            You'll need to confirm the change from your new inbox.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => updateEmail.mutate()}
            disabled={updateEmail.isPending || email === profile?.email}
            className="rounded-full"
          >
            {updateEmail.isPending ? "Sending…" : "Update email"}
          </Button>
        </div>
      </section>

      {/* Password */}
      <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div>
          <h2 className="font-display text-lg font-semibold">Change password</h2>
          <p className="text-xs text-muted-foreground">
            Use at least 6 characters. Pick something strong.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => updatePassword.mutate()}
            disabled={updatePassword.isPending || !newPassword || !confirmPassword}
            className="rounded-full"
          >
            {updatePassword.isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </section>

      <NotificationPreferences />
    </div>
  );
}
