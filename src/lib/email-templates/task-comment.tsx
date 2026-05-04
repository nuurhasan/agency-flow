import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, projectUrl, styles } from './_shared'

interface Props { task_title?: string; comment_excerpt?: string; project_id?: string; actor_name?: string }

const TaskCommentEmail = ({ task_title = 'A task', comment_excerpt = '', project_id, actor_name }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{`New comment on ${task_title}`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>New comment</Heading>
        <Text style={styles.text}>{actor_name ?? 'A teammate'} commented on a task you're assigned to.</Text>
        <div style={styles.card}>
          <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{task_title}</Text>
          <Text style={{ ...styles.text, fontStyle: 'italic', margin: 0 }}>"{comment_excerpt}"</Text>
        </div>
        <Link href={projectUrl(project_id)} style={styles.button}>Reply</Link>
        <Text style={styles.footer}>Comment notifications can be batched into digests in your settings.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskCommentEmail,
  subject: (d: Record<string, any>) => `New comment: ${d.task_title ?? 'Task'}`,
  displayName: 'Task comment',
  previewData: { task_title: 'Build login page', comment_excerpt: 'I think we should use the new design tokens here.', actor_name: 'Alex' },
} satisfies TemplateEntry
