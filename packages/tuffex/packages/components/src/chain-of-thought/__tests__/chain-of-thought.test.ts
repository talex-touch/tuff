import type { AiChainStep } from '../../ai-elements/src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxChainOfThought from '../src/TxChainOfThought.vue'

function steps(overrides: Partial<AiChainStep>[] = []): AiChainStep[] {
  const base: AiChainStep[] = [
    { id: 't1', kind: 'thinking', title: 'Considering the request', body: 'thinking…', status: 'done' },
    { id: 'c1', kind: 'tool', title: 'search-files', status: 'done' },
    { id: 't2', kind: 'thinking', title: 'Summarising results', body: 'partial', status: 'active' },
  ]
  return base.map((step, index) => ({ ...step, ...(overrides[index] ?? {}) }))
}

describe('txChainOfThought', () => {
  it('renders steps with kind/status markers and a count', () => {
    const wrapper = mount(TxChainOfThought, {
      props: { steps: steps(), streaming: true },
    })

    const items = wrapper.findAll('.tx-chain-of-thought__step')
    expect(items).toHaveLength(3)
    expect(items[0]!.attributes('data-kind')).toBe('thinking')
    expect(items[1]!.attributes('data-kind')).toBe('tool')
    expect(items[2]!.attributes('data-status')).toBe('active')
    expect(items[2]!.find('.tx-chain-of-thought__spin').exists()).toBe(true)
    expect(wrapper.find('.tx-chain-of-thought__count').text()).toBe('3')
  })

  it('shimmers only while streaming with an active step', async () => {
    const wrapper = mount(TxChainOfThought, {
      props: { steps: steps(), streaming: true },
    })
    expect(wrapper.classes()).toContain('is-thinking')

    await wrapper.setProps({
      steps: steps([{}, {}, { status: 'done' }]),
    })
    expect(wrapper.classes()).not.toContain('is-thinking')
  })

  it('is open by default and toggles through an accessible header', async () => {
    const wrapper = mount(TxChainOfThought, {
      props: { steps: steps() },
    })

    const header = wrapper.find('.tx-chain-of-thought__header')
    const collapse = wrapper.find('.tx-chain-of-thought__collapse')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(header.attributes('aria-controls')).toBe(collapse.attributes('id'))
    expect(collapse.classes()).toContain('is-open')

    await header.trigger('click')
    expect(collapse.classes()).not.toContain('is-open')
    expect(wrapper.emitted('toggle')).toEqual([[false]])
  })

  it('honours a host-held override over its own automation', async () => {
    // Streaming hosts re-render around this component on every delta and a
    // branch realignment can recreate the instance — instance-held state dies
    // with it, which read as "clicking does nothing". The host feeds `toggle`
    // back in through `user-open`, so the choice survives any remount.
    const active = [
      { id: 'a', kind: 'thinking' as const, title: 'T', status: 'active' as const },
      { id: 'b', kind: 'tool' as const, title: 'X', status: 'done' as const },
    ]
    const wrapper = mount(TxChainOfThought, {
      props: { steps: active, streaming: true, userOpen: false },
    })
    // Auto would open (live step); the reader's collapse wins.
    expect(wrapper.find('.tx-chain-of-thought__collapse').classes()).not.toContain('is-open')

    // Withdrawing the override (a fresh message) hands control back to auto.
    await wrapper.setProps({ userOpen: undefined })
    expect(wrapper.find('.tx-chain-of-thought__collapse').classes()).toContain('is-open')
  })

  it('renders thinking bodies as sanitized markdown', () => {
    const wrapper = mount(TxChainOfThought, {
      props: {
        steps: [
          {
            id: 'a',
            kind: 'thinking' as const,
            title: 'T',
            body: '**加粗** <img src=x onerror=alert(1)>',
            status: 'done' as const,
          },
        ],
      },
    })

    const md = wrapper.find('.tx-chain-of-thought__md')
    expect(md.find('strong').text()).toBe('加粗')
    expect(md.html()).not.toContain('onerror')
  })

  it('marks error steps', () => {
    const wrapper = mount(TxChainOfThought, {
      props: { steps: steps([{}, { status: 'error' }, {}]) },
    })

    expect(wrapper.findAll('.tx-chain-of-thought__step')[1]!.attributes('data-status')).toBe('error')
  })

  it('renders a duration suffix only on settled steps that carry one', () => {
    const wrapper = mount(TxChainOfThought, {
      props: {
        steps: steps([
          { durationMs: 3210 },
          {},
          // Active step: even with a duration, nothing renders until it settles.
          { durationMs: 900 },
        ]),
        streaming: true,
      },
    })

    const durations = wrapper.findAll('.tx-chain-of-thought__duration')
    expect(durations).toHaveLength(1)
    expect(durations[0]!.text()).toBe('· 3.2s')

    const items = wrapper.findAll('.tx-chain-of-thought__step')
    expect(items[2]!.find('.tx-chain-of-thought__duration').exists()).toBe(false)
  })
})
