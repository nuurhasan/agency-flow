import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, projectUrl, styles } from './_shared'

interface Props { task_title?: string; due_date?: string; project_id?: string; priority?: string; overdue?: boolean }

const TaskDueEmail = ({ task_title = 'A task', due_date, project_id, priority, overdue }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{overdue ? `Overdue: ${task_title}` : `Due today: ${task_title}`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>{overdue ? 'Task overdue' : 'Task due today'}</Heading>
        <div style={styles.card}>
          <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{task_title}</Text>
          {due_date && <Text style={styles.meta}>Due: {new Date(due_date).toLocaleDateString()}</Text>}
          {priority && <Text style={styles.meta}>Priority: {priority}</Text>}
        </div>
        <Link href={projectUrl(project_id)} style={styles.button}>Open task</Link>
        <Text style={styles.footer}>Daily reminders are sent once per day per task.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskDueEmail,
  subject: (d: Record<string, any>) => (d.overdue ? `Overdue: ${d.task_title}` : `Due today: ${d.task_title}`),
  displayName: 'Task due reminder',
  previewData: { task_title: 'Send client proposal', due_date: '2026-05-04', priority: 'high', overdue: false },
} satisfies TemplateEntry
