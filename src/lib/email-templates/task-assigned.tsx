import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, projectUrl, styles } from './_shared'

interface Props {
  task_title?: string
  project_id?: string
  due_date?: string | null
  priority?: string
  actor_name?: string
}

const TaskAssignedEmail = ({ task_title = 'A task', project_id, due_date, priority, actor_name }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>You were assigned: {task_title}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>You've been assigned a task</Heading>
        <Text style={styles.text}>
          {actor_name ? `${actor_name} assigned` : 'You were assigned'} a task to you.
        </Text>
        <div style={styles.card}>
          <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{task_title}</Text>
          {priority && <Text style={styles.meta}>Priority: {priority}</Text>}
          {due_date && <Text style={styles.meta}>Due: {new Date(due_date).toLocaleDateString()}</Text>}
        </div>
        <Link href={projectUrl(project_id)} style={styles.button}>Open task</Link>
        <Text style={styles.footer}>You're receiving this because task assignments are enabled in your notification settings.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskAssignedEmail,
  subject: (d: Record<string, any>) => `Assigned: ${d.task_title ?? 'New task'}`,
  displayName: 'Task assigned',
  previewData: { task_title: 'Design homepage hero section', priority: 'high', due_date: '2026-05-10', actor_name: 'Sarah' },
} satisfies TemplateEntry
