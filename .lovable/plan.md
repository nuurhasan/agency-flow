# Make Turgon feel like an agency tool, not a generic task app

I audited the actual code (Projects, Tasks, TaskDialog, TaskDetailDialog, SprintBoard, ProjectDialog, ActivityFeed, schema). You already have solid bones: project status flow, sprints + backlog with DnD, priorities, statuses including **In Review**, members per project, activity log, encrypted credentials. Below are the gaps that hurt agency workflow most, ranked by impact, with each tied to a real file.

---

## High impact (build first)

### 1. Task comments + @mentions (the missing collaboration layer)
**Why:** `task_comments` table already exists with RLS but **no UI uses it** (verified: only referenced in `TaskDialog.tsx` import). For an agency this is the #1 missing piece — every revision conversation currently has to happen in Slack/email, detached from the task.
**Where:** Extend `TaskDetailDialog.tsx` with a comments thread below the description. Add `@name` autocomplete that picks from project members, stores mention IDs in `meta`, and triggers the existing `send-task-assignment-email` pattern (new edge function `send-mention-email`) so mentioned people get notified.
**Activity:** wire the existing `task.commented` action (already handled in `ActivityFeed.humanAction`).

### 2. Subtasks / checklists on a task
**Why:** Design work is inherently checklist-shaped ("export @1x/@2x/@3x", "send to client", "apply revisions"). Right now you can only create sibling tasks, which clutters the board.
**Where:** New `task_checklist_items` table (`task_id`, `title`, `done`, `position`). Render in `TaskDetailDialog` and `TaskDialog` as a lightweight inline list with a progress count ("3/7"). Show the count as a small pill next to the task title in `tasks.tsx` and on the sprint board card in `SprintBoard.tsx`.

### 3. Links / file attachments on tasks (Figma, Drive, Notion, Loom)
**Why:** Agencies live in Figma + Drive + Loom. Pasting a Figma link should produce a recognizable chip with the file name, not be buried in description text.
**Where:** New `task_links` table (`task_id`, `url`, `label`, `kind`). In `TaskDetailDialog`, show chips with auto-detected icon (figma/drive/loom/notion/generic). Auto-detect `kind` from hostname client-side. No scraping needed for v1 — just the URL + user-given label.

### 4. "My Day" / personal inbox on the dashboard
**Why:** Today the dashboard shows agency-wide counters and recent projects. A designer logging in wants **"what do I owe today?"** — overdue + due today + in-review-waiting-on-me, in one list.
**Where:** Add a left column to `src/routes/index.tsx` above the projects grid: three sections — *Overdue*, *Today*, *This week*, scoped to `assignee = me`. Reuse `DueDatePill` styling.

### 5. Quick-add task (keyboard-first)
**Why:** The current `TaskDialog` is a 7-field modal. Adding 10 tasks during a kickoff meeting is slow.
**Where:** Global `⌘K` / `N` shortcut → minimal popover: title + project (defaults to last used) + Enter to save, Shift+Enter to save & add another. Mount at `AppShell` level. Defaults: status `todo`, priority `medium`, no due date — editable later.

---

## Medium impact

### 6. Client approval / sign-off step
**Why:** Right now `in_review` is internal. Agencies need a distinct "sent to client" state and a record of who approved what and when.
**Where:** Add `awaiting_client` status to the `task_status` enum (between `in_review` and `done`) and an `approved_at` + `approved_by` column. Add an "Approve" button in `TaskDetailDialog` visible to owner/admin that flips it to `done` and writes a `task.approved` activity entry. Add `awaiting_client` as a new column in `SprintBoard.tsx`.

### 7. Revision counter
**Why:** "We're on R3" is universal agency vocabulary. Knowing a task has bounced back 4 times is a real signal.
**Where:** Add `revision_count` int default 0 on tasks. Increment via DB trigger when status moves from `in_review` → `in_progress`. Show as a small badge `R2` in task rows and detail dialog.

### 8. Client-level grouping
**Why:** `projects.client_name` is a free-text string. Agencies have **multiple projects per client** (website + SEO + maintenance) and currently can't see them grouped.
**Where:** `src/routes/clients.tsx` (new route) — list distinct `client_name` values with project counts and aggregate task progress. Or, lighter v1: add a "Group by client" toggle on `projects.index.tsx`. No schema change required initially.

### 9. Task templates per service type
**Why:** Every "new website" project starts with the same ~15 tasks. You already have `task_templates` + `task_template_items` tables (verified in schema) and `template.applied` activity action — but no UI applies them.
**Where:** "Apply template" button on the project detail page Tasks tab. Templates manageable from `settings.tsx`. This is mostly UI work — schema is done.

### 10. Workload view on Team page
**Why:** PMs need to see "who is overloaded this week" before assigning more work.
**Where:** Extend `team.tsx` with a per-member count of open tasks, broken down by `due this week / overdue / total`. Single query against `tasks` + `task_assignees`.

---

## Low impact (quick UX wins — small but felt immediately)

These are 1–2 hour fixes:

- **Inline assignee picker on rows.** In `tasks.tsx` `TaskRowItem`, clicking the `AvatarStack` opens a popover to add/remove without opening the full edit dialog.
- **Inline due-date editor.** Click the `DueDatePill` → popover calendar. Same pattern.
- **Optimistic checkbox toggles** on `tasks.tsx` and `projects.index.tsx` (the dashboard already has the linger-then-fade pattern in `TaskRowItem`; replicate for the projects list cards).
- **Sticky filter bar memory.** Persist `tasks.tsx` filters (project / assignee / priority / tab) to `localStorage` so reload doesn't reset them.
- **Bulk actions on Tasks page.** Checkbox-select multiple rows → bulk assign / set status / move to sprint. Cuts clicks dramatically during sprint planning.
- **Project archived count** badge on the "Archived" link instead of just an icon.
- **Sort tasks within a project** by priority (high first) by default on the project detail page; right now it's `updated_at` which buries new urgent items at the bottom over time.
- **Avatar colors from name hash** in `AvatarStack` so people are visually distinguishable at a glance.

---

## Agency-specific (non-obvious) ideas

- **Loom-style "ask for review" link.** A "Share with client" button on a task generates a tokenized public URL (`/api/public/review/{token}`) showing only title + description + attached links + an Approve / Request changes form. Writes back as a comment + activity entry. No client login needed — huge for client-facing handoff. Re-uses the `/api/public/*` pattern documented for webhooks.
- **Recurring tasks** for hosting/maintenance retainers ("monthly WordPress update", "quarterly SEO report"). Cron-style: `RRULE`-lite stored on a task, generated forward by a daily edge function.
- **Time-on-status tracking.** Log when a task enters `in_review` / `awaiting_client`. Surface "stuck for 5 days in review" warnings — the single most useful PM signal in agencies.
- **Project health dot** (green/amber/red) computed from: overdue task count, days since last activity, % tasks done vs % time elapsed to due date. One glance, all projects.

---

## Technical section

**Schema additions (single migration):**
```sql
-- comments already exist; just add mentions
alter table task_comments add column mentions uuid[] default '{}';

create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  url text not null,
  label text,
  kind text not null default 'generic',
  created_by uuid,
  created_at timestamptz not null default now()
);

alter type task_status add value 'awaiting_client' before 'done';
alter table tasks add column revision_count int not null default 0;
alter table tasks add column approved_at timestamptz;
alter table tasks add column approved_by uuid;
```
RLS on new tables mirrors `task_comments` (members of the parent task's project can read/write).

**Edge functions:**
- `send-mention-email` — mirrors existing `send-task-assignment-email`.
- `generate-review-link` (later, for the public-review feature) — stores a token in a new `task_review_tokens` table.

**Files touched (high-impact slice):**
- `src/components/TaskDetailDialog.tsx` — comments, checklist, links sections
- `src/components/TaskDialog.tsx` — checklist + links inline editors
- `src/routes/index.tsx` — "My Day" column
- `src/components/AppShell.tsx` — global ⌘K quick-add
- `src/components/SprintBoard.tsx` — `awaiting_client` column + checklist count on cards
- New: `src/components/TaskComments.tsx`, `src/components/TaskChecklist.tsx`, `src/components/TaskLinks.tsx`, `src/components/QuickAddTask.tsx`

---

## Suggested rollout order

1. **Comments + mentions** (#1) — biggest collaboration unlock, smallest schema change.
2. **Checklists + links** (#2, #3) — batch together, single migration.
3. **My Day + Quick-add** (#4, #5) — daily-use UX wins.
4. **Approval + revision counter** (#6, #7) — agency-specific differentiation.
5. **Templates UI + Workload view + quick UX wins** in parallel.

Approve and I'll start with step 1 (comments + mentions). Or tell me which subset you want me to tackle first and I'll narrow scope.
