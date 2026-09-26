/**
 * Builders shared by the home-push tests. Test support only — nothing in the app imports this.
 */
import type { ClipboardItem } from '@talex-touch/utils/transport/events'
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { Translate } from '~/modules/lang/useI18nText'
import type { HomeSignals, HomeSignalSources } from './signals'
import { TuffInputType } from '@talex-touch/utils'
import { collectHomeSignals } from './signals'

export const NOW = Date.UTC(2026, 8, 26, 12, 0, 0)
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/**
 * Keys as text, params spelled out: assertions read what was asked for and with which values,
 * never translated prose.
 */
export const fakeT: Translate = (key, params) =>
  params && Object.keys(params).length > 0 ? `${key}${JSON.stringify(params)}` : key

export function project(
  overrides: Partial<ProjectRecord> & Pick<ProjectRecord, 'id'>
): ProjectRecord {
  return {
    rootPath: `/Users/me/Workspace/${overrides.id}`,
    name: overrides.id,
    pinned: false,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    lastOpenedAt: 0,
    ...overrides
  }
}

export function conversation(
  overrides: Partial<ConversationRecord> & Pick<ConversationRecord, 'id'>
): ConversationRecord {
  return {
    title: `title ${overrides.id}`,
    projectId: null,
    createdAt: 0,
    updatedAt: NOW - HOUR,
    ...overrides
  }
}

export function session(
  overrides: Partial<LocalAiCliSessionSummary> & Pick<LocalAiCliSessionSummary, 'sessionRef'>
): LocalAiCliSessionSummary {
  return {
    projectId: null,
    provider: 'pi',
    title: `session ${overrides.sessionRef}`,
    state: 'available',
    origin: 'tuff',
    createdAt: 0,
    updatedAt: 0,
    lastSeenAt: NOW - HOUR,
    ...overrides
  }
}

export function clipboardItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: 7,
    type: TuffInputType.Text,
    value: 'meeting notes for friday',
    createdAt: NOW - 5 * MINUTE,
    retentionReason: 'policy',
    ...overrides
  }
}

export function signalsOf(sources: Partial<HomeSignalSources> = {}): HomeSignals {
  return collectHomeSignals({
    conversations: [],
    projects: [],
    sessions: [],
    clipboard: null,
    activeProjectId: null,
    now: NOW,
    ...sources
  })
}
