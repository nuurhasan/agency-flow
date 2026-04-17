
# Agency PM System — Build Plan

A simple, colorful, glanceable agency operating system. Pastel UI, dashboard-first, no bloat.

## Design direction
- Playful pastel palette (mint, peach, lavender, sky, butter) on near-white background
- Rounded cards, soft shadows, colored status pills, friendly empty states
- Single-accent CTAs, generous whitespace, Inter or similar modern sans
- Fully responsive (works on laptop + tablet)

## Auth & roles
- **Open signup initially**, with an Admin toggle in Settings to disable signup once team is in
- Roles stored in a separate `user_roles` table: `admin` | `member`
- First user to sign up auto-becomes `admin`; subsequent users default to `member`
- Admins: manage team, toggle signup, delete anything, manage settings
- Members: full access to projects/tasks/clients, can't manage team

## Pages & navigation
Top nav: **Dashboard · Projects · Tasks · Hosting & Clients · Team · Settings**

### 1. Dashboard (built first — the heart)
- 4 summary counters at top: Active Projects · Tasks In Progress · Tasks Completed (7d) · Domains Expiring Soon
- **Project grid** — colorful cards showing: project name, color/icon tag, client, status pill, latest 3 tasks (title + status pill + assignee avatar)
- **Activity feed** (sidebar): recent task updates, completions, who did what, when
- **Domains expiring widget**: list of domains expiring in next 60 days, days remaining, responsible team member, color-coded urgency
- Global search bar (projects, tasks, clients)

### 2. Projects
- List/grid view with filters (status, service type, client)
- Project detail page: header (name, color, client, status, service type, dates), tabs for **Tasks**, **Credentials**, **Details**
- Create/edit project modal
- Fields: name, color tag, icon, description, status, client name, service type (website/SEO/hosting/maintenance/branding/other), created date, optional due date

### 3. Tasks (within projects + global view)
- Global Tasks page: filterable list (status, assignee, priority, project), overdue tasks highlighted in coral
- Task fields: title, description, project, assignees (multi), status (To Do / In Progress / Waiting / Done), priority (low/med/high), due date, completed date
- Simple comment thread per task
- **Email notification** sent when a user is assigned to a task
- Status changes logged into activity feed

### 4. Credentials (inside each project)
- **Encrypted at rest** using pgsodium/vault, masked with •••••• in UI
- Reveal + copy buttons
- Each entry: label, URL, username, password, notes
- Multiple entries per project (e.g. WordPress, hosting, registrar)

### 5. Hosting & Clients
- Table/card view of all client domains
- Fields: client name, domain, registrar/host, domain expiry, hosting expiry, assigned team members, notes, "renewed" toggle
- Color-coded urgency (green >60d, amber 30–60d, coral <30d, red expired)
- **Domain expiry reminder logic**:
  - Daily scheduled job checks every domain
  - Starts emailing assigned members 30 days before expiry
  - Re-sends every 5 days until either: expiry date is updated to a future date, OR record marked as renewed
  - "Mark as renewed" button bumps expiry +1 year and clears reminder state

### 6. Team
- Admin: list of members with name/email/role, change role, remove member
- Members: read-only directory

### 7. Settings
- Admin only: toggle "Allow new signups" on/off, agency name, default reminder lead time

## Email notifications
- Lovable's built-in email infrastructure (no external service needed)
- Triggered on:
  - Task assignment → assignee(s) get "You've been assigned: [task]" with link
  - Domain expiry reminders → assigned members get "[domain] expires in X days"
- Branded pastel email templates matching app style

## Data model (high level)
- `profiles` (id, name, email, avatar)
- `user_roles` (user_id, role)
- `app_settings` (singleton: signups_enabled, agency_name)
- `projects` (name, color, icon, description, status, client_name, service_type, due_date, created_by)
- `tasks` (project_id, title, description, status, priority, due_date, completed_at, created_by)
- `task_assignees` (task_id, user_id)
- `task_comments` (task_id, user_id, body)
- `activity_log` (actor_id, project_id, task_id, action, created_at)
- `project_credentials` (project_id, label, url, username, password_encrypted, notes)
- `client_domains` (client_name, domain, provider, domain_expiry, hosting_expiry, notes, renewed)
- `domain_assignees` (domain_id, user_id)
- `domain_reminder_state` (domain_id, last_sent_at, next_due_at)

Strict RLS on all tables. Authenticated team members can read everything (transparency), only admins/owners can delete sensitive records.

## Build order
1. Auth + roles + settings + base layout/navigation
2. **Dashboard** (with mock-friendly placeholders that fill in as data appears)
3. Projects (CRUD + detail page + credentials)
4. Tasks (CRUD + assignment emails + global view)
5. Hosting & Clients + domain expiry reminder cron
6. Team page + Settings polish + activity feed wiring

## Out of scope (intentionally)
File uploads, invoicing, chat, time tracking, Gantt charts, custom fields, automations builder.
