// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { homeMessageContextKey } from './composables/home-message-context'
import HomeMessageRow from './HomeMessageRow.vue'

enableAutoUnmount(afterEach)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('zh-CN')
  })
}))

vi.mock('@talex-touch/intelligence-uikit', () => ({
  formatTokenCount: (n: number) => String(n),
  TxAiAssistantTurn: {
    props: ['segments', 'streaming', 'elementProps'],
    template:
      '<div data-testid="ai-turn-stub" :data-reveal="elementProps?.reveal" :data-md-reveal="elementProps?.markdownProps?.reveal" />'
  }
}))

vi.mock('@talex-touch/tuffex/message-actions', () => ({
  TxMessageActions: {
    props: ['copyText'],
    template: '<div data-testid="msg-actions-stub" :data-copy="copyText" />'
  }
}))

vi.mock('@talex-touch/tuffex/attachment-tray', () => ({
  TxAttachmentTray: { template: '<div />' }
}))

vi.mock('@talex-touch/tuffex/voice-clip', () => ({
  TxVoiceClip: { template: '<div />' }
}))

function provideMessageContext() {
  return {
    [homeMessageContextKey as symbol]: {
      segmentsOf: () => [],
      submittedForms: new Set<string>(),
      formDrafts: new Map(),
      submitForm: vi.fn(),
      handleOpenUIAction: vi.fn(),
      showToolPayload: false,
      payloadFor: ref(null),
      toolCallLabels: {},
      markdownLabels: ref({}),
      codePartProps: {},
      chartProps: {},
      formProps: {},
      widgetProps: {},
      footerLabels: ref({}),
      attachPreviewProps: {},
      attachOpenLabel: () => 'Open',
      thinkingVerb: 'Thinking',
      thinkingLabel: 'Thinking...'
    }
  }
}

describe('HomeMessageRow quote card & monochrome AI stream', () => {
  it('renders quoted user messages with TxContextChunk and keeps raw text for copying', () => {
    const raw = ['`无名.md`', '> 被抹除。”', '>', '> 我扶着舱沿站起来。', '', '优化'].join('\n')

    const wrapper = mount(HomeMessageRow, {
      props: {
        message: { id: 'u-quote-1', role: 'user', content: raw, status: 'complete' },
        entering: false,
        latest: true,
        streaming: false,
        compacting: false,
        resting: false,
        branchable: false,
        branching: false,
        speakState: 'idle',
        showMetrics: false
      },
      global: { provide: provideMessageContext() }
    })

    const bubble = wrapper.get('.HomePage-UserBubble')
    expect(bubble.classes()).toContain('is-quoted')
    const chunk = wrapper.get('[data-testid="home-user-quote-chunk"]')
    expect(chunk.text()).toContain('被抹除。”')
    expect(chunk.text()).toContain('我扶着舱沿站起来。')
    expect(chunk.text()).toContain('无名.md')
    expect(chunk.text()).toContain('MD')
    expect(wrapper.get('.HomePage-UserBubblePrompt').text()).toBe('优化')
    expect(wrapper.get('[data-testid="msg-actions-stub"]').attributes('data-copy')).toBe(raw)
  })

  it('keeps plain non-quoted user messages verbatim without TxContextChunk', () => {
    const wrapper = mount(HomeMessageRow, {
      props: {
        message: {
          id: 'u-plain-1',
          role: 'user',
          content: '给我写一篇科幻小说',
          status: 'complete'
        },
        entering: false,
        latest: true,
        streaming: false,
        compacting: false,
        resting: false,
        branchable: false,
        branching: false,
        speakState: 'idle',
        showMetrics: false
      },
      global: { provide: provideMessageContext() }
    })

    expect(wrapper.find('[data-testid="home-user-quote-chunk"]').exists()).toBe(false)
    expect(wrapper.get('.HomePage-UserBubble').text()).toBe('给我写一篇科幻小说')
  })

  it('passes monochrome blur reveal preset to TxAiAssistantTurn and delegated markdown', () => {
    const wrapper = mount(HomeMessageRow, {
      props: {
        message: { id: 'a-1', role: 'assistant', content: 'Hello', status: 'streaming' },
        entering: false,
        latest: true,
        streaming: true,
        compacting: false,
        resting: false,
        branchable: false,
        branching: false,
        speakState: 'idle',
        showMetrics: false
      },
      global: { provide: provideMessageContext() }
    })

    const turn = wrapper.get('[data-testid="ai-turn-stub"]')
    expect(turn.attributes('data-reveal')).toBe('blur')
    expect(turn.attributes('data-md-reveal')).toBe('blur')
  })
})
