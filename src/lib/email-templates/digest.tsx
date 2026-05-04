import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, APP_URL, styles } from './_shared'

interface DigestItem { event_type: string; task_title?: string; project_id?: string; meta?: any }
interface Props { items?: DigestItem[]; count?: number }

const labels: Record<string, string> = {
  task_assigned: 'Assigned',
  task_status_changed: 'Status changed',
  task_comment: 'New comment',
  task_mention: 'Mentioned you',
  task_due_soon: 'Due today',
  task_overdue: 'Overdue',
  client_approval: 'Awaiting approval',
  project_update: 'Project update',
}

const DigestEmail = ({ items = [], count }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{`You have ${count ?? items.length} updates`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>Your activity digest</Heading>
        <Text style={styles.text}>You have {count ?? items.length} updates since the last digest.</Text>
        {items.map((item, i) => (
          <div key={i} style={styles.card}>
            <Text style={{ ...styles.meta, margin: '0 0 4px' }}>{labels[item.event_type] ?? item.event_type}</Text>
            <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: 0 }}>{item.task_title ?? 'Update'}</Text>
          </div>
        ))}
        <Link href={APP_URL} style={styles.button}>Open dashboard</Link>
        <Text style={styles.footer}>Switch to instant notifications anytime in your account settings.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DigestEmail,
  subject: (d: Record<string, any>) => `Your digest — ${d.count ?? d.items?.length ?? 0} updates`,
  displayName: 'Activity digest',
  previewData: { count: 3, items: [
    { event_type: 'task_assigned', task_title: 'Design homepage' },
    { event_type: 'task_comment', task_title: 'Build login page' },
    { event_type: 'task_due_soon', task_title: 'Send proposal' },
  ]},
} satisfies TemplateEntry
