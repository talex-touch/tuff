import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxToolConfirmation from '../src/TxToolConfirmation.vue'

describe('txToolConfirmation', () => {
  it('shows the tool, summary, input and risk chip', () => {
    const wrapper = mount(TxToolConfirmation, {
      props: {
        toolName: 'tuff_search_files',
        summary: 'Search /tmp for the largest files',
        input: '{ "path": "/tmp" }',
        risk: 'read',
      },
    })

    expect(wrapper.find('.tx-tool-confirmation__name').text()).toBe('tuff_search_files')
    expect(wrapper.find('.tx-tool-confirmation__summary').text()).toContain('largest files')
    expect(wrapper.find('.tx-tool-confirmation__input').text()).toContain('"/tmp"')
    expect(wrapper.find('.tx-tool-confirmation__risk').text()).toBe('Read-only')
    expect(wrapper.attributes('data-risk')).toBe('read')
  })

  it('carries the remember choice on approve', async () => {
    const wrapper = mount(TxToolConfirmation, {
      props: { toolName: 'read' },
    })

    await wrapper.find('.tx-tool-confirmation__remember input').setValue(true)
    await wrapper.find('.tx-tool-confirmation__allow').trigger('click')

    expect(wrapper.emitted('approve')).toEqual([[{ remember: true }]])
    expect(wrapper.emitted('deny')).toBeUndefined()
  })

  it('denies without remember by default', async () => {
    const wrapper = mount(TxToolConfirmation, {
      props: { toolName: 'read' },
    })

    await wrapper.find('.tx-tool-confirmation__deny').trigger('click')
    expect(wrapper.emitted('deny')).toEqual([[{ remember: false }]])
  })

  it('marks non-read risks as dangerous', () => {
    const wrapper = mount(TxToolConfirmation, {
      props: { toolName: 'tuff_open_path', risk: 'execute' },
    })

    expect(wrapper.attributes('data-risk')).toBe('execute')
    expect(wrapper.find('.tx-tool-confirmation__allow').classes()).toContain('is-dangerous')
    expect(wrapper.find('.tx-tool-confirmation__risk').text()).toBe('Executes')
  })

  it('accepts localized labels', () => {
    const wrapper = mount(TxToolConfirmation, {
      props: {
        toolName: 'read',
        allowLabel: '允许',
        denyLabel: '拒绝',
        rememberLabel: '本会话记住',
        riskLabels: { read: '只读' },
      },
    })

    expect(wrapper.find('.tx-tool-confirmation__allow').text()).toBe('允许')
    expect(wrapper.find('.tx-tool-confirmation__deny').text()).toBe('拒绝')
    expect(wrapper.find('.tx-tool-confirmation__remember').text()).toContain('本会话记住')
    expect(wrapper.find('.tx-tool-confirmation__risk').text()).toBe('只读')
  })
})
