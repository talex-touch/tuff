import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import TxAiConversation from '../components/conversation/TxAiConversation.vue'
import TxAiMessage from '../components/conversation/TxAiMessage.vue'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

  it('avoids duplicate back-to-bottom buttons and only auto-follows when tail message key changes', async () => {
    const scrollToBottom = vi.fn()
    const wrapper = mount(TxAiConversation, {
      props: {
        messages: [{ id: 'm1', role: 'user', content: 'Current tail' }],
      },
      global: {
        stubs: {
          TxConversationStream: {
            name: 'TxConversationStream',
            props: ['items', 'hasMoreInitial'],
            emits: ['at-bottom-change', 'load-error'],
            data() {
              return { atBottom: true }
            },
            methods: {
              scrollToBottom,
              scrollToIndex: vi.fn(),
              tweenToBottom: vi.fn(async () => true),
            },
            template: '<div class="stream-stub"><slot v-for="(item, idx) in items" :key="idx" name="item" :item="item" :index="idx" /></div>',
          },
          TxStreamMarkdown: {
            props: ['content'],
            template: '<div>{{ content }}</div>',
          },
        },
      },
    })

    const streamStub = wrapper.findComponent({ name: 'TxConversationStream' })
    expect(streamStub.props('hasMoreInitial')).toBeUndefined()

    streamStub.vm.$emit('at-bottom-change', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-ai-conversation__back').exists()).toBe(false)

    // Detached reader does not get yanked to bottom when tail changes.
    await wrapper.setProps({
      messages: [
        { id: 'm1', role: 'user', content: 'Current tail' },
        { id: 'm2', role: 'assistant', content: 'Detached reply' },
      ],
    })
    expect(scrollToBottom).not.toHaveBeenCalled()

    streamStub.vm.$emit('at-bottom-change', true)
    await wrapper.vm.$nextTick()

    // Prepending older history keeps the tail key unchanged, so auto-follow stays quiet.
    await wrapper.setProps({
      messages: [
        { id: 'm0', role: 'user', content: 'Older turn' },
        { id: 'm1', role: 'user', content: 'Current tail' },
        { id: 'm2', role: 'assistant', content: 'Detached reply' },
      ],
    })
    expect(scrollToBottom).not.toHaveBeenCalled()

    // Appending a new tail message while at bottom triggers auto-follow.
    await wrapper.setProps({
      messages: [
        { id: 'm0', role: 'user', content: 'Older turn' },
        { id: 'm1', role: 'user', content: 'Current tail' },
        { id: 'm2', role: 'assistant', content: 'Detached reply' },
        { id: 'm3', role: 'assistant', content: 'New reply' },
      ],
    })
    expect(scrollToBottom).toHaveBeenCalledWith('auto')
  })

  it('defaults hasMoreInitial to undefined so loadOlder top zone renders unless explicitly false', async () => {
    const loadOlder = vi.fn(async () => ({ hasMore: false }))
    const withDefault = mount(TxAiConversation, {
      props: {
        loadOlder,
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      },
      global: {
        stubs: {
          TxStreamMarkdown: { props: ['content'], template: '<div>{{ content }}</div>' },
        },
      },
    })

    expect(withDefault.find('.tx-ai-conversation__top-note').text()).toBe('Loading earlier messages…')

    const withExplicitFalse = mount(TxAiConversation, {
      props: {
        loadOlder,
        hasMoreInitial: false,
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      },
      global: {
        stubs: {
          TxStreamMarkdown: { props: ['content'], template: '<div>{{ content }}</div>' },
        },
      },
    })

    expect(withExplicitFalse.find('.tx-ai-conversation__top-note.is-done').text()).toBe('Beginning of conversation')
  })

  it('tracks dynamic before, after, and composer slot toggles and attaches ResizeObserver post-flush', async () => {
    const observed: Element[] = []
    let disconnected = 0
    const resizeCallbacks: Array<() => void> = []

    class MockResizeObserver {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb)
      }

      observe(el: Element) {
        observed.push(el)
      }

      unobserve() {}

      disconnect() {
        disconnected += 1
      }
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)

    const scrollToIndexSpy = vi.fn()
    const showBefore = ref(false)
    const showAfter = ref(false)
    const showComposer = ref(false)
    const convRef = ref<InstanceType<typeof TxAiConversation> | null>(null)

    const Host = defineComponent({
      setup() {
        return () => h(
          TxAiConversation,
          {
            ref: convRef,
            messages: [{ id: 'm1', role: 'user', content: 'Prompt' }],
          },
          {
            ...(showBefore.value ? { before: () => h('div', { 'data-test': 'dyn-before' }, 'Before') } : {}),
            ...(showAfter.value ? { after: () => h('div', { 'data-test': 'dyn-after' }, 'After') } : {}),
            ...(showComposer.value
              ? {
                  composer: () => h('div', { 'data-test': 'dyn-composer' }, 'Composer'),
                }
              : {}),
          },
        )
      },
    })

    const wrapper = mount(Host, {
      global: {
        stubs: {
          TxConversationStream: {
            name: 'TxConversationStream',
            props: ['items'],
            methods: {
              scrollToBottom: vi.fn(),
              scrollToIndex: scrollToIndexSpy,
              tweenToBottom: vi.fn(async () => true),
            },
            template: '<div class="stream-stub"><slot v-for="(item, idx) in items" :key="idx" name="item" :item="item" :index="idx" /></div>',
          },
          TxStreamMarkdown: { props: ['content'], template: '<div>{{ content }}</div>' },
        },
      },
    })

    expect(wrapper.find('[data-test="dyn-before"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="dyn-after"]').exists()).toBe(false)
    expect(wrapper.find('.tx-ai-conversation__composer-dock').exists()).toBe(false)

    convRef.value?.scrollToIndex(0)
    expect(scrollToIndexSpy).toHaveBeenLastCalledWith(0)

    showBefore.value = true
    showAfter.value = true
    showComposer.value = true
    await nextTick()

    expect(wrapper.find('[data-test="dyn-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="dyn-after"]').exists()).toBe(true)
    const dock = wrapper.get('.tx-ai-conversation__composer-dock')
    expect(observed).toContain(dock.element)

    convRef.value?.scrollToIndex(0)
    expect(scrollToIndexSpy).toHaveBeenLastCalledWith(1)

    vi.spyOn(dock.element, 'getBoundingClientRect').mockReturnValue({
      height: 84,
      width: 400,
      top: 0,
      left: 0,
      bottom: 84,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    resizeCallbacks.at(-1)?.()
    await nextTick()
    expect(wrapper.get('.tx-ai-conversation').attributes('style')).toContain('--tx-ai-composer-clearance: 100px')

    showBefore.value = false
    showComposer.value = false
    await nextTick()

    expect(wrapper.find('[data-test="dyn-before"]').exists()).toBe(false)
    expect(wrapper.find('.tx-ai-conversation__composer-dock').exists()).toBe(false)
    expect(disconnected).toBeGreaterThan(0)
    expect(wrapper.get('.tx-ai-conversation').attributes('style')).toContain('--tx-ai-composer-clearance: 24px')

    convRef.value?.scrollToIndex(0)
    expect(scrollToIndexSpy).toHaveBeenLastCalledWith(0)
  })

  it('folds historic fallback assistant footers by default and reveals newly finished turns for 4500ms', async () => {
    vi.useFakeTimers()

    const historic = mount(TxAiMessage, {
      props: {
        message: { id: 'h1', role: 'assistant', status: 'done', content: 'Settled answer' },
      },
      global: {
        stubs: {
          TxStreamMarkdown: { props: ['content'], template: '<div>{{ content }}</div>' },
        },
      },
    })
    expect(historic.get('.tx-ai-turn-footer').classes()).toContain('is-resting')

    const live = mount(TxAiMessage, {
      props: {
        message: { id: 'l1', role: 'assistant', status: 'streaming', content: 'Streaming...' },
      },
      global: {
        stubs: {
          TxStreamMarkdown: { props: ['content'], template: '<div>{{ content }}</div>' },
        },
      },
    })
    expect(live.find('.tx-ai-turn-footer').exists()).toBe(false)

    await live.setProps({
      message: { id: 'l1', role: 'assistant', status: 'done', content: 'Finished answer' },
    })
    expect(live.get('.tx-ai-turn-footer').classes()).not.toContain('is-resting')

    await vi.advanceTimersByTimeAsync(4499)
    expect(live.get('.tx-ai-turn-footer').classes()).not.toContain('is-resting')

    await vi.advanceTimersByTimeAsync(1)
    expect(live.get('.tx-ai-turn-footer').classes()).toContain('is-resting')
  })
})
