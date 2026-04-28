# Make task status pills editable

Right now the colored "Todo / In Progress / In Review / Done" tags on the right side of each task row are just labels. We'll turn them into a dropdown so you can change a task's status with one click — without opening the edit dialog.

This will work in two places that share the same pattern:
1. The project detail page (the screenshot you sent)
2. The global Tasks page (`/tasks`), which uses the same row component

## Behavior

- Click the status pill → a small dropdown opens with the four options:
  - Todo
  - In Progress
  - In Review
  - Done
- Selecting a status updates the task immediately, the pill re-colors, and the change is logged to the activity feed (same as today's done/undone toggle).
- A check mark indicates the current status.
- Clicking the pill no longer opens the task edit dialog (we'll stop the click from bubbling). The rest of the row still opens the task as before.
- The pill keeps its current pastel color styling — only behavior changes.
- If a task is mid-completion-animation (the strike-through transition after checking the checkbox), the pill stays disabled until the animation finishes, to avoid conflicts.

## Technical changes

1. **`src/routes/projects.$projectId.tsx`** — `TaskListItem`
   - Replace the static `<span>` status pill with a `DropdownMenu` (already in `@/components/ui/dropdown-menu`).
   - The trigger keeps the existing pill classes (`statusPillClasses(...)`) and gains a tiny chevron.
   - Add `onClick={(e) => e.stopPropagation()}` on the trigger so clicking the pill does not also fire the row's edit handler.
   - Add a new `updateStatus` mutation in the parent component (mirroring the existing `toggleDone` mutation) that:
     - Updates `tasks.status` to the chosen value.
     - Inserts an `activity_log` row with `action: "task.updated"` (or `"task.completed"` when moving to `done`) and `meta: { title, status }`.
     - Invalidates queries on success, toasts on error.
   - Pass `onChangeStatus(nextStatus)` into `TaskListItem` alongside the existing `onToggle` / `onEdit` props.

2. **`src/routes/tasks.tsx`** — equivalent task row (line ~505)
   - Same dropdown swap and same `updateStatus` mutation pattern, scoped to that page's task list.

3. **No DB or schema changes.** Status values already accept `todo | in_progress | in_review | done`, and the existing `toggleDone` mutation proves the update path and activity logging work.

4. **No new files.** Reuses `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem` from `src/components/ui/dropdown-menu.tsx` and the helpers in `src/lib/pastel.ts`.

## Out of scope

- The Sprint board and Kanban-style views (those already let you change status by drag/drop).
- The status pill in the task **detail dialog** header (read-only there; the dialog already has an Edit button).
- The project status pill at the top of the project page (already a dropdown).
