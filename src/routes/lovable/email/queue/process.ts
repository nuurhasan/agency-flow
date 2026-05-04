import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60
const APP_URL = 'https://sparkle-work-flow.lovable.app'

interface BrevoError {
  status: number
  message: string
  retryAfterSeconds: number | null
}

// Parse a "Name <email@x>" string into Brevo's { name, email } format.
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1] || undefined, email: m[2] }
  return { email: from.trim() }
}

async function sendBrevoEmail(
  apiKey: string,
  payload: Record<string, any>,
  unsubscribeUrl: string
): Promise<void> {
  const fromParsed = parseFrom(payload.from as string)
  const body: Record<string, any> = {
    sender: fromParsed,
    to: [{ email: payload.to }],
    subject: payload.subject,
    htmlContent: payload.html,
    textContent: payload.text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [payload.label || payload.purpose || 'transactional'],
  }
  if (payload.idempotency_key) {
    body.headers['X-Mailin-Custom'] = String(payload.idempotency_key)
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) || null : null
    const err: BrevoError = {
      status: res.status,
      message: `Brevo ${res.status}: ${text.slice(0, 500)}`,
      retryAfterSeconds,
    }
    throw err
  }
}

function isRateLimited(error: unknown): boolean {
  return !!(error && typeof error === 'object' && 'status' in error && (error as BrevoError).status === 429)
}

function isForbidden(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false
  const s = (error as BrevoError).status
  return s === 401 || s === 403
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as BrevoError).retryAfterSeconds ?? 60
  }
  return 60
}

async function moveToDlq(
  supabase: any,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<void> {
  const payload = msg.message
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
  })
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, error })
  }
}

export const Route = createFileRoute('/lovable/email/queue/process')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.BREVO_API_KEY
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const authHeader = request.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const token = authHeader.slice('Bearer '.length).trim()
        if (token !== supabaseServiceKey) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }

        const supabase: any = createClient(supabaseUrl, supabaseServiceKey)

        const { data: state } = await supabase
          .from('email_send_state')
          .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
          .single()

        if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
          return Response.json({ skipped: true, reason: 'rate_limited' })
        }

        const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
        const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
        const ttlMinutes: Record<string, number> = {
          auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
          transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
        }

        let totalProcessed = 0

        for (const queue of ['auth_emails', 'transactional_emails']) {
          const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
            queue_name: queue,
            batch_size: batchSize,
            vt: 30,
          })

          if (readError) {
            console.error('Failed to read email batch', { queue, error: readError })
            continue
          }
          if (!messages?.length) continue

          const messageIds = Array.from(
            new Set(
              messages
                .map((msg: any) =>
                  msg?.message?.message_id && typeof msg.message.message_id === 'string'
                    ? msg.message.message_id
                    : null
                )
                .filter((id: string | null): id is string => Boolean(id))
            )
          )
          const failedAttemptsByMessageId = new Map<string, number>()
          if (messageIds.length > 0) {
            const { data: failedRows } = await supabase
              .from('email_send_log')
              .select('message_id')
              .in('message_id', messageIds)
              .eq('status', 'failed')
            for (const row of failedRows ?? []) {
              const id = row?.message_id
              if (typeof id === 'string' && id) {
                failedAttemptsByMessageId.set(id, (failedAttemptsByMessageId.get(id) ?? 0) + 1)
              }
            }
          }

          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i]
            const payload = msg.message
            const failedAttempts =
              payload?.message_id && typeof payload.message_id === 'string'
                ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
                : msg.read_ct ?? 0

            const queuedAt = payload.queued_at ?? msg.enqueued_at
            if (queuedAt) {
              const ageMs = Date.now() - new Date(queuedAt).getTime()
              const maxAgeMs = ttlMinutes[queue] * 60 * 1000
              if (ageMs > maxAgeMs) {
                await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
                continue
              }
            }

            if (failedAttempts >= MAX_RETRIES) {
              await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded`)
              continue
            }

            if (payload.message_id) {
              const { data: alreadySent } = await supabase
                .from('email_send_log')
                .select('id')
                .eq('message_id', payload.message_id)
                .eq('status', 'sent')
                .maybeSingle()

              if (alreadySent) {
                await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
                continue
              }
            }

            try {
              const unsubscribeUrl = payload.unsubscribe_token
                ? `${APP_URL}/unsubscribe?token=${payload.unsubscribe_token}`
                : `${APP_URL}/unsubscribe`

              await sendBrevoEmail(apiKey, payload, unsubscribeUrl)

              await supabase.from('email_send_log').insert({
                message_id: payload.message_id,
                template_name: payload.label || queue,
                recipient_email: payload.to,
                status: 'sent',
              })

              const { error: delError } = await supabase.rpc('delete_email', {
                queue_name: queue,
                message_id: msg.msg_id,
              })
              if (delError) {
                console.error('Failed to delete sent message', { queue, msg_id: msg.msg_id, error: delError })
              }
              totalProcessed++
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : (error as any)?.message ?? String(error)
              console.error('Brevo send failed', {
                queue,
                msg_id: msg.msg_id,
                failed_attempts: failedAttempts,
                error: errorMsg,
              })

              if (isRateLimited(error)) {
                await supabase.from('email_send_log').insert({
                  message_id: payload.message_id,
                  template_name: payload.label || queue,
                  recipient_email: payload.to,
                  status: 'failed',
                  error_message: String(errorMsg).slice(0, 1000),
                })
                const retryAfterSecs = getRetryAfterSeconds(error)
                await supabase
                  .from('email_send_state')
                  .update({
                    retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', 1)
                return Response.json({ processed: totalProcessed, stopped: 'rate_limited' })
              }

              if (isForbidden(error)) {
                await moveToDlq(supabase, queue, msg, 'Brevo auth failed (check BREVO_API_KEY)')
                return Response.json({ processed: totalProcessed, stopped: 'auth_failed' })
              }

              await supabase.from('email_send_log').insert({
                message_id: payload.message_id,
                template_name: payload.label || queue,
                recipient_email: payload.to,
                status: 'failed',
                error_message: String(errorMsg).slice(0, 1000),
              })
              if (payload?.message_id && typeof payload.message_id === 'string') {
                failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
              }
            }

            if (i < messages.length - 1) {
              await new Promise((r) => setTimeout(r, sendDelayMs))
            }
          }
        }

        return Response.json({ processed: totalProcessed })
      },
    },
  },
})
