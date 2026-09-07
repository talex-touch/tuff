import type { PickerColumn, PickerValue } from '../../picker/src/types'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TxDatePicker from '../src/TxDatePicker.vue'
import datePickerSource from '../src/TxDatePicker.vue?raw'

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

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    matchReferenceWidth: { type: Boolean, default: undefined },
    minWidth: { type: Number, default: undefined },
    maxWidth: { type: Number, default: undefined },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="popover-stub" :data-open="modelValue">
      <div class="popover-stub__reference">
        <slot name="reference" />
      </div>
      <div class="popover-stub__content">
        <slot />
      </div>
    </div>
  `,
})

function mountDatePicker(props: Record<string, unknown> = {}) {
  return mount(TxDatePicker, {
    props,
    global: {
      stubs: {
        TxPicker: PickerStub,
        TxPopover: PopoverStub,
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

  it('emits the clamped value when the model starts out of range', () => {
    const wrapper = mountDatePicker({
      modelValue: '2024-12-31',
      min: '2025-05-10',
    })

    // Clamping for display alone would leave the parent holding an out-of-range
    // date; the picker must push the rendered value back up.
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2025-05-10'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2025-05-10'])
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

  it('renders a field calendar variant for desktop forms', async () => {
    const emptyWrapper = mountDatePicker({
      variant: 'field',
      modelValue: '',
      placeholder: 'Pick a date',
    })

    expect(emptyWrapper.find('.tx-date-picker-field__value').text()).toBe('Pick a date')

    const wrapper = mountDatePicker({
      variant: 'field',
      modelValue: '2026-05-20',
      min: '2026-05-10',
      max: '2026-05-31',
    })

    expect(wrapper.find('.tx-date-picker-field__value').text()).toBe('2026-05-20')
    expect(wrapper.find('.tx-date-picker-calendar__title').text()).toBe('2026-05')

    const dayNine = wrapper.findAll('.tx-date-picker-calendar__cell')
      .find(cell => cell.text() === '9' && !cell.classes('is-outside-month'))
    const dayTwentyFive = wrapper.findAll('.tx-date-picker-calendar__cell')
      .find(cell => cell.text() === '25' && !cell.classes('is-outside-month'))

    expect(dayNine?.attributes('disabled')).toBeDefined()
    expect(dayTwentyFive?.attributes('disabled')).toBeUndefined()

    await dayTwentyFive?.trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-05-25'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2026-05-25'])
  })

  it('sizes the calendar panel to the month grid instead of to the field', () => {
    // The panel defaults to the reference's width; a field narrower than the
    // grid then clipped the last weekday column off the panel's edge.
    const wrapper = mountDatePicker({ variant: 'field', modelValue: '2026-05-20' })
    const popover = wrapper.findComponent(PopoverStub)

    expect(popover.props('matchReferenceWidth')).toBe(false)
    expect(popover.props('minWidth')).toBe(280)
    expect(popover.props('maxWidth')).toBe(360)
    // 7 weekday headers and 7 cells per row, so nothing is cut off.
    expect(wrapper.findAll('.tx-date-picker-calendar__weekdays span')).toHaveLength(7)
    for (const row of wrapper.findAll('.tx-date-picker-calendar__row'))
      expect(row.findAll('.tx-date-picker-calendar__cell')).toHaveLength(7)

    expect(datePickerSource).toMatch(/\.tx-date-picker-calendar \{[^}]*max-width:\s*100%/)
  })

  it('names each calendar day with its full date and owns cells with aria rows', () => {
    const wrapper = mountDatePicker({
      variant: 'field',
      modelValue: '2026-05-20',
    })

    const cells = wrapper.findAll('.tx-date-picker-calendar__cell')
    // Every day cell now announces the full YYYY-MM-DD (pre-fix only the bare day).
    const selected = cells.find(cell => cell.attributes('aria-label') === '2026-05-20')
    expect(selected).toBeTruthy()
    expect(selected!.text()).toBe('20')

    // gridcells are owned by role="row" rows (ARIA requires the row layer, and a
    // month renders exactly six weeks of seven days).
    const rows = wrapper.findAll('[role="row"]')
    expect(rows).toHaveLength(6)
    expect(rows[0].findAll('[role="gridcell"]')).toHaveLength(7)
  })

  it('switches adaptive variant to field on desktop viewport', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    })

    const wrapper = mountDatePicker({
      variant: 'adaptive',
      modelValue: '2026-08-09',
      adaptiveBreakpoint: 768,
    })

    await nextTick()

    expect(wrapper.findComponent(PickerStub).exists()).toBe(false)
    expect(wrapper.find('.tx-date-picker-field').exists()).toBe(true)

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    })
  })
})

describe('txDatePicker quick view switching', () => {
  function cells(wrapper: ReturnType<typeof mountDatePicker>) {
    return wrapper.findAll('.tx-date-picker-calendar__tile')
  }

  it('walks day → month → year from the title and back down by picking', async () => {
    const wrapper = mountDatePicker({ variant: 'field', modelValue: '2026-05-20' })
    const title = wrapper.find('.tx-date-picker-calendar__title')

    expect(title.text()).toBe('2026-05')
    expect(wrapper.find('.tx-date-picker-calendar__grid').exists()).toBe(true)

    await title.trigger('click')
    expect(title.text()).toBe('2026')
    expect(cells(wrapper)).toHaveLength(12)
    expect(wrapper.find('.tx-date-picker-calendar__grid').exists()).toBe(false)

    await title.trigger('click')
    // A 12-year block plus one dimmed year of padding on each side.
    expect(title.text()).toBe('2016 – 2027')
    expect(cells(wrapper)).toHaveLength(14)
    // Nowhere further up, so the title stops acting as a control.
    expect(title.attributes('disabled')).toBeDefined()

    const year2020 = cells(wrapper).find(cell => cell.text() === '2020')!
    await year2020.trigger('click')
    expect(title.text()).toBe('2020')
    expect(cells(wrapper)).toHaveLength(12)

    const march = cells(wrapper).find(cell => cell.text() === '03')!
    await march.trigger('click')
    expect(title.text()).toBe('2020-03')
    expect(wrapper.find('.tx-date-picker-calendar__grid').exists()).toBe(true)
  })

  it('steps by month, by year, or by year block depending on the view', async () => {
    const wrapper = mountDatePicker({ variant: 'field', modelValue: '2026-05-20' })
    const title = wrapper.find('.tx-date-picker-calendar__title')
    const next = wrapper.findAll('.tx-date-picker-calendar__nav')[1]

    await next.trigger('click')
    expect(title.text()).toBe('2026-06')

    await title.trigger('click')
    await next.trigger('click')
    expect(title.text()).toBe('2027')

    await title.trigger('click')
    await next.trigger('click')
    expect(title.text()).toBe('2028 – 2039')
  })

  it('animates a step sideways and a zoom in place', async () => {
    const wrapper = mountDatePicker({ variant: 'field', modelValue: '2026-05-20' })
    const transition = () => wrapper.findComponent({ name: 'Transition' })

    // The key is what makes the swap a transition rather than an in-place patch.
    expect(wrapper.find('.tx-date-picker-calendar__view').exists()).toBe(true)
    expect(transition().props('name')).toBe('tx-date-zoom')

    await wrapper.findAll('.tx-date-picker-calendar__nav')[1].trigger('click')
    expect(transition().props('name')).toBe('tx-date-slide-next')

    await wrapper.findAll('.tx-date-picker-calendar__nav')[0].trigger('click')
    expect(transition().props('name')).toBe('tx-date-slide-prev')

    await wrapper.find('.tx-date-picker-calendar__title').trigger('click')
    expect(transition().props('name')).toBe('tx-date-zoom')
  })

  it('keeps the selected day visible under the pointer', () => {
    // jsdom applies no stylesheet: `:hover` alone outranks `.is-selected`, so
    // the rule has to exclude the selected cell explicitly.
    expect(datePickerSource).toContain('.tx-date-picker-calendar__cell:hover:not(:disabled):not(.is-selected)')
    expect(datePickerSource).toContain('.tx-date-picker-calendar__cell.is-selected:hover:not(:disabled)')
    expect(datePickerSource).toMatch(/\.tx-date-picker-calendar__cell\.is-selected \{[^}]*animation: tx-date-pick/)
  })
})

describe('txDatePicker range selection', () => {
  function dayCell(wrapper: ReturnType<typeof mountDatePicker>, label: string) {
    return wrapper.findAll('.tx-date-picker-calendar__cell')
      .find(cell => cell.text() === label && !cell.classes('is-outside-month'))!
  }

  it('emits only once both ends are picked', async () => {
    const wrapper = mountDatePicker({ variant: 'field', range: true, modelValue: ['2026-05-01', '2026-05-01'] })

    await dayCell(wrapper, '10').trigger('click')
    // One end is not a range: the model stays put until the second click.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await dayCell(wrapper, '14').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['2026-05-10', '2026-05-14'])
    expect(wrapper.emitted('change')?.[0][0]).toEqual(['2026-05-10', '2026-05-14'])
  })

  it('orders the pair when the second click lands before the first', async () => {
    const wrapper = mountDatePicker({ variant: 'field', range: true, modelValue: ['2026-05-01', '2026-05-01'] })

    await dayCell(wrapper, '20').trigger('click')
    await dayCell(wrapper, '12').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['2026-05-12', '2026-05-20'])
  })

  it('marks the ends and the days between them', async () => {
    const wrapper = mountDatePicker({ variant: 'field', range: true, modelValue: ['2026-05-10', '2026-05-13'] })

    expect(dayCell(wrapper, '10').classes()).toContain('is-range-start')
    expect(dayCell(wrapper, '13').classes()).toContain('is-range-end')
    expect(dayCell(wrapper, '11').classes()).toContain('is-in-range')
    expect(dayCell(wrapper, '12').classes()).toContain('is-in-range')

    // The ends are the selection; they are not part of the band.
    expect(dayCell(wrapper, '10').classes()).not.toContain('is-in-range')
    expect(dayCell(wrapper, '14').classes()).not.toContain('is-in-range')
    expect(dayCell(wrapper, '9').classes()).not.toContain('is-in-range')
  })

  it('previews the band under the pointer while the second click is pending', async () => {
    const wrapper = mountDatePicker({ variant: 'field', range: true, modelValue: ['2026-05-01', '2026-05-01'] })

    await dayCell(wrapper, '10').trigger('click')
    await dayCell(wrapper, '15').trigger('mouseenter')

    expect(dayCell(wrapper, '12').classes()).toContain('is-in-range')
    expect(dayCell(wrapper, '15').classes()).toContain('is-range-end')

    // Hovering before the anchor previews backwards just as well.
    await dayCell(wrapper, '6').trigger('mouseenter')
    expect(dayCell(wrapper, '8').classes()).toContain('is-in-range')
    expect(dayCell(wrapper, '12').classes()).not.toContain('is-in-range')

    // Nothing has been emitted by hovering alone.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows both ends in the field and abandons a half-picked range on close', async () => {
    const wrapper = mountDatePicker({
      variant: 'field',
      range: true,
      modelValue: ['2026-05-10', '2026-05-14'],
      visible: true,
    })

    expect(wrapper.find('.tx-date-picker-field__value').text()).toBe('2026-05-10 → 2026-05-14')

    await dayCell(wrapper, '20').trigger('click')
    expect(dayCell(wrapper, '20').classes()).toContain('is-range-start')

    await wrapper.setProps({ visible: false })
    await nextTick()

    // The armed half-range is dropped, so reopening does not finish a range the
    // user walked away from.
    expect(dayCell(wrapper, '10').classes()).toContain('is-range-start')
    expect(dayCell(wrapper, '14').classes()).toContain('is-range-end')
    expect(wrapper.find('.tx-date-picker-calendar__title').text()).toBe('2026-05')
  })

  it('leaves the single-date contract alone', async () => {
    const wrapper = mountDatePicker({ variant: 'field', modelValue: '2026-05-20' })

    await dayCell(wrapper, '22').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBe('2026-05-22')
    expect(dayCell(wrapper, '21').classes()).not.toContain('is-in-range')
  })
})
