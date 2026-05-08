import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxPicker from '../src/TxPicker.vue'

const columns = [
  {
    key: 'letter',
    options: [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
    ],
  },
  {
    key: 'number',
    options: [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
    ],
  },
]

function mountInlinePicker(props: Record<string, unknown> = {}) {
  return mount(TxPicker, {
    props: {
      popup: false,
      columns,
      ...props,
    },
  })
}

describe('txPicker', () => {
  it('normalizes missing values to the first enabled option in each column', () => {
    const wrapper = mountInlinePicker({
      modelValue: ['missing', 2],
    })

    const selected = wrapper.findAll('.tx-picker__item.is-selected').map(item => item.text())

    expect(selected).toEqual(['B', '2'])
  })

  it('emits confirm and cancel from the toolbar', async () => {
    const wrapper = mountInlinePicker({
      modelValue: ['b', 2],
      title: 'Pick values',
      confirmText: 'Apply',
      cancelText: 'Back',
    })

    expect(wrapper.find('.tx-picker__title').text()).toBe('Pick values')
    expect(wrapper.text()).toContain('Apply')
    expect(wrapper.text()).toContain('Back')

    await wrapper.find('.tx-picker__btn.is-primary').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([['b', 2]])
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])

    await wrapper.find('.tx-picker__btn:not(.is-primary)').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:visible')?.[1]).toEqual([false])
  })

  it('applies disabled state to toolbar and option buttons', () => {
    const wrapper = mountInlinePicker({
      disabled: true,
    })

    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.findAll('.tx-picker__btn').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('.tx-picker__item').every(item => item.attributes('disabled') !== undefined)).toBe(true)
  })

  it('clamps itemHeight and normalizes visibleItemCount for spacing variables', () => {
    const wrapper = mountInlinePicker({
      itemHeight: 12,
      visibleItemCount: 4,
    })

    const style = wrapper.find('.tx-picker__columns').attributes('style')

    expect(style).toContain('--tx-picker-item-height: 24px')
    expect(style).toContain('--tx-picker-padding-y: 48px')
  })
})
