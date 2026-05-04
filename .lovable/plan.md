# Switch to Brevo for email delivery

Brevo (formerly Sendinblue) authenticates sender domains using **only CNAME + TXT records** — no NS delegation. Their free tier allows 300 emails/day and unlimited domains, which fits your situation perfectly.

We keep all the existing infrastructure (queue, suppression list, unsubscribe tokens, send log, notification outbox, templates, preferences UI) and only swap the **delivery transport**. This is a small surgical change.

---

## Part 1 — What you do in Brevo (one-time setup)

### Step 1: Create a Brevo account
- Go to https://www.brevo.com and sign up (free).
- Verify your email.

### Step 2: Add and authenticate your sender domain
1. In Brevo dashboard → **Senders, Domains & Dedicated IPs** → **Domains** → **Add a domain**.
2. Enter: `turgon.gloria9.co.uk` (the root, not the `notify.` subdomain — Brevo handles subdomains automatically).
3. Brevo shows you **4 DNS records** to add at your DNS provider:
   - `brevo-code.turgon.gloria9.co.uk` → **TXT** → (verification token)
   - `brevo1._domainkey.turgon.gloria9.co.uk` → **TXT** → (DKIM key 1)
   - `brevo2._domainkey.turgon.gloria9.co.uk` → **TXT** → (DKIM key 2)
   - `_dmarc.turgon.gloria9.co.uk` → **TXT** → `v=DMARC1; p=none;`
4. Add each one in your DNS panel (cPanel/registrar) as plain TXT records — no NS, no CNAME tricks.
5. Back in Brevo, click **Authenticate this domain**. Verification usually completes within a few minutes.

### Step 3: Generate an API key
1. In Brevo → **Settings (top-right) → SMTP & API → API Keys → Generate a new API key**.
2. Name it `lovable-turgon`. Copy the key (starts with `xkeysib-…`).
3. Keep it handy — you'll paste it into Lovable in the next step.

### Step 4: (Optional) Disable Lovable Emails
Once Brevo is verified and working, you can disable Lovable Emails in **Cloud → Emails** to remove the dead `notify.gloria9.com` provisioning state. The NS delegation problem disappears with it.

---

## Part 2 — What I do in the code (after you give me the API key)

Once you confirm Step 1–3 are done, I will:

### 1. Add the secret
Prompt you to store `BREVO_API_KEY` as a backend secret.

### 2. Replace the queue dispatcher transport
File: `src/routes/lovable/email/queue/process.ts`
- Currently calls Lovable's email gateway → swap to Brevo's API:
  ```
  POST https://api.brevo.com/v3/smtp/email
  Header: api-key: $BREVO_API_KEY
  Body: { sender, to, subject, htmlContent, textContent, headers: { 'List-Unsubscribe': ... } }
  ```
- Keep all retry / DLQ / TTL / rate-limit logic exactly as-is.
- Map Brevo's `429` and `5xx` responses to the existing backoff handler.

### 3. Update the From address constants
- In `src/routes/lovable/email/transactional/send.ts` and `src/routes/api/public/hooks/process-notifications.ts`:
  - `SENDER_DOMAIN` and `FROM_DOMAIN` → `turgon.gloria9.co.uk`
  - `From: "Turgon <noreply@turgon.gloria9.co.uk>"`

### 4. Wire up Brevo's bounce/complaint webhook (optional, recommended)
- Create `src/routes/api/public/hooks/brevo-webhook.ts`
- In Brevo → **Transactional → Settings → Webhooks**, add the URL:
  `https://turgon.gloria9.co.uk/api/public/hooks/brevo-webhook`
- Events: `hard_bounce`, `spam`, `unsubscribed` → upsert into existing `suppressed_emails` table.
- Verify with Brevo's signature header.

### 5. Keep these unchanged
- All React Email templates
- `notification_outbox`, `notification_preferences`, `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens`
- The `pg_cron` worker that calls `process-notifications` every minute
- The "Send test email" button — it'll just route through Brevo now

---

## Technical notes

- **Suppression check stays first**: every send still hits `suppressed_emails` before calling Brevo, so unsubscribes are honored regardless of provider.
- **One-click unsubscribe**: we'll add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to each Brevo request, pointing at the existing `/email/unsubscribe?token=…` route.
- **Throughput**: Brevo free tier = 300/day. The existing `email_send_state.batch_size` and `send_delay_ms` knobs already throttle — I'll set conservative defaults (10 emails per cron tick, 200ms apart) so you can't burst past the limit.
- **No Lovable Email gateway calls remain**: after the swap, nothing in the code path depends on `notify.gloria9.com` or the failed provisioning.

---

## What I need from you to proceed

1. Confirm you've created the Brevo account, added the 4 DNS records, and the domain shows **Authenticated** (green) in Brevo.
2. Have the `xkeysib-…` API key ready to paste when I prompt for the secret.

Reply "go" once both are done and I'll implement Part 2.
