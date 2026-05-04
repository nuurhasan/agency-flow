# Scalable Email Notifications & Reminders

The project already has Lovable Emails infrastructure (pgmq queues, `process-email-queue` cron, `email_send_log`, suppression). We'll build the **notification layer** on top of it — never sending emails inline from UI/API code.

## Architecture

```text
Event (DB trigger)         User preference check         Digest batcher (cron)
       |                          |                             |
       v                          v                             v
notification_events  -->  notification_outbox (pending)  -->  enqueue_email -> pgmq -> process-email-queue -> Lovable Email
       (raw log)                  (per-recipient row)
```

Key principle: **UI code never calls the email API.** It writes a row to `notification_events`. A DB trigger fans out to `notification_outbox` per recipient (respecting prefs + dedup). A cron worker drains the outbox into the existing pgmq queue.

## Database (one migration)

1. **`notification_preferences`** (per user)
   - `user_id` PK, `mode` enum (`instant` | `digest` | `off`), `digest_frequency` (`hourly` | `daily`), `digest_hour` (0-23, default 9), `event_*` booleans:
     - `event_task_assigned`, `event_task_status_changed`, `event_task_comment`, `event_task_mention`, `event_task_due_soon`, `event_project_update`, `event_client_approval`
   - Defaults: instant mode for assignments/mentions/approval; digest for everything else.

2. **`notification_events`** (append-only audit log)
   - `id`, `actor_id`, `project_id`, `task_id`, `event_type`, `meta jsonb`, `created_at`.
   - Lets us debug spikes ("who triggered what when").

3. **`notification_outbox`** (per recipient × event)
   - `id`, `user_id`, `event_id`, `event_type`, `project_id`, `task_id`, `payload jsonb`, `dedup_key text`, `status` (`pending|sent|skipped|failed`), `scheduled_for timestamptz`, `sent_at`, `created_at`.
   - **Unique index on `(user_id, dedup_key)` where status='pending'** → guarantees no duplicate pending row for the same logical event.

4. **DB triggers** on `tasks`, `task_assignees`, `task_comments` (centralized — frontend cannot bypass):
   - `AFTER INSERT` on `task_assignees` → assignment event.
   - `AFTER UPDATE` on `tasks` when `status` changes → status event for assignees + watchers.
   - `AFTER INSERT` on `task_comments` → comment event for assignees; mention events for `@user` matches.
   - Each trigger calls `enqueue_notification(user_id, event_type, dedup_key, payload, scheduled_for)` which:
     - Checks user prefs — if `off` or specific event disabled, skip (logged as `skipped`).
     - If prefs = `instant` → insert outbox row with `scheduled_for = now()`.
     - If prefs = `digest` → insert with `scheduled_for = next digest slot`.
     - `ON CONFLICT (user_id, dedup_key) WHERE status='pending' DO NOTHING` (dedup).
   - Skip self-notification (don't email the actor).

5. **Cooldown** — `dedup_key` includes a 5-minute time bucket for noisy events (status flips):
   `task:{task_id}:status:{floor(epoch/300)}` so rapid changes collapse.

## Worker (cron, every 1 min)

New `/api/public/hooks/process-notifications` server route:
- Reads up to N (default 50) pending outbox rows where `scheduled_for <= now()`.
- **Groups by `(user_id, scheduled_for_hour)`** — if a user has ≥3 pending rows ready, render a **digest template** ("You have N updates"); otherwise render the per-event template.
- Calls `enqueue_email('transactional_emails', payload)` (the existing pgmq RPC).
- Marks outbox rows `sent` with `email_message_id`.
- Suppression check is already in `process-email-queue`, but we also skip rows for emails in `suppressed_emails` here to avoid wasted queue work.

Cron via pg_cron, every 1 minute.

## Reminders (cron-based, not real-time polling)

Daily at 8am user-local (we'll use UTC for v1):
- Insert events for tasks with `due_date = today` (assigned to user) → `event_task_due_soon`.
- Insert events for tasks `due_date < today AND status != done` → overdue reminder (1 per task per day, dedup_key includes date).

Daily/hourly digest cron:
- For users in `digest` mode, the worker already groups outbox rows; digest cron just ensures `scheduled_for` slots are processed on schedule.

## Email templates (React Email)

Create under `src/lib/email-templates/`:
- `task-assigned.tsx`
- `task-status-changed.tsx`
- `task-comment.tsx` / `task-mention.tsx`
- `task-due-reminder.tsx`
- `client-approval-request.tsx`
- `digest.tsx` — list grouped by project with deep-links

All registered in `registry.ts`. Sending uses the existing `send-transactional-email` route (no new send paths).

## UI

1. **`/account` → Notifications section** — preferences form (mode, digest freq/hour, per-event toggles). Writes to `notification_preferences`.
2. **Settings → Email log (admin only)** — paginated view of `email_send_log` + `notification_events` from the last 7 days, with counts by `template_name` and `event_type`. Helps spot spikes immediately.

## What we explicitly do NOT do

- No `useEffect`-based email triggers anywhere.
- No `fetch('/lovable/email/...')` calls from components.
- No Supabase Realtime → email bridge.
- No sending inside React Query mutations directly.

## Files

**New migration** — `notification_preferences`, `notification_events`, `notification_outbox`, `enqueue_notification()` SQL function, triggers on tasks/task_assignees/task_comments, pg_cron jobs (process-notifications every 1 min, due-date reminders daily 08:00 UTC), RLS policies, default prefs trigger on `auth.users`.

**New server route** — `src/routes/api/public/hooks/process-notifications.ts` (drains outbox, batches digests, enqueues email).

**New templates** — 6 transactional templates + digest in `src/lib/email-templates/` and updated `registry.ts`.

**New UI** — `src/components/NotificationPreferences.tsx` mounted in `/account`; `src/components/EmailActivityLog.tsx` mounted in admin Settings.

**No edits** to existing TaskDialog/TaskComments/etc. — the DB triggers handle everything centrally, which is the whole point: one source of truth, impossible to double-fire from re-renders or duplicate code paths.

## Why this fixes the spike problem

- **Single trigger source** (DB) = re-renders or duplicate API calls cannot cause extra emails.
- **Dedup unique index** = same logical event cannot enqueue twice.
- **5-min cooldown buckets** = rapid status changes collapse to one email.
- **Digest mode default** for chatty events = N updates → 1 email.
- **Existing pgmq queue** already handles rate-limit backoff (429) and retries — we reuse it.
- **`notification_events` log** = instant visibility into what's firing if usage spikes again.

Approve and I'll implement in one pass.