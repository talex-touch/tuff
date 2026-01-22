import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TxTreeSelect from '../src/TxTreeSelect.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: '<div><slot name="reference" /><div><slot /></div></div>',
})

describe('txTreeSelect', () => {
  const nodes = [
    { key: 'a', label: 'Alpha', children: [{ key: 'a-1', label: 'Alpha-1' }] },
    { key: 'b', label: 'Beta' },
  ]

  it('emits selection on tree click', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const labels = wrapper.findAll('.tx-tree-select__label')
    const beta = labels.find(label => label.text() === 'Beta')
    await beta?.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBe('b')
  })

  it('renders empty state when nodes are missing', () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes: [], searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    expect(wrapper.find('.tx-tree-select__empty').exists()).toBe(true)
  })

  it('clears selection from the clear button', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, modelValue: 'a', clearable: true, searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('.tx-tree-select__clear').trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBeUndefined()
  })
})
