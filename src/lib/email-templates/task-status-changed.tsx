import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, projectUrl, styles } from './_shared'

interface Props { task_title?: string; old_status?: string; new_status?: string; project_id?: string }

const TaskStatusEmail = ({ task_title = 'A task', old_status, new_status, project_id }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{task_title} → {new_status}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>Task status updated</Heading>
        <div style={styles.card}>
          <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{task_title}</Text>
          <Text style={styles.meta}>{old_status} → <strong style={{ color: '#0f172a' }}>{new_status}</strong></Text>
        </div>
        <Link href={projectUrl(project_id)} style={styles.button}>View task</Link>
        <Text style={styles.footer}>Manage email preferences in your account settings.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskStatusEmail,
  subject: (d: Record<string, any>) => `${d.task_title ?? 'Task'} → ${d.new_status ?? 'updated'}`,
  displayName: 'Task status changed',
  previewData: { task_title: 'Build login page', old_status: 'in_progress', new_status: 'in_review' },
} satisfies TemplateEntry
