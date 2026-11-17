import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxAiConversation from '../components/conversation/TxAiConversation.vue'

describe('txAiConversation', () => {
  it('renders empty state with starter suggestions and emits suggestionSelect', async () => {
    const wrapper = mount(TxAiConversation, {
      props: {
        messages: [],
        emptyTitle: 'Start a thread',
        suggestions: [
          { text: 'Audit UIKit', description: 'Compare components with CoreApp' },
        ],
      },
      global: {
        stubs: {
          TxMiko: true,
        },
      },
    })

    expect(wrapper.find('.tx-ai-conversation__empty-title').text()).toBe('Start a thread')
    await wrapper.get('.tx-ai-suggestion').trigger('click')
    expect(wrapper.emitted('suggestionSelect')?.[0]).toEqual(['Audit UIKit'])
  })

  it('renders hybrid user voice/attachments, assistant segments/blocks, and outline rail', async () => {
    const wrapper = mount(TxAiConversation, {
      props: {
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'Inspect layout clearance',
            voiceClip: { durationMs: 3200, peaks: [0.3, 0.7] },
            attachments: [{ kind: 'file', id: 'f1', name: 'HomePage.vue', size: 2048 }],
          },
          {
            id: 'a1',
            role: 'assistant',
            status: 'done',
            content: 'Verified resize observer clearance.',
            footer: { content: 'Verified resize observer clearance.', regenerable: true },
            error: { title: 'Partial warning', detail: 'One check skipped', retryable: true },
          },
        ],
      },
      global: {
        stubs: {
          TxStreamMarkdown: {
            props: ['content'],
            template: '<div class="md-stub">{{ content }}</div>',
          },
          TxMiko: true,
        },
      },
    })

    expect(wrapper.find('.tx-ai-message--user .tx-ai-message__user-bubble').text()).toContain('Inspect layout clearance')
    expect(wrapper.find('.tx-ai-message__voice').exists()).toBe(true)
    expect(wrapper.find('.tx-ai-message__attachments').exists()).toBe(true)
    expect(wrapper.find('.tx-ai-message-rail').exists()).toBe(true)

    const railTrigger = wrapper.get('.tx-ai-message-rail__trigger')
    expect(railTrigger.text()).toContain('#1')

    await wrapper.get('.tx-ai-error-block-Action').trigger('click')
    expect(wrapper.emitted('retry')?.[0]).toEqual(['a1'])
  })

  it('preserves before/after slots and exposes stream navigation methods', async () => {
    const loadOlder = vi.fn(async () => ({ hasMore: false }))
    const wrapper = mount(TxAiConversation, {
      props: {
        loadOlder,
        hasMoreInitial: true,
        messages: [
          { id: 'm1', role: 'user', content: 'First prompt' },
        ],
      },
      slots: {
        before: '<div data-test="before-banner">Session restored</div>',
        after: '<div data-test="after-banner">End marker</div>',
        composer: '<div data-test="docked-composer">Composer slot</div>',
      },
      global: {
        stubs: {
          TxStreamMarkdown: {
            props: ['content'],
            template: '<div>{{ content }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('[data-test="before-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="after-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="docked-composer"]').exists()).toBe(true)

    const vm = wrapper.vm as unknown as {
      scrollToBottom: (b?: ScrollBehavior) => void
      scrollToIndex: (i: number) => void
      tweenToBottom: (d?: number) => Promise<boolean>
      syncScrollState: () => void
    }
    expect(vm.scrollToBottom).toBeTypeOf('function')
    expect(vm.scrollToIndex).toBeTypeOf('function')
    expect(vm.tweenToBottom).toBeTypeOf('function')
    expect(vm.syncScrollState).toBeTypeOf('function')
  })
})
