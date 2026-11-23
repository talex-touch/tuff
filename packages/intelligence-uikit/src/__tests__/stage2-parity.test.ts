import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxAiContextMeter from '../components/conversation/TxAiContextMeter.vue'
import TxAiMessageRail from '../components/conversation/TxAiMessageRail.vue'
import TxAiRunStatus from '../components/conversation/TxAiRunStatus.vue'
import {
  buildMessageRailSegments,
  countRailImageAttachments,
  deriveAiRunStepFromParts,
  estimateAiTextTokens,
  estimateAiTranscriptTokens,
  formatAiCompactElapsed,
  formatAiWindowText,
  isAiAwaitingFirstToken,
} from '../utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('intelligence-uikit stage 2 parity helpers & variants', () => {
  it('supports CoreApp run-step, compact elapsed, window text, token estimate, and reasoning-aware awaiting', () => {
    expect(deriveAiRunStepFromParts(undefined)).toEqual({ kind: 'waiting' })
    expect(deriveAiRunStepFromParts([
      { type: 'reasoning', text: '**Planning** step\nnext line' },
      { type: 'tool-call', id: 't1', name: 'search', status: 'running', summary: 'Scanning' },
    ])).toEqual({ kind: 'tool', name: 'search', summary: 'Scanning' })
    expect(deriveAiRunStepFromParts([
      { type: 'tool-call', id: 't1', name: 'search', status: 'done' },
    ])).toEqual({ kind: 'thinking' })
    expect(deriveAiRunStepFromParts([
      { type: 'reasoning', text: '## Analyzing query' },
    ])).toEqual({ kind: 'thinking', title: 'Analyzing query' })
    expect(deriveAiRunStepFromParts([
      { type: 'text', text: 'Hello' },
    ])).toEqual({ kind: 'writing' })

    expect(formatAiCompactElapsed(3_000)).toBe('3s')
    expect(formatAiCompactElapsed(2_643_000)).toBe('44m 3s')
    expect(formatAiCompactElapsed(3_720_000)).toBe('1h 2m')

    expect(formatAiWindowText(1_000_000)).toBe('1M')
    expect(formatAiWindowText(1_500_000)).toBe('1.5M')
    expect(formatAiWindowText(131_072)).toBe('131.1k')
    expect(formatAiWindowText(128_000)).toBe('128k')
    expect(formatAiWindowText(950)).toBe('950')
    expect(formatAiWindowText(0)).toBe('')
    expect(formatAiWindowText(-10)).toBe('')

    expect(estimateAiTextTokens('')).toBe(0)
    expect(estimateAiTextTokens('abcd')).toBe(1)
    expect(estimateAiTextTokens('你好')).toBe(2)
    expect(estimateAiTranscriptTokens([
      { content: '你好', parts: [{ type: 'text', text: 'abcd' }, { type: 'reasoning', text: '思考' }] },
    ])).toBe(5)

    expect(isAiAwaitingFirstToken({
      status: 'streaming',
      parts: [{ type: 'reasoning', text: '' }],
      includeReasoning: true,
    })).toBe(false)
    expect(isAiAwaitingFirstToken({
      status: 'streaming',
      parts: [{ type: 'text', text: '' }],
      includeReasoning: true,
    })).toBe(true)
  })

  it('renders TxAiContextMeter bar variant with clamped fill width and meter semantics', () => {
    const wrapper = mount(TxAiContextMeter, {
      props: {
        variant: 'bar',
        percent: 135,
        windowText: '128k',
        label: 'Context usage',
        valueText: '135% of 128k',
      },
      global: {
        stubs: {
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>',
          },
        },
      },
    })

    expect(wrapper.attributes('role')).toBe('meter')
    expect(wrapper.attributes('aria-valuenow')).toBe('135')
    expect(wrapper.attributes('aria-valuetext')).toBe('135% of 128k')
    expect(wrapper.get('.tx-ai-context-meter-bar__fill').attributes('style')).toContain('width: 100%')
    expect(wrapper.get('.tx-ai-context-meter-bar__percent').text()).toBe('135%')
    expect(wrapper.get('.tx-ai-context-meter-bar__window').text()).toBe('128k')

    const negative = mount(TxAiContextMeter, {
      props: {
        variant: 'bar',
        percent: -10,
        windowText: '1M',
      },
      global: {
        stubs: {
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>',
          },
        },
      },
    })
    expect(negative.get('.tx-ai-context-meter-bar__fill').attributes('style')).toContain('width: 0%')
  })

  it('renders TxAiRunStatus line variant with TxMiko, live ticking startedAt clock, and tool tone', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T00:00:10Z'))

    const wrapper = mount(TxAiRunStatus, {
      props: {
        variant: 'line',
        startedAt: Date.now() - 3_000,
        mikoState: 'running',
        lineLabel: 'Searching workspace',
        tone: 'tool',
      },
      global: {
        stubs: {
          TxMiko: {
            props: ['state', 'size'],
            template: '<span class="stub-miko" :data-state="state" :data-size="size" />',
          },
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>',
          },
        },
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.get('.stub-miko').attributes('data-state')).toBe('running')
    expect(wrapper.get('.tx-ai-run-status-line__time').text()).toBe('3s')
    expect(wrapper.get('.tx-ai-run-status-line__step').text()).toBe('Searching workspace')
    expect(wrapper.get('.tx-ai-run-status-line__step').classes()).toContain('is-tool')

    vi.advanceTimersByTime(2_000)
    await nextTick()
    expect(wrapper.get('.tx-ai-run-status-line__time').text()).toBe('5s')

    wrapper.unmount()
  })

  it('renders TxAiMessageRail minimal variant with inline #IMAGE chips, first-turn flip, and navigate event', async () => {
    expect(countRailImageAttachments({
      attachments: [{ kind: 'image' }, { mimeType: 'image/png' }, { kind: 'file' }],
    })).toBe(2)
    expect(buildMessageRailSegments('Hello §§RAILIMAGE§§ world', true, 1)).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'image', value: '#IMAGE1' },
      { type: 'text', value: ' world' },
      { type: 'image', value: '#IMAGE2' },
    ])

    const wrapper = mount(TxAiMessageRail, {
      props: {
        variant: 'minimal',
        activeIndex: 0,
        ariaLabel: 'Outline',
        codeTag: '[Code]',
        fallbackLabel: 'Message',
        maxLength: 200,
        messages: [
          { id: 'u1', role: 'user', content: 'First prompt' },
          { id: 'a1', role: 'assistant', content: 'Answer' },
          {
            id: 'u2',
            role: 'user',
            content: 'Second prompt ![shot](tfile:///shot.png)',
            attachments: [{ kind: 'image', id: 'img-1', url: 'tfile:///extra.png' }],
          },
        ],
      },
    })

    const turns = wrapper.findAll('.tx-ai-message-rail__turn')
    expect(turns).toHaveLength(2)
    expect(turns[0].classes()).toContain('is-first')
    expect(turns[0].classes()).toContain('is-active')

    const buttons = wrapper.findAll('.tx-ai-message-rail__bar-wrap')
    expect(buttons[0].attributes('aria-current')).toBe('true')
    expect(buttons[1].attributes('aria-current')).toBeUndefined()

    await turns[1].trigger('mouseenter')
    expect(wrapper.get('.tx-ai-message-rail__prompt-text').text()).toContain('Second prompt')
    expect(wrapper.findAll('.tx-ai-message-rail__image-tag').map(el => el.text())).toEqual([
      '#IMAGE1',
      '#IMAGE2',
    ])

    await buttons[1].trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([[2]])
  })
})
