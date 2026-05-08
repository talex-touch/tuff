import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
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
    expect(wrapper.emitted('change')?.[0][0]).toEqual(['b'])
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

  it('toggles paths in multiple mode and clears to an empty array', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        multiple: true,
        modelValue: [['a']],
        options,
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const beta = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual([['a'], ['b']])

    await wrapper.setProps({ modelValue: [['a'], ['b']] })
    await wrapper.find('.tx-cascader__clear').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[1][0]).toEqual([])
  })

  it('blocks disabled trigger and disabled node interactions', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        options: [
          { value: 'a', label: 'Alpha', leaf: true },
          { value: 'b', label: 'Beta', leaf: true, disabled: true },
        ],
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const beta = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ disabled: true })
    await wrapper.find('.tx-cascader').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('loads missing children for non-leaf nodes and selects the loaded leaf', async () => {
    const load = vi.fn(async () => [
      { value: 'a-1', label: 'Alpha child', leaf: true },
    ])

    const wrapper = mount(TxCascader, {
      props: {
        options: [{ value: 'a', label: 'Alpha' }],
        load,
        expandTrigger: 'click',
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('.tx-cascader__item').trigger('click')
    await nextTick()

    expect(load).toHaveBeenCalledWith({ value: 'a', label: 'Alpha' }, 1)
    expect(wrapper.text()).toContain('Alpha child')

    const child = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Alpha child'))
    await child?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['a', 'a-1'])
  })

  it('exposes open, close, toggle, clear, setValue and getValue helpers', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        modelValue: ['a'],
        options,
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    wrapper.vm.open()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).toContain('is-open')

    wrapper.vm.close()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).not.toContain('is-open')

    wrapper.vm.toggle()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).toContain('is-open')

    wrapper.vm.clear()
    wrapper.vm.setValue(['b'])

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')?.[1][0]).toEqual(['b'])
    expect(wrapper.vm.getValue()).toEqual(['a'])
  })
})
