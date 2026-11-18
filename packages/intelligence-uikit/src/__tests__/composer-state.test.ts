import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { usePlaygroundState } from '../playground/usePlaygroundState'
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

afterEach(() => {
  vi.useRealTimers()
})

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

  it('normalizes canonical, ChatComposer, and legacy image attachments including pending/label keys', () => {
    const result = normalizeComposerAttachments([
      { type: 'image', url: 'https://example.com/a.png', name: 'a.png' },
      { id: 'c1', label: 'notes.md', kind: 'file', pending: true },
      { id: 'c2', label: 'shot.png', kind: 'image', url: 'blob:shot', pending: true, progress: 0.4 } as any,
      { id: 'f0', name: 'archive.zip', kind: 'file', pending: true } as any,
      { kind: 'file', id: 'f1', name: 'spec.json', size: 512 },
    ])

    expect(result).toEqual([
      { kind: 'image', id: 'legacy-img-0-a.png', url: 'https://example.com/a.png', name: 'a.png' },
      { kind: 'file', id: 'c1', name: 'notes.md', size: undefined, mime: undefined, uploading: true, progress: undefined },
      { kind: 'image', id: 'c2', url: 'blob:shot', name: 'shot.png', uploading: true, progress: 0.4 },
      { kind: 'file', id: 'f0', name: 'archive.zip', size: undefined, mime: undefined, uploading: true, progress: undefined },
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

  it('guards playground loadOlderMessages across resetTimeline and preserves/clears attachments on sendDraft', async () => {
    vi.useFakeTimers()

    let state!: ReturnType<typeof usePlaygroundState>
    const Harness = defineComponent({
      setup() {
        state = usePlaygroundState()
        return () => null
      },
    })
    const wrapper = mount(Harness)

    // Start an older-history load, then reset before 250ms settles.
    const staleLoad = state.loadOlderMessages()
    await vi.advanceTimersByTimeAsync(100)
    state.resetTimeline()
    await vi.advanceTimersByTimeAsync(200)
    const staleResult = await staleLoad

    expect(state.olderLoaded.value).toBe(false)
    expect(state.messages.value).toHaveLength(0)
    expect(staleResult).toEqual({ hasMore: true })

    // Subsequent uninterrupted load completes cleanly.
    const validLoad = state.loadOlderMessages()
    await vi.advanceTimersByTimeAsync(250)
    const validResult = await validLoad
    expect(state.olderLoaded.value).toBe(true)
    expect(validResult).toEqual({ hasMore: false })

    // Sending a draft copies attachments into the submitted user turn and clears composer attachments.
    expect(state.composerAttachments.value).toHaveLength(1)
    state.sendDraft({ text: 'Inspect composer parity' })
    expect(state.composerAttachments.value).toHaveLength(0)

    const sentWithAttachment = state.messages.value.at(-2)
    expect(sentWithAttachment).toMatchObject({
      role: 'user',
      content: 'Inspect composer parity',
      attachments: [{ kind: 'file', id: 'att-uikit', name: 'TxAiComposer.vue', size: 18_420 }],
    })

    // Text-only follow-up stays clean without attachments.
    state.sendDraft({ text: 'Second turn without files' })
    const textOnlyTurn = state.messages.value.at(-2)
    expect(textOnlyTurn).toMatchObject({
      role: 'user',
      content: 'Second turn without files',
    })
    expect(textOnlyTurn?.attachments).toBeUndefined()

    wrapper.unmount()
  })
})
