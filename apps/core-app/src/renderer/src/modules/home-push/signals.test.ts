import { TuffInputType } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  clipboardItem,
  conversation,
  DAY,
  HOUR,
  MINUTE,
  NOW,
  project,
  session,
  signalsOf
} from './home-push.fixtures'
import { selectClipboardSignal } from './signals'

describe('collectHomeSignals', () => {
  it('keeps the last seven days of conversations, newest first, with their project names', () => {
    const signals = signalsOf({
      projects: [project({ id: 'p1', name: 'talex-touch' })],
      conversations: [
        conversation({ id: 'old', updatedAt: NOW - 8 * DAY }),
        conversation({ id: 'yesterday', updatedAt: NOW - DAY, projectId: 'p1' }),
        conversation({ id: 'today', updatedAt: NOW - HOUR })
      ]
    })

    expect(signals.hasHistory).toBe(true)
    expect(signals.recentConversations.map((row) => row.id)).toEqual(['today', 'yesterday'])
    expect(signals.recentConversations[1]).toMatchObject({
      projectId: 'p1',
      projectName: 'talex-touch'
    })
  })

  it('counts history by existence, not recency', () => {
    // The guide is for people with no history at all; a month-old thread still switches it off.
    const signals = signalsOf({
      conversations: [conversation({ id: 'c', updatedAt: NOW - 40 * DAY })]
    })
    expect(signals.hasHistory).toBe(true)
    expect(signals.recentConversations).toEqual([])
  })

  it('leaves archived projects out of every row that would lead into them', () => {
    const signals = signalsOf({
      projects: [project({ id: 'live' }), project({ id: 'shelved', archived: true })],
      conversations: [conversation({ id: 'c', projectId: 'shelved' })],
      sessions: [session({ sessionRef: 's', projectId: 'shelved' })]
    })

    expect(signals.projects.map((row) => row.id)).toEqual(['live'])
    expect(signals.recentConversations).toEqual([])
    expect(signals.sessions).toEqual([])
  })

  it('keeps a conversation whose project is gone, as the sidebar does', () => {
    const signals = signalsOf({ conversations: [conversation({ id: 'c', projectId: 'deleted' })] })
    expect(signals.recentConversations[0]).toMatchObject({
      projectId: 'deleted',
      projectName: null
    })
  })

  it('offers only resumable sessions seen inside the window', () => {
    const signals = signalsOf({
      sessions: [
        session({ sessionRef: 'ok', lastSeenAt: NOW - 2 * HOUR }),
        session({ sessionRef: 'newer', lastSeenAt: NOW - HOUR }),
        session({ sessionRef: 'missing', state: 'missing' }),
        session({ sessionRef: 'conflict', state: 'conflict' }),
        session({ sessionRef: 'stale', lastSeenAt: NOW - 9 * DAY })
      ]
    })
    expect(signals.sessions.map((row) => row.sessionRef)).toEqual(['newer', 'ok'])
  })

  it('orders projects as the sidebar does: pinned first, then most recently opened', () => {
    const signals = signalsOf({
      projects: [
        project({ id: 'recent', lastOpenedAt: NOW - HOUR }),
        project({ id: 'pinned', pinned: true, lastOpenedAt: NOW - 5 * DAY }),
        project({ id: 'older', lastOpenedAt: NOW - DAY })
      ]
    })
    expect(signals.projects.map((row) => row.id)).toEqual(['pinned', 'recent', 'older'])
  })

  it('resolves the blank conversation’s own project', () => {
    const signals = signalsOf({
      projects: [project({ id: 'p1', name: 'sheet-music' })],
      activeProjectId: 'p1'
    })
    expect(signals.activeProject).toMatchObject({ id: 'p1', name: 'sheet-music' })
    expect(signalsOf({ activeProjectId: 'unknown' }).activeProject).toBeNull()
  })
})

describe('selectClipboardSignal', () => {
  it('offers ordinary text copied in the last half hour', () => {
    expect(selectClipboardSignal(clipboardItem(), NOW)).toEqual({
      id: 7,
      text: 'meeting notes for friday',
      createdAt: NOW - 5 * MINUTE
    })
  })

  it('skips text older than thirty minutes', () => {
    expect(selectClipboardSignal(clipboardItem({ createdAt: NOW - 31 * MINUTE }), NOW)).toBeNull()
  })

  it('skips a record main marked as a protected secret', () => {
    expect(selectClipboardSignal(clipboardItem({ retentionReason: 'protected' }), NOW)).toBeNull()
  })

  /**
   * `retentionReason` alone misses these: a starred secret reports `favorite`, and with key
   * protection switched off a secret reports `policy`. The shared classifier catches both.
   */
  it('skips secrets main did not mark as protected', () => {
    const key = 'sk-proj-8f3Kd92LmQ7rT1vX5nB0cY4wZ6aP2sH9jE'
    expect(
      selectClipboardSignal(clipboardItem({ value: key, retentionReason: 'favorite' }), NOW)
    ).toBeNull()
    expect(
      selectClipboardSignal(clipboardItem({ value: key, retentionReason: 'policy' }), NOW)
    ).toBeNull()
  })

  it('skips a verification code', () => {
    expect(
      selectClipboardSignal(clipboardItem({ value: '您的验证码是 482913，5 分钟内有效' }), NOW)
    ).toBeNull()
  })

  it('skips non-text records and blank text', () => {
    expect(selectClipboardSignal(clipboardItem({ type: TuffInputType.Image }), NOW)).toBeNull()
    expect(selectClipboardSignal(clipboardItem({ value: '   ' }), NOW)).toBeNull()
    expect(selectClipboardSignal(null, NOW)).toBeNull()
  })
})
