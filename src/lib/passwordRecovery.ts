export function hasRecoveryHash(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery" && Boolean(params.get("access_token"));
}

export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < 6) return "Password must be at least 6 characters";
  if (password !== confirmation) return "Passwords don't match";
  return null;
}