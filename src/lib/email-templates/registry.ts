import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

import { template as taskAssigned } from './task-assigned'
import { template as taskStatusChanged } from './task-status-changed'
import { template as taskComment } from './task-comment'
import { template as taskMention } from './task-mention'
import { template as taskDueReminder } from './task-due-reminder'
import { template as digest } from './digest'
import { template as testNotification } from './test-notification'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'task-assigned': taskAssigned,
  'task-status-changed': taskStatusChanged,
  'task-comment': taskComment,
  'task-mention': taskMention,
  'task-due-reminder': taskDueReminder,
  digest,
  'test-notification': testNotification,
}
