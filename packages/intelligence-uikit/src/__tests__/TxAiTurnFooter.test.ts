import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import TxAiTurnFooter from '../components/conversation/TxAiTurnFooter.vue'
import { useTurnFooterState } from '../index'

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('txAiTurnFooter host-owned actions', () => {
  it('emits exact copy text and action intents without writing to the clipboard', async () => {
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(TxAiTurnFooter, { props: {
      content: 'Answer\nwith **markup**', resting: false, regenerable: true, branchable: true,
      labels: { copy: 'Copy response', regenerate: 'Generate again', speak: 'Read response', branch: 'Branch response' },
    } })
    for (const label of ['Copy response', 'Generate again', 'Read response', 'Branch response']) await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
    expect(wrapper.emitted('copy')).toEqual([['Answer\nwith **markup**']])
    for (const event of ['regenerate', 'speak', 'branch']) expect(wrapper.emitted(event)).toEqual([[]])
    expect(writeText).not.toHaveBeenCalled()
  })

  it('honors host playback/branch busy states and removes unavailable controls', async () => {
    const wrapper = mount(TxAiTurnFooter, { props: {
      content: 'Speak this', speakState: 'loading', regenerable: false, branchable: true, branching: true,
      labels: { copy: 'Copy response', regenerate: 'Generate again', speak: 'Read response', speakStop: 'Stop playback', branch: 'Branch response' },
    } })
    await wrapper.get('button[aria-label="Branch response"]').trigger('click')
    await wrapper.get('button[aria-label="Read response"]').trigger('click')
    expect(wrapper.emitted('branch')).toBeUndefined()
    expect(wrapper.emitted('speak')).toEqual([[]])
    expect(wrapper.find('button[aria-label="Generate again"]').exists()).toBe(false)
    await wrapper.setProps({ speakState: 'speaking', branching: false })
    await wrapper.get('button[aria-label="Stop playback"]').trigger('click')
    await wrapper.get('button[aria-label="Branch response"]').trigger('click')
    expect(wrapper.emitted('speak')).toEqual([[], []])
    expect(wrapper.emitted('branch')).toEqual([[]])
    await wrapper.setProps({ content: undefined, branchable: false })
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('renders host metrics with output-only speed and localized diagnostic titles, and can hide them', async () => {
    const wrapper = mount(TxAiTurnFooter, { props: {
      metrics: {
        latencyMs: 2500,
        ttftMs: 125,
        promptTokens: 180,
        completionTokens: 20,
        totalTokens: 200,
        cacheReadTokens: 1200,
        model: 'magpie/auto/hy4-preview-f',
        provider: 'omp-config',
        reasoning: 'Max',
        reasoningTitle: 'Max (this model strongest: Extra high)',
        coordinator: 'host-router',
      },
      showMetrics: true,
      labels: {
        totalLatency: 'Elapsed',
        ttft: 'First byte',
        input: 'Prompt',
        output: 'Answer',
        total: 'All',
        cache: 'Reused context',
        cacheTitle: 'Prompt cache',
        model: 'Engine',
        provider: 'Endpoint',
        reasoning: 'Effort',
        coordinator: 'Router',
      },
    } })
    const tags = wrapper.findAll('.tx-ai-turn-footer-Tag')
    expect(tags.map(tag => [tag.text(), tag.attributes('title')])).toEqual([
      ['2.5s', 'Elapsed: 2.5s · First byte: 125ms'],
      ['200 tokens(8 t/s)', 'Prompt: 180 · Answer: 20 · All: 200'],
      ['Reused context', 'Prompt cache'],
      [
        'magpie/auto/hy4-preview-f · Max',
        'Engine: magpie/auto/hy4-preview-f · Endpoint: omp-config · Effort: Max (this model strongest: Extra high)',
      ],
      ['host-router', 'Router'],
    ])
    expect(wrapper.get('.tx-ai-turn-footer-ModelPrefix').text()).toBe('magpie/')
    await wrapper.setProps({ showMetrics: false })
    expect(wrapper.find('.tx-ai-turn-footer-Metrics').exists()).toBe(false)
  })
})

describe('turn footer completion visibility', () => {
  it('keeps the latest settled assistant turn expanded by default and folds earlier turns when a new turn arrives', async () => {
    vi.useFakeTimers()
    const messages = ref([
      { id: 'u1', role: 'user', status: 'complete' },
      { id: 'a1', role: 'assistant', status: 'complete' },
      { id: 'u2', role: 'user', status: 'complete' },
      { id: 'a2', role: 'assistant', status: 'complete' },
    ])
    const Host = defineComponent({ setup() {
      const { isTurnFooterResting } = useTurnFooterState(computed(() => messages.value))
      return () => h('section', messages.value.map(message => h(TxAiTurnFooter, {
        key: message.id, 'data-turn': message.id, content: message.id, motion: 'none', resting: isTurnFooterResting(message),
      })))
    } })
    const wrapper = mount(Host)
    expect(wrapper.get('[data-turn="a1"]').classes()).toContain('is-resting')
    expect(wrapper.get('[data-turn="a2"]').classes()).not.toContain('is-resting')

    await vi.advanceTimersByTimeAsync(10000)
    expect(wrapper.get('[data-turn="a2"]').classes()).not.toContain('is-resting')

    messages.value = [
      ...messages.value,
      { id: 'u3', role: 'user', status: 'complete' },
      { id: 'a3', role: 'assistant', status: 'streaming' },
    ]
    await nextTick()
    expect(wrapper.get('[data-turn="a2"]').classes()).toContain('is-resting')

    messages.value = messages.value.map(message => message.id === 'a3' ? { ...message, status: 'complete' } : message)
    await nextTick()
    expect(wrapper.get('[data-turn="a3"]').classes()).not.toContain('is-resting')
    await vi.advanceTimersByTimeAsync(10000)
    expect(wrapper.get('[data-turn="a3"]').classes()).not.toContain('is-resting')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reveals a non-tail newly completed assistant turn for 4500ms without extending on unrelated updates', async () => {
    vi.useFakeTimers()
    const messages = ref([
      { id: 'historic', role: 'assistant', status: 'complete' },
      { id: 'answer', role: 'assistant', status: 'streaming' },
      { id: 'user', role: 'user', status: 'pending' },
    ])
    const Host = defineComponent({ setup() {
      const { isTurnFooterResting } = useTurnFooterState(computed(() => messages.value))
      return () => h('section', messages.value.map(message => h(TxAiTurnFooter, {
        key: message.id, 'data-turn': message.id, content: message.id, motion: 'none', resting: isTurnFooterResting(message),
      })))
    } })
    const wrapper = mount(Host)
    messages.value = messages.value.map(message => ({ ...message, status: 'complete' }))
    await nextTick()
    expect(wrapper.get('[data-turn="answer"]').classes()).not.toContain('is-resting')
    expect(wrapper.get('[data-turn="historic"]').classes()).toContain('is-resting')
    expect(wrapper.get('[data-turn="user"]').classes()).toContain('is-resting')
    await vi.advanceTimersByTimeAsync(4499)
    messages.value = messages.value.map(message => ({ ...message }))
    await nextTick()
    expect(wrapper.get('[data-turn="answer"]').classes()).not.toContain('is-resting')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('[data-turn="answer"]').classes()).toContain('is-resting')
    messages.value = messages.value.map(message => message.id === 'answer' ? { ...message, status: 'streaming' } : message)
    await nextTick()
    messages.value = messages.value.map(message => ({ ...message, status: 'complete' }))
    await nextTick()
    expect(wrapper.get('[data-turn="answer"]').classes()).not.toContain('is-resting')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts the reveal window when a non-tail turn finishes again before the old window expires', async () => {
    vi.useFakeTimers()
    const messages = ref([
      { id: 'answer', role: 'assistant', status: 'streaming' },
      { id: 'follow-up', role: 'user', status: 'complete' },
    ])
    const Host = defineComponent({ setup() {
      const { isTurnFooterResting } = useTurnFooterState(computed(() => messages.value))
      return () => h(TxAiTurnFooter, { resting: isTurnFooterResting(messages.value[0]), motion: 'none' })
    } })
    const wrapper = mount(Host)
    messages.value[0].status = 'complete'
    await nextTick()
    await vi.advanceTimersByTimeAsync(3000)
    messages.value[0].status = 'streaming'
    await nextTick()
    messages.value[0].status = 'complete'
    await nextTick()
    await vi.advanceTimersByTimeAsync(1500)
    expect(wrapper.classes()).not.toContain('is-resting')
    await vi.advanceTimersByTimeAsync(2999)
    expect(wrapper.classes()).not.toContain('is-resting')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.classes()).toContain('is-resting')
  })
})
