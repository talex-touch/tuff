import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxCascader from '../src/TxCascader.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: '<div><slot name="reference" /><div><slot /></div></div>',
})

describe('txCascader', () => {
  const options = [
    { value: 'a', label: 'Alpha', leaf: true },
    { value: 'b', label: 'Beta', leaf: true },
  ]

  it('emits selection for a leaf item', async () => {
    const wrapper = mount(TxCascader, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const items = wrapper.findAll('.tx-cascader__item')
    const beta = items.find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toEqual(['b'])
  })

  it('shows empty state when search has no hits', async () => {
    const wrapper = mount(TxCascader, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz')
    await nextTick()

    expect(wrapper.find('.tx-cascader__empty').exists()).toBe(true)
  })
})
