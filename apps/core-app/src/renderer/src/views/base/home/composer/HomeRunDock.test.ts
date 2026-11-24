// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeRunDock from './HomeRunDock.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'home.runStatus.waiting') return '等待模型响应'
      return params ? `${key}:${JSON.stringify(params)}` : key
    }
  })
}))

const STUBS = {
  TxMiko: {
    props: ['state'],
    template: '<span class="stub-miko" :data-state="state" />'
  },
  TxTextMorph: {
    props: ['text'],
    template: '<span class="stub-morph">{{ text }}</span>'
  }
}

describe('HomeRunDock', () => {
  it('renders clamped context meter pill via UIKit TxAiContextMeter and preserves meter semantics', () => {
    const wrapper = mount(HomeRunDock, {
      props: {
        streaming: false,
        step: { kind: 'waiting' },
        contextShare: 135,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })

    const meter = wrapper.get('[role="meter"]')
    expect(meter.attributes('aria-valuenow')).toBe('135')
    expect(wrapper.get('.tx-ai-context-meter__arc').attributes('stroke-dashoffset')).toBe('0')
    expect(wrapper.get('.tx-ai-context-meter__pct').text()).toBe('135%')
    expect(wrapper.get('.tx-ai-context-meter__detail').text()).toBe('128k')
  })

  it('clamps negative context percentages to 0% on the ring meter', () => {
    const wrapper = mount(HomeRunDock, {
      props: {
        streaming: false,
        step: { kind: 'waiting' },
        contextShare: -10,
        contextWindowText: '1M'
      },
      global: { stubs: STUBS }
    })

    const arc = wrapper.get('.tx-ai-context-meter__arc')
    expect(arc.attributes('stroke-dashoffset')).toBe(arc.attributes('stroke-dasharray'))
  })

  it('hides the inline Miko mark when hideMiko is true (roaming pet active)', () => {
    const wrapper = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'thinking', title: 'Planning' },
        contextShare: 20,
        contextWindowText: '128k',
        hideMiko: true
      },
      global: { stubs: STUBS }
    })

    expect(wrapper.find('.stub-miko').exists()).toBe(false)
    expect(wrapper.find('.tx-ai-run-status-line__dot').exists()).toBe(true)
  })

  it('renders dynamic thinking verb in waiting and thinking steps and prefers title when present', () => {
    const waitingWithVerb = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'waiting' },
        verb: 'Thinking…',
        contextShare: null,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })
    expect(waitingWithVerb.get('.tx-ai-run-status-line__step').text()).toBe('Thinking…')

    const waitingFallback = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'waiting' },
        contextShare: null,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })
    expect(waitingFallback.get('.tx-ai-run-status-line__step').text()).toBe('等待模型响应')

    const thinkingWithVerb = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'thinking' },
        verb: 'Capsuling…',
        contextShare: null,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })
    expect(thinkingWithVerb.get('.tx-ai-run-status-line__step').text()).toBe('Capsuling…')

    const thinkingWithTitle = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'thinking', title: 'Reading files' },
        verb: 'Resolving…',
        contextShare: null,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })
    expect(thinkingWithTitle.get('.tx-ai-run-status-line__step').text()).toBe('Reading files')
  })

  it('maps tool step to running Miko state and tool accent tone', () => {
    const wrapper = mount(HomeRunDock, {
      props: {
        streaming: true,
        step: { kind: 'tool', name: 'read_file', summary: 'Reading HomePage.vue' },
        contextShare: 20,
        contextWindowText: '128k'
      },
      global: { stubs: STUBS }
    })

    expect(wrapper.get('.stub-miko').attributes('data-state')).toBe('running')
    expect(wrapper.get('.tx-ai-run-status-line__step').text()).toBe('Reading HomePage.vue')
    expect(wrapper.get('.tx-ai-run-status-line__step').classes()).toContain('is-tool')
  })
})
