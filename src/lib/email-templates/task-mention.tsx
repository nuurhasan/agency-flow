import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, projectUrl, styles } from './_shared'

interface Props { task_title?: string; comment_excerpt?: string; project_id?: string; actor_name?: string }

const TaskMentionEmail = ({ task_title = 'A task', comment_excerpt = '', project_id, actor_name }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{`${actor_name ?? 'Someone'} mentioned you`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>You were mentioned</Heading>
        <Text style={styles.text}>{actor_name ?? 'A teammate'} mentioned you in a comment.</Text>
        <div style={styles.card}>
          <Text style={{ ...styles.text, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{task_title}</Text>
          <Text style={{ ...styles.text, fontStyle: 'italic', margin: 0 }}>"{comment_excerpt}"</Text>
        </div>
        <Link href={projectUrl(project_id)} style={styles.button}>Reply</Link>
        <Text style={styles.footer}>Mentions are always sent immediately.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskMentionEmail,
  subject: (d: Record<string, any>) => `${d.actor_name ?? 'Someone'} mentioned you`,
  displayName: 'Mention',
  previewData: { task_title: 'Build login page', comment_excerpt: '@you can you take a look?', actor_name: 'Alex' },
} satisfies TemplateEntry
