import type { AiToolCallPart } from '../../ai-elements/src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxToolCallCard from '../src/TxToolCallCard.vue'

function toolCall(overrides: Partial<AiToolCallPart> = {}): AiToolCallPart {
  return {
    type: 'tool-call',
    id: 't1',
    name: 'search-files',
    status: 'pending',
    ...overrides,
  }
}

describe('txToolCallCard', () => {
  it('walks the four states with matching labels', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall() },
    })

    expect(wrapper.attributes('data-status')).toBe('pending')
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Queued')

    await wrapper.setProps({ toolCall: toolCall({ status: 'running', logs: 'scanning…' }) })
    expect(wrapper.attributes('data-status')).toBe('running')
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Running')
    expect(wrapper.find('.tx-tool-call-card__logs').text()).toContain('scanning…')

    await wrapper.setProps({ toolCall: toolCall({ status: 'done', output: '3 files' }) })
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Done')
    expect(wrapper.find('.tx-tool-call-card__result').text()).toContain('3 files')
    expect(wrapper.find('.tx-tool-call-card__logs').exists()).toBe(false)

    await wrapper.setProps({ toolCall: toolCall({ status: 'error', error: 'timed out' }) })
    expect(wrapper.find('[role="alert"]').text()).toContain('timed out')
  })

  it('toggles expansion through an accessible header', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ input: '{ "q": "x" }' }) },
    })

    const header = wrapper.find('.tx-tool-call-card__header')
    const collapse = wrapper.find('.tx-tool-call-card__collapse')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect(header.attributes('aria-controls')).toBe(collapse.attributes('id'))
    expect(collapse.classes()).not.toContain('is-open')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(collapse.classes()).toContain('is-open')
    expect(wrapper.emitted('toggle')).toEqual([[true]])
  })

  it('emits retry with the tool id from the error state', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ id: 't42', status: 'error', error: 'boom' }) },
    })

    await wrapper.find('.tx-tool-call-card__retry').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['t42']])
  })

  it('prefers the result slot over the output fallback', () => {
    const withSlot = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', output: 'fallback text' }) },
      slots: {
        result: `
          <template #result="{ toolCall }">
            <div class="widget-mount">{{ toolCall.id }}</div>
          </template>
        `,
      },
    })

    expect(withSlot.find('.widget-mount').text()).toBe('t1')
    expect(withSlot.find('.tx-tool-call-card__result').text()).not.toContain('fallback text')

    const withoutSlot = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', output: 'fallback text' }) },
    })
    expect(withoutSlot.find('.tx-tool-call-card__result').text()).toContain('fallback text')
  })

  it('shows the collapsed summary line', () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ summary: 'query "config" under src/' }) },
    })

    expect(wrapper.find('.tx-tool-call-card__summary').text()).toContain('query "config" under src/')
  })
})
