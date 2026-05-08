import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAgentItem from '../src/TxAgentItem.vue'
import TxAgentsList from '../src/TxAgentsList.vue'

describe('txAgentsList', () => {
  const agents = [
    { id: 'deep-agent', name: 'DeepAgent', description: 'Primary workflow agent' },
    { id: 'archived-agent', name: 'Archived Agent', disabled: true },
  ]

  it('renders configurable group titles', () => {
    const wrapper = mount(TxAgentsList, {
      props: {
        agents,
        enabledTitle: 'Active',
        disabledTitle: 'Unavailable',
      },
    })

    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Unavailable')
  })

  it('renders configurable empty text', () => {
    const wrapper = mount(TxAgentsList, {
      props: {
        agents: [],
        emptyText: 'No available agents',
      },
    })

    expect(wrapper.text()).toContain('No available agents')
  })

  it('emits select only for enabled agents', async () => {
    const wrapper = mount(TxAgentsList, {
      props: { agents },
    })

    const items = wrapper.findAllComponents(TxAgentItem)
    await items[0].trigger('click')
    await items[1].trigger('click')

    expect(wrapper.emitted('select')).toEqual([['deep-agent']])
  })
})

describe('txAgentItem', () => {
  it('emits select on click, enter, and space when enabled', async () => {
    const wrapper = mount(TxAgentItem, {
      props: {
        id: 'deep-agent',
        name: 'DeepAgent',
      },
    })

    await wrapper.trigger('click')
    await wrapper.trigger('keydown.enter')
    await wrapper.trigger('keydown.space')

    expect(wrapper.emitted('select')).toEqual([
      ['deep-agent'],
      ['deep-agent'],
      ['deep-agent'],
    ])
  })

  it('does not emit select when disabled', async () => {
    const wrapper = mount(TxAgentItem, {
      props: {
        id: 'disabled-agent',
        name: 'Disabled Agent',
        disabled: true,
      },
    })

    await wrapper.trigger('click')
    await wrapper.trigger('keydown.enter')
    await wrapper.trigger('keydown.space')

    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
