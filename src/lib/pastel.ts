// Pastel palette helpers — keeps colour logic in one place.

export const PASTEL_COLORS = [
  "mint",
  "peach",
  "lavender",
  "sky",
  "butter",
  "blush",
  "coral",
] as const;

export type PastelColor = (typeof PASTEL_COLORS)[number];

export function pastelClasses(color: string | null | undefined): string {
  const c = (color ?? "lavender") as PastelColor;
  switch (c) {
    case "mint":
      return "bg-mint text-mint-ink";
    case "peach":
      return "bg-peach text-peach-ink";
    case "lavender":
      return "bg-lavender text-lavender-ink";
    case "sky":
      return "bg-sky text-sky-ink";
    case "butter":
      return "bg-butter text-butter-ink";
    case "blush":
      return "bg-blush text-blush-ink";
    case "coral":
      return "bg-coral text-coral-ink";
    default:
      return "bg-lavender text-lavender-ink";
  }
}

export function pickColorFromString(s: string): PastelColor {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PASTEL_COLORS[hash % PASTEL_COLORS.length];
}

// Status pill colour mapping (project + task statuses).
export function statusPillClasses(status: string): string {
  switch (status) {
    case "active":
    case "in_progress":
      return "bg-sky text-sky-ink";
    case "planning":
    case "todo":
      return "bg-lavender text-lavender-ink";
    case "on_hold":
    case "in_review":
      return "bg-butter text-butter-ink";
    case "awaiting_client":
      return "bg-blush text-blush-ink";
    case "completed":
    case "done":
      return "bg-mint text-mint-ink";
    case "archived":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function priorityClasses(p: string): string {
  switch (p) {
    case "high":
      return "bg-coral text-coral-ink";
    case "medium":
      return "bg-peach text-peach-ink";
    case "low":
      return "bg-mint text-mint-ink";
    default:
      return "bg-muted text-muted-foreground";
  }
}
