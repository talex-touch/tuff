import type { PickerColumn, PickerValue } from '../../picker/src/types'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TxDatePicker from '../src/TxDatePicker.vue'

const PickerStub = defineComponent({
  name: 'TxPicker',
  props: {
    modelValue: { type: Array, default: () => [] },
    visible: { type: Boolean, default: false },
    columns: { type: Array, default: () => [] },
    popup: { type: Boolean, default: true },
    title: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    showToolbar: { type: Boolean, default: true },
    confirmText: { type: String, default: '' },
    cancelText: { type: String, default: '' },
    closeOnClickMask: { type: Boolean, default: true },
  },
  emits: ['update:modelValue', 'update:visible', 'confirm', 'cancel', 'open', 'close'],
  template: '<div class="picker-stub"><slot /></div>',
})

function mountDatePicker(props: Record<string, unknown> = {}) {
  return mount(TxDatePicker, {
    props,
    global: {
      stubs: {
        TxPicker: PickerStub,
      },
    },
  })
}

function pickerProps(wrapper: ReturnType<typeof mountDatePicker>) {
  return wrapper.findComponent(PickerStub).props() as {
    modelValue: PickerValue
    columns: PickerColumn[]
    visible: boolean
    popup: boolean
    title: string
    disabled: boolean
    showToolbar: boolean
    confirmText: string
    cancelText: string
    closeOnClickMask: boolean
  }
}

describe('txDatePicker', () => {
  it('normalizes modelValue into picker columns and forwards presentation props', () => {
    const wrapper = mountDatePicker({
      modelValue: '2026-02-03',
      visible: true,
      popup: false,
      title: 'Billing date',
      disabled: true,
      showToolbar: false,
      confirmText: 'Apply',
      cancelText: 'Back',
      closeOnClickMask: false,
    })

    const props = pickerProps(wrapper)

    expect(props.modelValue).toEqual([2026, 2, 3])
    expect(props.visible).toBe(true)
    expect(props.popup).toBe(false)
    expect(props.title).toBe('Billing date')
    expect(props.disabled).toBe(true)
    expect(props.showToolbar).toBe(false)
    expect(props.confirmText).toBe('Apply')
    expect(props.cancelText).toBe('Back')
    expect(props.closeOnClickMask).toBe(false)
    expect(props.columns.map(column => column.key)).toEqual(['year', 'month', 'day'])
    expect(props.columns[1].options.map(option => option.label)).toContain('02')
  })

  it('clamps invalid and out-of-range dates to min and max bounds', async () => {
    const belowMin = mountDatePicker({
      modelValue: '2024-12-31',
      min: '2025-05-10',
      max: '2025-06-20',
    })

    expect(pickerProps(belowMin).modelValue).toEqual([2025, 5, 10])

    const aboveMax = mountDatePicker({
      modelValue: 'not-a-date',
      min: '2020-01-01',
      max: '2020-01-02',
    })

    expect(pickerProps(aboveMax).modelValue).toEqual([2020, 1, 2])

    await aboveMax.setProps({ max: '2020-01-01' })
    await nextTick()

    expect(pickerProps(aboveMax).modelValue).toEqual([2020, 1, 1])
  })

  it('disables month and day options outside the active bounds', () => {
    const wrapper = mountDatePicker({
      modelValue: '2025-05-15',
      min: '2025-05-10',
      max: '2025-06-20',
    })

    const [, months, days] = pickerProps(wrapper).columns

    expect(months.options.find(option => option.value === 4)?.disabled).toBe(true)
    expect(months.options.find(option => option.value === 5)?.disabled).toBe(false)
    expect(days.options.find(option => option.value === 9)?.disabled).toBe(true)
    expect(days.options.find(option => option.value === 10)?.disabled).toBe(false)
  })

  it('emits formatted dates when picker value changes or confirms', async () => {
    const wrapper = mountDatePicker({
      modelValue: '2026-01-02',
    })

    const picker = wrapper.findComponent(PickerStub)

    await picker.vm.$emit('update:modelValue', [2026, 12, 31])
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-12-31'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2026-12-31'])

    await picker.vm.$emit('confirm')

    expect(wrapper.emitted('confirm')?.[0]).toEqual(['2026-12-31'])
  })

  it('forwards visibility and lifecycle events', async () => {
    const wrapper = mountDatePicker()
    const picker = wrapper.findComponent(PickerStub)

    await picker.vm.$emit('update:visible', true)
    await picker.vm.$emit('cancel')
    await picker.vm.$emit('open')
    await picker.vm.$emit('close')

    expect(wrapper.emitted('update:visible')?.[0]).toEqual([true])
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
