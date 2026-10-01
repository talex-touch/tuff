import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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

const many = [{
  key: 'c',
  options: Array.from({ length: 40 }).map((_, i) => ({ value: `v${i}`, label: `O${i}` })),
}]

function mountWheel(props: Record<string, unknown> = {}) {
  return mount(TxPicker, { props: { popup: false, columns: many, modelValue: ['v20'], ...props } })
}

/** A controlled parent: it echoes every value the picker emits straight back through v-model. */
function mountControlledWheel(props: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(TxPicker, {
    props: {
      popup: false,
      columns: many,
      modelValue: ['v20'],
      'onUpdate:modelValue': (v: unknown) => wrapper.setProps({ modelValue: v as string[] }),
      ...props,
    },
  })
  return wrapper as VueWrapper
}

/** The column's position in rows — the one number the drum is drawn from. */
function offsetOf(wrapper: VueWrapper): string {
  return (wrapper.find('.tx-picker__wheel').element as HTMLElement).style.getPropertyValue('--tx-picker-offset')
}

// jsdom lays nothing out, so a column reports a zero-sized box and every click
// would land on its centre line. This is the column's real box: 320x180 with its
// centre line at y = 190.
function stubWheelRect(el: Element): void {
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 100,
    top: 100,
    left: 0,
    right: 320,
    bottom: 280,
    width: 320,
    height: 180,
    toJSON: () => ({}),
  }) as DOMRect
}

/** Runs `body` with `prefers-reduced-motion: reduce` reporting `matches`, then restores the stub. */
async function withReducedMotion(matches: boolean, body: () => Promise<void>): Promise<void> {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia

  try {
    await body()
  }
  finally {
    window.matchMedia = original
  }
}

/**
 * Dispatches a pointer event carrying a chosen `timeStamp`. VTU's `trigger`
 * stamps with `Date.now()`, which cannot express a gesture's speed — and the
 * speed is what a release coasts on and reduced motion must ignore.
 */
function pointerAt(el: Element, type: string, clientY: number, timeStamp: number): void {
  const event = new Event(type, { bubbles: true }) as Event & { clientY: number, pointerId: number }
  event.clientY = clientY
  event.pointerId = 1
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  el.dispatchEvent(event)
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
  it('draws only the rows in front of the drum\'s rim, not the whole column', async () => {
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

  it('selects the row a click lands on, above and below the centre line', async () => {
    // The column's box is stubbed to 320x180 (centre line y = 190), so these are
    // the screen points the rows are drawn at: ~±35px and ~±63px either side of
    // the highlight are the centres of the rows one, two and three out.
    const cases = [
      { name: 'one row below the highlight', clientY: 225, expected: ['v21'] },
      { name: 'two rows below the highlight', clientY: 253, expected: ['v22'] },
      { name: 'three rows below the highlight', clientY: 272, expected: ['v23'] },
      { name: 'one row above the highlight', clientY: 155, expected: ['v19'] },
      { name: 'two rows above the highlight', clientY: 127, expected: ['v18'] },
      { name: 'three rows above the highlight', clientY: 108, expected: ['v17'] },
    ]

    for (const { name, clientY, expected } of cases) {
      const wrapper = mountWheel()
      await flushPromises()
      stubWheelRect(wrapper.find('.tx-picker__wheel').element)

      await wrapper.find('.tx-picker__wheel').trigger('click', { clientY })

      expect(wrapper.emitted('update:modelValue')?.at(-1), name).toEqual([expected])
      wrapper.unmount()
    }
  })

  it('reads a tap out of the drum geometry like a plain click', async () => {
    const wrapper = mountWheel()
    await flushPromises()
    stubWheelRect(wrapper.find('.tx-picker__wheel').element)

    // A tap is a pointerdown/pointerup that never moved: it must resolve the same
    // row the click path does instead of landing dead.
    await wrapper.find('.tx-picker__wheel').trigger('pointerdown', { pointerId: 1, clientY: 272 })
    await wrapper.find('.tx-picker__wheel').trigger('pointerup', { pointerId: 1, clientY: 272 })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])
    wrapper.unmount()
  })

  it('ignores a click on a disabled column', async () => {
    const wrapper = mountWheel({ disabled: true })
    await flushPromises()
    stubWheelRect(wrapper.find('.tx-picker__wheel').element)

    await wrapper.find('.tx-picker__wheel').trigger('click', { clientY: 272 })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('lands a click past the drum\'s rim on the row at its edge', async () => {
    // y = 280 is the column's bottom edge and y = 100 its top: both points are
    // off the drum, so the projection has to saturate at the rim row rather than
    // resolve to nothing.
    const cases = [
      { name: 'below the rim', clientY: 280, expected: ['v24'] },
      { name: 'above the rim', clientY: 100, expected: ['v16'] },
    ]

    for (const { name, clientY, expected } of cases) {
      const wrapper = mountWheel()
      await flushPromises()
      stubWheelRect(wrapper.find('.tx-picker__wheel').element)

      await wrapper.find('.tx-picker__wheel').trigger('click', { clientY })

      expect(wrapper.emitted('update:modelValue')?.at(-1), name).toEqual([expected])
      wrapper.unmount()
    }
  })

  it('skips a disabled row a click lands on, landing on the nearest enabled one', async () => {
    const edgeColumns = [{
      key: 'c',
      options: [
        { value: 'v20', label: 'O20' },
        { value: 'v21', label: 'O21' },
        { value: 'v22', label: 'O22', disabled: true },
        { value: 'v23', label: 'O23' },
      ],
    }]
    const wrapper = mount(TxPicker, { props: { popup: false, columns: edgeColumns, modelValue: ['v20'] } })
    await flushPromises()
    stubWheelRect(wrapper.find('.tx-picker__wheel').element)

    // The point two rows below the highlight is the disabled row: the click must
    // settle on an enabled neighbour instead of leaving the value where it was.
    await wrapper.find('.tx-picker__wheel').trigger('click', { clientY: 253 })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])
    wrapper.unmount()
  })

  it('keeps the halfway position a drag reached when a controlled parent echoes its row', async () => {
    const wrapper = mountControlledWheel()
    await flushPromises()

    await wrapper.find('.tx-picker__wheel').trigger('pointerdown', { pointerId: 1, clientY: 200 })
    // Two and a half rows up: v23 is under the line, but the drum has only made
    // half of the last row.
    await wrapper.find('.tx-picker__wheel').trigger('pointermove', { pointerId: 1, clientY: 110 })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])

    // The parent's echo re-enters through modelValue while the drag is still live;
    // re-placing the column there would snap the drum to the row under the finger.
    await flushPromises()
    expect(offsetOf(wrapper)).toBe('22.5')

    wrapper.unmount()
  })

  it('still places the column on a new value from the parent mid-drag', async () => {
    const wrapper = mountControlledWheel()
    await flushPromises()

    await wrapper.find('.tx-picker__wheel').trigger('pointerdown', { pointerId: 1, clientY: 200 })
    await wrapper.find('.tx-picker__wheel').trigger('pointermove', { pointerId: 1, clientY: 110 })
    await flushPromises()
    expect(offsetOf(wrapper)).toBe('22.5')

    // A value the drag did not produce is the parent moving the selection: the
    // drum has to follow it, not cling to the finger.
    await wrapper.setProps({ modelValue: ['v25'] })
    await flushPromises()

    expect(offsetOf(wrapper)).toBe('25')
    wrapper.unmount()
  })

  it('retargets a click turn when a controlled parent moves the selection mid-flight', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
    try {
      const wrapper = mountControlledWheel()
      await flushPromises()
      stubWheelRect(wrapper.find('.tx-picker__wheel').element)

      await wrapper.find('.tx-picker__wheel').trigger('click', { clientY: 272 })
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])

      // The parent rejects v23 and sets v30 while the drum is still easing there:
      // an external value outranks the turn in flight, which must let it through.
      await wrapper.setProps({ modelValue: ['v30'] })
      await nextTick()
      await nextTick()

      vi.advanceTimersByTime(2000)
      await nextTick()
      expect(offsetOf(wrapper)).toBe('30')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('coasts a flick past the rows it dragged through', async () => {
    const wrapper = mountWheel()
    await flushPromises()
    const wheel = wrapper.find('.tx-picker__wheel').element

    // Two rows of one-per-16ms travel, released still moving: the drum has to
    // carry on past the row under the finger instead of stopping dead on it.
    pointerAt(wheel, 'pointerdown', 100, 0)
    pointerAt(wheel, 'pointermove', 64, 16)
    pointerAt(wheel, 'pointermove', 28, 32)
    pointerAt(wheel, 'pointerup', 28, 48)

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v38']])
    wrapper.unmount()
  })

  it('drops the coast under prefers-reduced-motion', async () => {
    await withReducedMotion(true, async () => {
      const wrapper = mountWheel()
      await flushPromises()
      const wheel = wrapper.find('.tx-picker__wheel').element

      // The same flick, released at the same speed: with reduced motion the drum
      // stays where the finger left it rather than coasting rows away.
      pointerAt(wheel, 'pointerdown', 100, 0)
      pointerAt(wheel, 'pointermove', 64, 16)
      pointerAt(wheel, 'pointermove', 28, 32)
      pointerAt(wheel, 'pointerup', 28, 48)

      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v22']])
      wrapper.unmount()
    })
  })

  it('finishes a click turn while a controlled parent echoes each step', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
    try {
      const wrapper = mountControlledWheel()
      await flushPromises()
      stubWheelRect(wrapper.find('.tx-picker__wheel').element)

      await wrapper.find('.tx-picker__wheel').trigger('click', { clientY: 272 })
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['v23']])

      // Let the parent's echo travel all the way back through v-model first: it
      // must leave the turn alone rather than re-place the column on its row.
      await nextTick()
      await nextTick()

      // The turn is an animation: mid-flight the drum is between rows even though
      // the echoed value already says v23.
      vi.advanceTimersByTime(16)
      await nextTick()
      const midFlight = Math.abs(Number(offsetOf(wrapper)) - 23)
      expect(midFlight).toBeGreaterThan(0)
      expect(midFlight).toBeLessThan(3)

      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(offsetOf(wrapper)).toBe('23')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('lands a click turn on the row at once under prefers-reduced-motion', async () => {
    await withReducedMotion(true, async () => {
      const wrapper = mountControlledWheel()
      await flushPromises()
      stubWheelRect(wrapper.find('.tx-picker__wheel').element)

      await wrapper.find('.tx-picker__wheel').trigger('click', { clientY: 272 })

      // No tween to sit through and nothing to sit between: the drum is on its
      // row with the value.
      expect(offsetOf(wrapper)).toBe('23')
      wrapper.unmount()
    })
  })
})
