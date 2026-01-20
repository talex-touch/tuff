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
})
