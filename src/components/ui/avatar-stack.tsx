import * as React from "react";
import { cn } from "@/lib/utils";
import { pickColorFromString, pastelClasses } from "@/lib/pastel";

export type StackPerson = { id: string; name: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarStack({
  people,
  max = 3,
  size = "sm",
  className,
}: {
  people: StackPerson[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  const sizeClass =
    size === "xs"
      ? "h-5 w-5 text-[9px]"
      : size === "md"
        ? "h-8 w-8 text-xs"
        : "h-6 w-6 text-[10px]";
  const ring = "ring-2 ring-card";

  return (
    <div className={cn("flex -space-x-1.5", className)}>
      {shown.map((p) => (
        <span
          key={p.id}
          title={p.name}
          className={cn(
            "inline-flex items-center justify-center rounded-full font-semibold",
            sizeClass,
            ring,
            pastelClasses(pickColorFromString(p.id || p.name)),
          )}
        >
          {initials(p.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
            sizeClass,
            ring,
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
