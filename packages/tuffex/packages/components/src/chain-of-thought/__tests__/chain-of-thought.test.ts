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

  it('marks error steps', () => {
    const wrapper = mount(TxChainOfThought, {
      props: { steps: steps([{}, { status: 'error' }, {}]) },
    })

    expect(wrapper.findAll('.tx-chain-of-thought__step')[1]!.attributes('data-status')).toBe('error')
  })
})
