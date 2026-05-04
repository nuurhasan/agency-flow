import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

// Worker that drains notification_outbox -> sends transactional emails via the
// existing transactional/send route (which enqueues into pgmq for delivery).
// Triggered every minute by pg_cron. Idempotent: only picks rows where
// status='pending' AND scheduled_for <= now(), then atomically marks them
// 'processing' to avoid double-sends across overlapping runs.

const MAX_PER_RUN = 200
const SITE_NAME = 'sparkle-work-flow'
const SENDER_DOMAIN = 'notify.gloria9.com'
const FROM_DOMAIN = 'notify.gloria9.com'
const APP_URL = 'https://sparkle-work-flow.lovable.app'

const TEMPLATE_FOR: Record<string, string> = {
  task_assigned: 'task-assigned',
  task_status_changed: 'task-status-changed',
  client_approval: 'task-status-changed',
  task_comment: 'task-comment',
  task_mention: 'task-mention',
  task_due_soon: 'task-due-reminder',
  task_overdue: 'task-due-reminder',
}

function subjectFor(eventType: string, payload: any, count?: number): string {
  if (eventType === 'digest') return `Your digest — ${count ?? 0} updates`
  const title = payload?.task_title ?? 'Update'
  switch (eventType) {
    case 'task_assigned': return `Assigned: ${title}`
    case 'task_status_changed': return `Status changed: ${title}`
    case 'client_approval': return `Awaiting approval: ${title}`
    case 'task_comment': return `New comment: ${title}`
    case 'task_mention': return `You were mentioned: ${title}`
    case 'task_due_soon': return `Due today: ${title}`
    case 'task_overdue': return `Overdue: ${title}`
    default: return title
  }
}

export const Route = createFileRoute('/api/public/hooks/process-notifications')({
  server: {
    handlers: {
      POST: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
          return Response.json({ error: 'Server config error' }, { status: 500 })
        }
        const supabase = createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        // 1. Pull pending, due rows
        const { data: pending, error: fetchErr } = await supabase
          .from('notification_outbox')
          .select('id, user_id, event_type, payload, scheduled_for, dedup_key')
          .eq('status', 'pending')
          .lte('scheduled_for', new Date().toISOString())
          .order('scheduled_for', { ascending: true })
          .limit(MAX_PER_RUN)

        if (fetchErr) {
          console.error('process-notifications fetch failed', fetchErr)
          return Response.json({ error: 'fetch failed' }, { status: 500 })
        }
        if (!pending || pending.length === 0) {
          return Response.json({ processed: 0 })
        }

        // 2. Atomically claim them
        const ids = pending.map((r) => r.id)
        const { data: claimed, error: claimErr } = await supabase
          .from('notification_outbox')
          .update({ status: 'processing' })
          .in('id', ids)
          .eq('status', 'pending')
          .select('id, user_id, event_type, payload, dedup_key')

        if (claimErr) {
          console.error('claim failed', claimErr)
          return Response.json({ error: 'claim failed' }, { status: 500 })
        }
        if (!claimed || claimed.length === 0) {
          return Response.json({ processed: 0 })
        }

        // 3. Group by user_id for digest detection
        const byUser = new Map<string, typeof claimed>()
        for (const row of claimed) {
          const arr = byUser.get(row.user_id) ?? []
          arr.push(row)
          byUser.set(row.user_id, arr)
        }

        // 4. Look up user emails + preferences in one shot
        const userIds = [...byUser.keys()]
        const [{ data: profiles }, { data: prefs }] = await Promise.all([
          supabase.from('profiles').select('id, email, name').in('id', userIds),
          supabase.from('notification_preferences').select('user_id, mode').in('user_id', userIds),
        ])
        const emailFor = new Map(profiles?.map((p) => [p.id, { email: p.email, name: p.name }]) ?? [])
        const modeFor = new Map(prefs?.map((p) => [p.user_id, p.mode]) ?? [])

        // 5. Send (digest if multiple AND user prefers digest, else individual)
        const supabaseUrlOrigin = APP_URL
        let sent = 0
        const failedIds: string[] = []
        const sentIds: string[] = []

        for (const [userId, rows] of byUser) {
          const profile = emailFor.get(userId)
          if (!profile?.email) {
            failedIds.push(...rows.map((r) => r.id))
            continue
          }
          const mode = modeFor.get(userId) ?? 'instant'
          const useDigest = mode === 'digest' && rows.length > 1

          // Helper to call our transactional send route via internal pgmq enqueue
          const enqueueOne = async (
            templateName: string,
            templateData: Record<string, any>,
            subject: string
          ) => {
            const messageId = crypto.randomUUID()
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: templateName,
              recipient_email: profile.email,
              status: 'pending',
            })
            // Render server-side via pgmq enqueue path. We bypass the auth
            // wrapper of /lovable/email/transactional/send by enqueuing
            // directly to the queue with a pre-rendered payload.
            const { render } = await import('@react-email/components')
            const React = await import('react')
            const { TEMPLATES } = await import('@/lib/email-templates/registry')
            const tpl = TEMPLATES[templateName]
            if (!tpl) throw new Error(`Template ${templateName} missing`)
            const element = React.createElement(tpl.component, templateData)
            const html = await render(element)
            const text = await render(element, { plainText: true })

            const { error } = await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                message_id: messageId,
                to: profile.email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: 'transactional',
                label: templateName,
                idempotency_key: messageId,
                queued_at: new Date().toISOString(),
              },
            })
            if (error) throw error
          }

          try {
            if (useDigest) {
              const items = rows.map((r) => ({
                event_type: r.event_type,
                task_title: (r.payload as any)?.task_title,
                project_id: (r.payload as any)?.project_id,
              }))
              await enqueueOne(
                'digest',
                { items, count: items.length },
                subjectFor('digest', null, items.length)
              )
              sentIds.push(...rows.map((r) => r.id))
              sent += 1
            } else {
              for (const row of rows) {
                const tplName = TEMPLATE_FOR[row.event_type]
                if (!tplName) {
                  // Unknown event — mark sent (no email) so we don't loop
                  sentIds.push(row.id)
                  continue
                }
                await enqueueOne(
                  tplName,
                  { ...(row.payload as any), recipient_name: profile.name },
                  subjectFor(row.event_type, row.payload)
                )
                sentIds.push(row.id)
                sent += 1
              }
            }
          } catch (err) {
            console.error('send failed for user', userId, err)
            failedIds.push(...rows.map((r) => r.id))
          }
        }

        // 6. Mark sent / failed
        if (sentIds.length) {
          await supabase
            .from('notification_outbox')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .in('id', sentIds)
        }
        if (failedIds.length) {
          await supabase
            .from('notification_outbox')
            .update({ status: 'failed', error_message: 'send failed' })
            .in('id', failedIds)
        }

        return Response.json({ processed: claimed.length, sent, failed: failedIds.length })
      },
    },
  },
})
