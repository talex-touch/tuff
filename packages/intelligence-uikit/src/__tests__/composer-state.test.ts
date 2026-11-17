import { describe, expect, it } from 'vitest'
import {
  buildMessageRailTurns,
  calculateAiContextPercent,
  deriveAiRunStep,
  deriveAiSendState,
  formatAiContextWindow,
  formatAiElapsed,
  isAiAwaitingFirstToken,
  isAiCapsuleSendState,
  normalizeComposerAttachments,
  summarizeRailMessage,
  voiceGlowDriveLevel,
  voiceGlowResponse,
} from '../utils'

describe('composer-state & message-rail utilities', () => {
  it('derives send, stop, queue, and disabled states', () => {
    expect(deriveAiSendState({ sending: false, busy: false, hasDraft: false })).toBe('disabled')
    expect(deriveAiSendState({ sending: false, busy: false, hasDraft: true })).toBe('send')
    expect(deriveAiSendState({ sending: false, busy: false, hasDraft: false, allowEmptySend: true })).toBe('send')
    expect(deriveAiSendState({ sending: true, hasDraft: false })).toBe('stop')
    expect(deriveAiSendState({ busy: true, hasDraft: true })).toBe('queue')

    expect(isAiCapsuleSendState('stop')).toBe(true)
    expect(isAiCapsuleSendState('queue')).toBe(true)
    expect(isAiCapsuleSendState('send')).toBe(false)
    expect(isAiCapsuleSendState('disabled')).toBe(false)
  })

  it('detects whether a turn is still awaiting its first token', () => {
    expect(isAiAwaitingFirstToken({ status: 'waiting' })).toBe(true)
    expect(isAiAwaitingFirstToken({ status: 'streaming', content: '   ' })).toBe(true)
    expect(isAiAwaitingFirstToken({ status: 'streaming', content: 'Hello' })).toBe(false)
    expect(isAiAwaitingFirstToken({
      status: 'streaming',
      parts: [{ type: 'reasoning', text: 'pondering' }],
    })).toBe(true)
    expect(isAiAwaitingFirstToken({
      status: 'streaming',
      parts: [{ type: 'tool-call', id: 't1', name: 'search', status: 'running' }],
    })).toBe(false)
    expect(isAiAwaitingFirstToken({ status: 'done', content: '' })).toBe(false)
  })

  it('prioritizes run status steps cleanly', () => {
    expect(deriveAiRunStep({
      compacting: true,
      streaming: true,
      activeTools: [{ name: 'read_file', status: 'running' }],
    })?.key).toBe('compacting')

    expect(deriveAiRunStep({
      activeTools: [{ name: 'tuff_chart', status: 'running', summary: 'Rendering' }],
      streaming: true,
    })).toMatchObject({ key: 'tool:tuff_chart', label: 'tuff_chart', status: 'running' })

    expect(deriveAiRunStep({ queuedCount: 2 })?.status).toBe('pending')
    expect(deriveAiRunStep({})).toBeNull()
  })

  it('formats elapsed times, context windows, and voice glow drive', () => {
    expect(formatAiElapsed(0)).toBe('0.0s')
    expect(formatAiElapsed(1460)).toBe('1.5s')
    expect(formatAiElapsed(65_000)).toBe('1m 05s')

    expect(formatAiContextWindow(850)).toBe('850')
    expect(formatAiContextWindow(128_000)).toBe('128k')
    expect(formatAiContextWindow(1_500_000)).toBe('1.5M')
    expect(calculateAiContextPercent(32_000, 128_000)).toBe(25)
    expect(calculateAiContextPercent(200_000, 128_000)).toBe(100)
    expect(calculateAiContextPercent(10, 0)).toBe(0)

    expect(voiceGlowDriveLevel(-1)).toBe(0)
    expect(voiceGlowDriveLevel(2)).toBe(1)
    expect(voiceGlowResponse(0)).toBe(0)
    expect(voiceGlowResponse(0.5)).toBeGreaterThan(0.5)
  })

  it('normalizes canonical, ChatComposer, and legacy image attachments', () => {
    const result = normalizeComposerAttachments([
      { type: 'image', url: 'https://example.com/a.png', name: 'a.png' },
      { id: 'c1', label: 'notes.md', kind: 'file', pending: true },
      { kind: 'file', id: 'f1', name: 'spec.json', size: 512 },
    ])

    expect(result).toEqual([
      { kind: 'image', id: 'legacy-img-0-a.png', url: 'https://example.com/a.png', name: 'a.png' },
      { kind: 'file', id: 'c1', name: 'notes.md', size: undefined, mime: undefined, uploading: true, progress: undefined },
      { kind: 'file', id: 'f1', name: 'spec.json', size: 512 },
    ])
  })

  it('builds clean turn outlines for the message rail', () => {
    const turns = buildMessageRailTurns([
      {
        id: 'u1',
        role: 'user',
        content: 'Check ![shot](https://example.com/s.png) and ```ts\nconst a = 1\n``` now',
      },
      { id: 'a1', role: 'assistant', content: 'Ignored assistant message' },
      {
        id: 'u2',
        role: 'user',
        content: '',
        attachments: [{ kind: 'file', id: 'f1', name: 'report.pdf' }],
      },
    ])

    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      key: 'u1',
      messageIndex: 0,
      turnNumber: 1,
      title: 'Check [Image] and [Code] now',
      hasImages: true,
    })
    expect(turns[1]).toMatchObject({
      key: 'u2',
      messageIndex: 2,
      turnNumber: 2,
      title: 'report.pdf',
      hasImages: true,
    })
    expect(summarizeRailMessage({ id: 'u3', role: 'user', content: 'A'.repeat(40) }, { maxLength: 10 })).toHaveLength(10)
  })
})
