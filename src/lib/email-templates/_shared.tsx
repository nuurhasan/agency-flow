import * as React from 'react'

export const APP_NAME = 'Gloria9 Project Hub'
export const APP_URL = 'https://sparkle-work-flow.lovable.app'

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif', color: '#1f1f23' },
  container: { maxWidth: '560px', margin: '0 auto', padding: '32px 24px' },
  brand: { fontSize: '13px', fontWeight: 600 as const, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase' as const, marginBottom: '24px' },
  h1: { fontSize: '22px', fontWeight: 600 as const, lineHeight: '1.35', margin: '0 0 16px', color: '#0f172a' },
  text: { fontSize: '14px', lineHeight: '1.6', color: '#374151', margin: '0 0 16px' },
  card: { border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px 20px', margin: '20px 0', backgroundColor: '#fafafa' },
  meta: { fontSize: '13px', color: '#6b7280', margin: '4px 0' },
  button: { display: 'inline-block', padding: '11px 20px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '999px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 as const },
  footer: { fontSize: '12px', color: '#9ca3af', margin: '32px 0 0', borderTop: '1px solid #f1f5f9', paddingTop: '20px' },
  hr: { border: 'none', borderTop: '1px solid #f1f5f9', margin: '20px 0' },
}

export function projectUrl(projectId?: string) {
  return projectId ? `${APP_URL}/projects/${projectId}` : APP_URL
}
