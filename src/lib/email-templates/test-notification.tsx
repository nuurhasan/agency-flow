import * as React from 'react'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { APP_NAME, APP_URL, styles } from './_shared'

interface Props {
  recipient_name?: string
  sent_at?: string
}

const TestNotificationEmail = ({ recipient_name, sent_at }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{APP_NAME} test notification</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Heading style={styles.h1}>
          {recipient_name ? `Hi ${recipient_name}, ` : ''}your notifications are working 🎉
        </Heading>
        <Text style={styles.text}>
          This is a test email sent from your account so you can confirm that
          notifications from {APP_NAME} reach your inbox.
        </Text>
        <div style={styles.card}>
          <Text style={styles.meta}>Sent at: {sent_at ?? new Date().toISOString()}</Text>
          <Text style={styles.meta}>Type: Test notification</Text>
        </div>
        <Link href={`${APP_URL}/account`} style={styles.button}>Open notification settings</Link>
        <Text style={styles.footer}>
          You're seeing this because you clicked “Send test email” in your account settings.
          If you didn't, you can safely ignore this message.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TestNotificationEmail,
  subject: 'Test notification from ' + APP_NAME,
  displayName: 'Test notification',
  previewData: { recipient_name: 'Nuur', sent_at: new Date().toISOString() },
} satisfies TemplateEntry
