import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxPicker from '../src/TxPicker.vue'
import pickerSource from '../src/TxPicker.vue?raw'

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
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes missing values to the first enabled option in each column', () => {
    const wrapper = mountInlinePicker({
      modelValue: ['missing', 2],
    })

    const selected = wrapper.findAll('.tx-picker__item.is-selected').map(item => item.text())

    expect(selected).toEqual(['B', '2'])
  })

  it('emits an update when a columns change invalidates the current value', async () => {
    const wrapper = mountInlinePicker({
      modelValue: ['b', 2],
    })
    await flushPromises()

    // Replace the number column so value 2 no longer exists; it must normalize to the
    // first enabled option AND tell the parent, not silently diverge from v-model.
    await wrapper.setProps({
      columns: [
        columns[0],
        { key: 'number', options: [{ value: 9, label: '9' }, { value: 8, label: '8' }] },
      ],
    })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b', 9]])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([['b', 9]])
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
    // Rows are inert by design — the column owns the pointer — so a disabled
    // picker is expressed on the column, and a disabled option on the row.
    expect(wrapper.findAll('.tx-picker__wheel').every(wheel => wheel.attributes('tabindex') === '-1')).toBe(true)
    const disabledOption = wrapper.findAll('.tx-picker__item').find(item => item.text() === 'A')
    expect(disabledOption?.attributes('aria-disabled')).toBe('true')
  })

  it('clamps itemHeight and derives the drum geometry from it', () => {
    const wrapper = mountInlinePicker({
      itemHeight: 12,
      visibleItemCount: 4,
    })

    const style = wrapper.find('.tx-picker__columns').attributes('style')

    // 12 is below the floor of 24.
    expect(style).toContain('--tx-picker-item-height: 24px')
    // r = (itemHeight / 2) / tan(step / 2), so the row's arc length matches its
    // height and the labels neither stretch nor bunch on the surface.
    expect(style).toContain('--tx-picker-radius: 76px')
    expect(style).toContain('--tx-picker-step: 18')
  })

  it('sizes the inline track to visibleItemCount rows via the CSS variable', () => {
    const wrapper = mountInlinePicker({
      visibleItemCount: 7,
    })

    const style = wrapper.find('.tx-picker__columns').attributes('style')

    // The track height is `calc(item-height * var(--tx-picker-visible-count, 5))`;
    // inline mode must publish the variable too, not fall back to the default 5.
    expect(style).toContain('--tx-picker-visible-count: 7')
  })

  it('turns each inline column to its active row on mount', async () => {
    const wrapper = mountInlinePicker({
      modelValue: ['b', 2],
    })

    await flushPromises()

    // The column's position is one number, in rows: 'b' is index 1 in column 0
    // and 2 is index 1 in column 1, so both land on row 1 without user input.
    const wheels = wrapper.findAll('.tx-picker__wheel')
    expect((wheels[0]!.element as HTMLElement).style.getPropertyValue('--tx-picker-offset')).toBe('1')
    expect((wheels[1]!.element as HTMLElement).style.getPropertyValue('--tx-picker-offset')).toBe('1')
  })

  it('does not turn or emit when disabled', async () => {
    const wrapper = mountInlinePicker({
      disabled: true,
      modelValue: ['b', 2],
    })

    await flushPromises()

    const wheel = wrapper.findAll('.tx-picker__wheel')[0]!
    const before = (wheel.element as HTMLElement).style.getPropertyValue('--tx-picker-offset')

    await wheel.trigger('wheel', { deltaY: 120 })
    await wheel.trigger('pointerdown', { pointerId: 1, clientY: 100 })
    await wheel.trigger('pointermove', { pointerId: 1, clientY: 40 })
    await wheel.trigger('pointerup', { pointerId: 1, clientY: 40 })

    expect((wheel.element as HTMLElement).style.getPropertyValue('--tx-picker-offset')).toBe(before)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})

describe('txPicker keyboard a11y', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Dispatch a real, cancelable keydown so `defaultPrevented` is observable — the
  // component must consume arrow keys or the whole page scrolls under the picker.
  function keydown(el: Element, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event
  }

  it('exposes a focusable listbox, option roles, and an active descendant', () => {
    const wrapper = mountInlinePicker({ modelValue: ['b', 2] })

    const scroller = wrapper.findAll('.tx-picker__wheel')[0]!
    // The listbox is the single tab stop; its options are pulled out of the tab
    // sequence so focus stays put and aria-activedescendant conveys position.
    expect(scroller.attributes('role')).toBe('listbox')
    expect(scroller.attributes('tabindex')).toBe('0')

    const options = wrapper.findAll('.tx-picker__item')
    expect(options.every(o => o.attributes('role') === 'option')).toBe(true)
    // Focus stays on the column; the rows never take a tab stop of their own.
    expect(options.every(o => o.attributes('tabindex') === undefined)).toBe(true)
    // Only a window of rows is rendered, so each carries its place in the whole.
    expect(options.every(o => o.attributes('aria-setsize') !== undefined)).toBe(true)
    expect(options.every(o => o.attributes('aria-posinset') !== undefined)).toBe(true)

    const selectedInFirstCol = wrapper.findAll('.tx-picker__col')[0]!.find('.tx-picker__item.is-selected')
    expect(selectedInFirstCol.attributes('aria-selected')).toBe('true')
    expect(scroller.attributes('aria-activedescendant')).toBe(selectedInFirstCol.attributes('id'))
  })

  it('moves the selection with ArrowUp/ArrowDown and prevents page scrolling', async () => {
    const wrapper = mountInlinePicker({ modelValue: ['b', 2] })
    await flushPromises()

    const numberCol = wrapper.findAll('.tx-picker__wheel')[1]!.element

    // 2 is index 1; ArrowUp lands on 1 and reports the change through v-model.
    const up = keydown(numberCol, 'ArrowUp')
    await nextTick()
    expect(up.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b', 1]])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([['b', 1]])

    // ArrowDown returns to 2.
    keydown(numberCol, 'ArrowDown')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b', 2]])
  })

  it('skips disabled options and lands on the nearest enabled one', async () => {
    const wrapper = mountInlinePicker({
      modelValue: ['p'],
      columns: [
        {
          key: 'x',
          options: [
            { value: 'p', label: 'P' },
            { value: 'q', label: 'Q', disabled: true },
            { value: 'r', label: 'R' },
          ],
        },
      ],
    })
    await flushPromises()

    // ArrowDown from P must skip the disabled Q and settle on R.
    keydown(wrapper.find('.tx-picker__wheel').element, 'ArrowDown')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['r']])
  })

  it('jumps to the first/last enabled option with Home/End', async () => {
    const wrapper = mountInlinePicker({ modelValue: ['b', 1] })
    await flushPromises()

    // Home in column 0 must consume the key even though the disabled 'a' leaves
    // 'b' as the first enabled option (already selected, so no value change).
    const home = keydown(wrapper.findAll('.tx-picker__wheel')[0]!.element, 'Home')
    await nextTick()
    expect(home.defaultPrevented).toBe(true)

    // End in the number column jumps from 1 to the last option 2.
    keydown(wrapper.findAll('.tx-picker__wheel')[1]!.element, 'End')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b', 2]])
  })

  it('ignores arrow keys and leaves the tab order when disabled', async () => {
    const wrapper = mountInlinePicker({ disabled: true, modelValue: ['b', 2] })
    await flushPromises()

    const numberCol = wrapper.findAll('.tx-picker__wheel')[1]!
    // The a11y markup still renders, but disabled mirrors the scroll guard: the
    // listbox drops out of the tab order and arrow keys neither move nor consume.
    expect(numberCol.find('.tx-picker__item').attributes('role')).toBe('option')
    expect(numberCol.attributes('tabindex')).toBe('-1')

    const ev = keydown(numberCol.element, 'ArrowUp')
    await nextTick()
    expect(ev.defaultPrevented).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('applies the same listbox semantics to the popup render path', async () => {
    const wrapper = mount(TxPicker, {
      attachTo: document.body,
      props: { popup: true, visible: true, lazyMount: false, columns, modelValue: ['b', 2] },
    })
    await flushPromises()

    const scroller = document.body.querySelector('.tx-picker-popup .tx-picker__wheel')
    expect(scroller?.getAttribute('role')).toBe('listbox')
    expect(scroller?.getAttribute('tabindex')).toBe('0')

    const option = document.body.querySelector('.tx-picker-popup .tx-picker__item')
    expect(option?.getAttribute('role')).toBe('option')
    expect(option?.getAttribute('aria-posinset')).toBeTruthy()

    wrapper.unmount()
  })
})

describe('txPicker wheel', () => {
  const many = [{
    key: 'c',
    options: Array.from({ length: 40 }).map((_, i) => ({ value: `v${i}`, label: `O${i}` })),
  }]

  function mountWheel(props: Record<string, unknown> = {}) {
    return mount(TxPicker, { props: { popup: false, columns: many, modelValue: ['v20'], ...props } })
  }

  it('draws only the rows within a quarter turn, not the whole column', async () => {
    const wrapper = mountWheel()
    await flushPromises()

    const rows = wrapper.findAll('.tx-picker__item')
    // 40 options, a window of 5 rows either side of the centre.
    expect(rows.length).toBeGreaterThan(6)
    expect(rows.length).toBeLessThan(16)

    // Each still reports its place in the full column, so the window is
    // invisible to assistive tech.
    expect(rows[0]?.attributes('aria-setsize')).toBe('40')
    const selected = wrapper.find('.tx-picker__item.is-selected')
    expect(selected.attributes('aria-posinset')).toBe('21')

    wrapper.unmount()
  })

  it('turns with the wheel and lands on a row', async () => {
    vi.useFakeTimers()
    const wrapper = mountWheel()
    await flushPromises()
    const wheel = wrapper.find('.tx-picker__wheel')

    // Two rows' worth of wheel travel at the default 36px row height.
    await wheel.trigger('wheel', { deltaY: 72 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v22']])

    // A partial turn settles onto the nearest row rather than resting between two.
    await wheel.trigger('wheel', { deltaY: 20 })
    vi.advanceTimersByTime(160)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('drags with the pointer and keeps the value in step', async () => {
    const wrapper = mountWheel()
    await flushPromises()
    const wheel = wrapper.find('.tx-picker__wheel')

    await wheel.trigger('pointerdown', { pointerId: 1, clientY: 200 })
    // Dragging up by three rows moves three rows down the column.
    await wheel.trigger('pointermove', { pointerId: 1, clientY: 92 })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])

    wrapper.unmount()
  })

  it('reads the row under a click out of the drum geometry', async () => {
    const wrapper = mountWheel()
    await flushPromises()
    const wheel = wrapper.find('.tx-picker__wheel')

    // The rows are inert; the column hit-tests against what it drew. jsdom
    // reports a zero-sized rect, so a click at the centre resolves to the
    // centre row and the value holds.
    await wheel.trigger('click', { clientY: 0 })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps the rows out of hit testing so the centre one cannot swallow clicks', () => {
    // The drum's predecessor rotated rows that were still clickable where they
    // were laid out: the enlarged centre row covered its neighbours.
    const itemRule = pickerSource.slice(pickerSource.indexOf('.tx-picker__item {'))
    const body = itemRule.slice(0, itemRule.indexOf('&.is-selected'))

    expect(body).toContain('pointer-events: none')
    expect(body).toContain('position: absolute')
    // Stacked on the centre line, so a rotation has no layout offset to fight.
    expect(body).toContain('top: 50%')
    expect(body).toMatch(/rotateX\([\s\S]*translateZ\(/)

    const wheelRule = pickerSource.slice(pickerSource.indexOf('.tx-picker__wheel {'))
    expect(wheelRule.slice(0, wheelRule.indexOf('&:active'))).toContain('touch-action: none')
  })
})
