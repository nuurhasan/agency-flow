import * as React from 'react'
import { render } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'sparkle-work-flow'
const SENDER_DOMAIN = 'turgon.gloria9.co.uk'
const FROM_DOMAIN = 'turgon.gloria9.co.uk'
const RECENT_LIMIT = 100

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null
}

async function requireAdmin(request: Request) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return { error: Response.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: role, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (roleError || !role) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase, user: authData.user }
}

async function getProviderEvents(apiKey: string | undefined, email: string | null, messageId?: string | null) {
  if (!apiKey || !email) {
    return { available: false, events: [], error: apiKey ? null : 'Provider API key is not configured' }
  }

  const params = new URLSearchParams({ email, limit: '50', offset: '0', days: '7', sort: 'desc' })
  if (messageId) params.set('messageId', messageId.replace(/[<>]/g, ''))

  const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?${params.toString()}`, {
    headers: { Accept: 'application/json', 'api-key': apiKey },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      available: false,
      events: [],
      error: `Provider events unavailable (${res.status}): ${text.slice(0, 300)}`,
    }
  }

  const body = await res.json().catch(() => ({}))
  return { available: true, events: Array.isArray(body?.events) ? body.events : [], error: null }
}

async function readDiagnostics(supabase: any, recipientEmail: string | null, messageId?: string | null) {
  let logQuery = supabase
    .from('email_send_log')
    .select('id, message_id, template_name, recipient_email, status, error_message, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT)

  if (recipientEmail) logQuery = logQuery.eq('recipient_email', recipientEmail)
  if (messageId) logQuery = logQuery.eq('message_id', messageId)

  const [{ data: rows, error: logError }, { data: state }, suppressionResult] = await Promise.all([
    logQuery,
    supabase
      .from('email_send_state')
      .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes, updated_at')
      .eq('id', 1)
      .maybeSingle(),
    recipientEmail
      ? supabase
          .from('suppressed_emails')
          .select('reason, source, created_at')
          .eq('email', recipientEmail)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (logError) throw logError

  const latestByMessage = new Map<string, any>()
  for (const row of rows ?? []) {
    const key = row.message_id || row.id
    if (!latestByMessage.has(key)) latestByMessage.set(key, row)
  }

  const latest = Array.from(latestByMessage.values())
  const summary = latest.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.status === 'sent') acc.sent += 1
      else if (row.status === 'suppressed') acc.suppressed += 1
      else if (row.status === 'dlq' || row.status === 'failed') acc.failed += 1
      else acc.pending += 1
      return acc
    },
    { total: 0, sent: 0, failed: 0, suppressed: 0, pending: 0 }
  )

  return {
    checkedAt: new Date().toISOString(),
    sender: { senderDomain: SENDER_DOMAIN, fromDomain: FROM_DOMAIN },
    state,
    suppressed: suppressionResult.data ?? [],
    summary,
    logs: latest,
  }
}

export const Route = createFileRoute('/api/email-debug')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request)
        if ('error' in auth) return auth.error

        const url = new URL(request.url)
        const recipientEmail = normalizeEmail(url.searchParams.get('recipient'))
        const messageId = url.searchParams.get('messageId')?.trim() || null

        try {
          const diagnostics = await readDiagnostics(auth.supabase, recipientEmail, messageId)
          const providerMessageId = diagnostics.logs[0]?.metadata?.provider_message_id ?? null
          const provider = await getProviderEvents(process.env.BREVO_API_KEY, recipientEmail, providerMessageId)
          return Response.json({ ...diagnostics, provider })
        } catch (error) {
          console.error('Email diagnostics failed', { error })
          return Response.json({ error: 'Failed to load diagnostics' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request)
        if ('error' in auth) return auth.error

        let recipientEmail = auth.user.email ? normalizeEmail(auth.user.email) : null
        try {
          const body = await request.json().catch(() => ({}))
          recipientEmail = normalizeEmail(body.recipientEmail) ?? recipientEmail
        } catch {
          recipientEmail = auth.user.email ? normalizeEmail(auth.user.email) : null
        }

        if (!recipientEmail) {
          return Response.json({ error: 'A valid recipient email is required' }, { status: 400 })
        }

        const templateName = 'test-notification'
        const template = TEMPLATES[templateName]
        if (!template) {
          return Response.json({ error: 'Test email template is missing' }, { status: 500 })
        }

        const normalizedEmail = recipientEmail.toLowerCase()
        const messageId = crypto.randomUUID()
        const idempotencyKey = `debug-test-${auth.user.id}-${Date.now()}`

        try {
          const { data: suppressed, error: suppressionError } = await auth.supabase
            .from('suppressed_emails')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (suppressionError) throw suppressionError
          if (suppressed) {
            await auth.supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: templateName,
              recipient_email: normalizedEmail,
              status: 'suppressed',
              error_message: 'Recipient is suppressed',
            })
            return Response.json({ success: false, reason: 'email_suppressed', messageId })
          }

          const { data: existingToken, error: tokenLookupError } = await auth.supabase
            .from('email_unsubscribe_tokens')
            .select('token, used_at')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (tokenLookupError) throw tokenLookupError

          let unsubscribeToken = existingToken?.used_at ? null : existingToken?.token
          if (!unsubscribeToken) {
            unsubscribeToken = generateToken()
            const { error: tokenError } = await auth.supabase
              .from('email_unsubscribe_tokens')
              .upsert({ token: unsubscribeToken, email: normalizedEmail }, { onConflict: 'email' })
            if (tokenError) throw tokenError
          }

          const templateData = {
            recipient_name: auth.user.user_metadata?.name ?? auth.user.email?.split('@')[0] ?? 'there',
            sent_at: new Date().toISOString(),
          }
          const element = React.createElement(template.component, templateData)
          const html = await render(element)
          const text = await render(element, { plainText: true })
          const subject = typeof template.subject === 'function' ? template.subject(templateData) : template.subject

          await auth.supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: templateName,
            recipient_email: normalizedEmail,
            status: 'pending',
            metadata: { source: 'email_debug_tool' },
          })

          const { error: enqueueError } = await auth.supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to: normalizedEmail,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject,
              html,
              text,
              purpose: 'transactional',
              label: templateName,
              idempotency_key: idempotencyKey,
              unsubscribe_token: unsubscribeToken,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqueueError) throw enqueueError

          console.log('Diagnostic test email enqueued', {
            messageId,
            recipient_redacted: redactEmail(normalizedEmail),
          })

          return Response.json({ success: true, queued: true, messageId, recipientEmail: normalizedEmail })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('Diagnostic test email failed', {
            messageId,
            recipient_redacted: redactEmail(normalizedEmail),
            error: errorMsg,
          })
          await auth.supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: templateName,
            recipient_email: normalizedEmail,
            status: 'failed',
            error_message: errorMsg.slice(0, 1000),
          })
          return Response.json({ error: 'Failed to queue diagnostic email', messageId }, { status: 500 })
        }
      },
    },
  },
})
