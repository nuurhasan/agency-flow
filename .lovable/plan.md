# Simplify the Login Page

Two small cleanups to `src/routes/login.tsx`:

## 1. Remove "Back home" link
Delete the paragraph below the sign-in card that links back to `/`. The login page becomes the clean focal point with no escape hatch needed (unauthenticated users can't reach anything useful at `/` anyway).

## 2. Remove "Create account" option
New signups will be admin-invited only for now. Specifically:
- Remove the Sign in / Create account tab toggle at the top of the card.
- Remove all signup-mode UI: the "Your name" field, the "Create account" submit label, and the "Signups are disabled" helper text.
- Remove the related state: `mode`, `name`, `signupsEnabled`, and the `useEffect` that fetches `app_settings.signups_enabled`.
- Remove the `signUp` branch in `handleSubmit` — only `signInWithPassword` remains.
- The card header becomes a simple "Sign in" title (replacing the toggle), keeping visual balance.

## Result
The login card shows: email field, password field, "Sign in" button. Nothing else. The Gloria9 logo, "Welcome to Gloria9" heading, and "Project Management Internal" subtitle above the card stay as-is.

## Files touched
- `src/routes/login.tsx` (only file)

No backend/database/route changes. The `app_settings.signups_enabled` column stays in the DB untouched in case we want to re-enable public signups later — we just stop reading it from this page.
