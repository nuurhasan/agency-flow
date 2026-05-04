import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusLabel, statusPillClasses } from "@/lib/pastel";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "awaiting_client" | "done";

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "in_review", "awaiting_client", "done"];

interface Props {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline status pill that doubles as a dropdown for quick status changes.
 * Stops click propagation so it can sit inside a row that has its own onClick.
 */
export function TaskStatusDropdown({ status, onChange, disabled, className = "" }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${statusPillClasses(status)} ${className}`}
          aria-label={`Status: ${statusLabel(status)}. Click to change.`}
        >
          {statusLabel(status)}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        className="min-w-[10rem]"
      >
        {STATUS_OPTIONS.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={(e) => {
              e.preventDefault();
              if (s !== status) onChange(s);
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${statusPillClasses(s)}`}
                aria-hidden
              />
              {statusLabel(s)}
            </span>
            {s === status && <Check className="h-3.5 w-3.5 opacity-70" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
