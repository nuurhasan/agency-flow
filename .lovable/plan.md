

# Plan: Polish dashboard + tasks UI, and a feature roadmap for an SEO/hosting agency

Two parts: (1) concrete UI polish for the homepage project section and `/tasks`, and (2) a prioritized feature roadmap tailored to a design + SEO + hosting agency.

---

## Part 1 — Visual polish (Dashboard + Tasks)

Direction: keep the playful pastel system, but tighten hierarchy, add subtle motion, and lean into "calm modern" — fewer borders, more whitespace, soft gradients on hero areas, consistent rounded-3xl cards with hover lift.

### Dashboard project cards (`src/routes/index.tsx`)
- **Header refresh**: replace "Hey there ✦" with a time-aware greeting + today's date + a slim KPI strip.
- **Counter cards**: add a tiny sparkline trend (last 7 days) under the number for "Tasks in progress" and "Completed". Use a soft pastel gradient background instead of flat card.
- **Project card upgrade**:
  - Top-left color square gets a subtle gradient (e.g. `from-mint to-mint/60`) and a thin colored ring on hover.
  - Add a **progress bar** under the project name (X of Y tasks done) — instantly readable.
  - Show **stacked avatars** of project assignees (top 3 + overflow).
  - Service-type chip moved to top-right next to status pill.
  - Task rows: lighter dividers, hover background slides in from the left, completed tasks fade to ~60% opacity.
  - Add a small "+" inline at the bottom of the list to quick-add a task without leaving the dashboard.
- **Animation**: cards fade-in stagger on mount (`animate-fade-in` with 50ms delay per card). Hover uses `hover:-translate-y-0.5` + softer shadow transition.

### Tasks page (`src/routes/tasks.tsx`)
- **Sticky filter bar** with a frosted/blur background so it stays visible while scrolling.
- **Active filter chips** under the bar (e.g. "Project: Acme ×") so users can see and remove filters at a glance.
- **Task row redesign**:
  - Left vertical color bar showing project color (4px) — instantly groups visually.
  - Larger, custom-styled checkbox that animates a check-draw on completion.
  - Inline assignee avatars instead of comma-separated names.
  - Due date as a colored pill (mint = future, butter = soon, coral = overdue) instead of plain text.
  - Subtle row slide-out animation when a task is checked off.
- **View toggle**: add a List / Board (Kanban by status) toggle. Board columns: Todo, In progress, Waiting, Done — drag between columns.
- **Empty/done celebrations**: when "Open" tab hits 0, show a friendly illustration + "Inbox zero ✨".
- **Quick-add row** at the top of each project group on the Tasks page (press Enter to create).

### Shared polish
- Add `animate-fade-in` and a new `animate-stagger-in` keyframe to `src/styles.css`.
- Introduce a reusable `<StatPill>` and `<AvatarStack>` component in `src/components/ui/` for consistency.
- Replace remaining `rounded-md` on primary buttons with `rounded-full` site-wide for cohesion.
- Soft pastel gradient banner at the top of Dashboard and Tasks (e.g. `bg-gradient-to-br from-lavender/40 via-background to-mint/30`) for a more "premium" feel without losing minimalism.

---

## Part 2 — Feature roadmap for a design / SEO / hosting agency

Grouped by impact. Pick any subset to implement next.

### A. Hosting & Domain (deepen the core differentiator)
1. **Credentials vault per project** — encrypted FTP / cPanel / WP-admin / DNS / registrar logins with masked UI, reveal + copy button, audit log of who viewed what.
2. **Uptime monitoring** — ping each domain every 5 min via a cron edge function, store status, show green/red dot on Hosting page + alert email when down.
3. **SSL expiry tracking** — alongside domain/hosting expiry, fetch SSL cert expiry once a day; same color-coded urgency.
4. **Renewal cost & margin tracker** — store cost (what you pay registrar) vs. price (what client pays), surface annual revenue from hosting at a glance.
5. **Auto-invoice on renewal** — generate a renewal invoice (PDF) when "Mark as renewed" is clicked, emailed to client.

### B. SEO toolkit (high-value for an SEO agency)
6. **Keyword tracker per project** — store target keywords, fetch SERP rank weekly (via SerpApi / DataForSEO), show trend graph.
7. **Site audit snapshot** — on-demand PageSpeed + Core Web Vitals fetch (Google PageSpeed Insights API), saved as monthly snapshots per project.
8. **Backlink log** — manual + auto entry of acquired backlinks per project, with DA/DR field and status (live / lost).
9. **Monthly client SEO report** — auto-compile rank changes + traffic + backlinks + tasks-completed into a branded PDF, emailed monthly.
10. **Google Search Console & GA4 integration** — pull clicks/impressions/sessions per project domain into the dashboard.

### C. Client-facing polish
11. **Client portal** (read-only role) — clients log in to see their project status, completed tasks, upcoming renewals, and reports. Big trust win.
12. **Public status page** per client (optional, tokenized URL) — uptime + recent updates.
13. **Approvals / proofing** — designer uploads a mockup, client clicks Approve / Request changes, threaded comments per pin on the image.

### D. Project & ops productivity
14. **Recurring tasks / templates** — "New WordPress site" template auto-creates 15 tasks; "Monthly SEO" recurs every month.
15. **Time tracking** (lightweight) — start/stop timer on a task, weekly summary per member.
16. **Calendar view** (`/calendar`) — month grid showing tasks by due date + domain renewals + project deadlines, color-coded.
17. **Pipeline / leads board** — Kanban for prospects (Lead → Proposal → Won/Lost) before they become projects.

### E. Communication & notifications
18. **Wire up the assignment + renewal emails** (infrastructure already deployed).
19. **In-app notifications bell** — task assigned, comment added, domain expiring, monitor down.
20. **Slack / Discord webhook** per project for activity feed.

### F. Billing & finance (lighter touch)
21. **Simple invoicing** — generate PDF invoices for projects (one-off) + recurring (hosting). Stripe payment link per invoice.
22. **MRR dashboard widget** — recurring revenue from hosting + retainers.

---

## My top-5 recommendation (in build order)

1. **UI polish from Part 1** (immediate perceived-quality lift)
2. **Credentials vault** (you're already storing the foundation; massive daily-use win)
3. **Recurring tasks + templates** (huge time-save for repeatable agency work)
4. **Wire up the assignment + domain expiry emails** (infra is ready, low effort, high value)
5. **Monthly SEO report PDF** (turns the app into a billable deliverable for the agency)

After approval I'll start with the UI polish, then ask which roadmap item you want next.

