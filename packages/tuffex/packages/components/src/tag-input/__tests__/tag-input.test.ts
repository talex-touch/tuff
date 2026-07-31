import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTagInput from '../src/TxTagInput.vue'

describe('txTagInput', () => {
  it('adds tag on Enter', async () => {
    const wrapper = mount(TxTagInput, {
      props: { modelValue: [] },
    })

    const input = wrapper.find('input')
    await input.setValue('foo')
    await input.trigger('keydown', { key: 'Enter' })

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toEqual(['foo'])
  })

  it('removes tag on close', async () => {
    const wrapper = mount(TxTagInput, {
      props: { modelValue: ['foo'] },
    })

    await wrapper.find('.tx-tag__close').trigger('click')
    expect(wrapper.emitted('remove')?.[0][0]).toBe('foo')
  })

  it('splits on a "-" separator without crashing or eating characters', async () => {
    const wrapper = mount(TxTagInput, {
      props: { modelValue: [], separators: [',', '-', ' '] },
    })

    const input = wrapper.find('input')
    await input.setValue('a-b ')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['a', 'b'])
  })

  it('removes only the clicked chip when duplicates are allowed', async () => {
    const wrapper = mount(TxTagInput, {
      props: { modelValue: ['foo', 'foo', 'bar'], allowDuplicates: true },
    })

    const closeButtons = wrapper.findAll('.tx-tag__close')
    await closeButtons[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['foo', 'bar'])
  })
})
