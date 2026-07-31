import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('txPicker', () => {
  // jsdom does not implement Element.prototype.scrollTo (calling it throws), so
  // shim it here — mirroring how scroll.test.ts stubs ResizeObserver / rAF —
  // and record the target offset so mount-time scroll positioning is observable.
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = function scrollToShim(this: HTMLElement, options?: ScrollToOptions | number) {
      if (options && typeof options === 'object' && typeof options.top === 'number')
        this.scrollTop = options.top
    } as HTMLElement['scrollTo']
  })

  afterEach(() => {
    // @ts-expect-error remove the shim so it never leaks past this file
    delete HTMLElement.prototype.scrollTo
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

  it('sizes the inline track to visibleItemCount rows via the CSS variable', () => {
    const wrapper = mountInlinePicker({
      visibleItemCount: 7,
    })

    const style = wrapper.find('.tx-picker__columns').attributes('style')

    // The track height is `calc(item-height * var(--tx-picker-visible-count, 5))`;
    // inline mode must publish the variable too, not fall back to the default 5.
    expect(style).toContain('--tx-picker-visible-count: 7')
  })

  it('scrolls each inline column to its active option on mount', async () => {
    const wrapper = mountInlinePicker({
      modelValue: ['b', 2],
    })

    await flushPromises()

    const scrollers = wrapper.findAll('.tx-picker__scroller')
    // itemHeight defaults to 36; 'b' is index 1 in column 0 and 2 is index 1 in
    // column 1, so both scrollers land one row (36px) down without user input.
    expect((scrollers[0]!.element as HTMLElement).scrollTop).toBe(36)
    expect((scrollers[1]!.element as HTMLElement).scrollTop).toBe(36)
  })

  it('does not emit while scrolling when disabled', async () => {
    // Run the queued frame synchronously so the (guarded) settle path would emit
    // if the disabled check were missing.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })

    const wrapper = mountInlinePicker({
      disabled: true,
      modelValue: ['b', 2],
    })

    await flushPromises()

    const scroller = wrapper.findAll('.tx-picker__scroller')[0]!
    ;(scroller.element as HTMLElement).scrollTop = 36
    await scroller.trigger('scroll')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})

describe('txPicker keyboard a11y', () => {
  // Same scrollTo shim as above: the keyboard path calls scrollToIndex to keep the
  // chosen option centered, which would otherwise throw in jsdom.
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = function scrollToShim(this: HTMLElement, options?: ScrollToOptions | number) {
      if (options && typeof options === 'object' && typeof options.top === 'number')
        this.scrollTop = options.top
    } as HTMLElement['scrollTo']
  })

  afterEach(() => {
    // @ts-expect-error remove the shim so it never leaks past this file
    delete HTMLElement.prototype.scrollTo
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

    const scroller = wrapper.findAll('.tx-picker__scroller')[0]!
    // The listbox is the single tab stop; its options are pulled out of the tab
    // sequence so focus stays put and aria-activedescendant conveys position.
    expect(scroller.attributes('role')).toBe('listbox')
    expect(scroller.attributes('tabindex')).toBe('0')

    const options = wrapper.findAll('.tx-picker__item')
    expect(options.every(o => o.attributes('role') === 'option')).toBe(true)
    expect(options.every(o => o.attributes('tabindex') === '-1')).toBe(true)

    const selectedInFirstCol = wrapper.findAll('.tx-picker__col')[0]!.find('.tx-picker__item.is-selected')
    expect(selectedInFirstCol.attributes('aria-selected')).toBe('true')
    expect(scroller.attributes('aria-activedescendant')).toBe(selectedInFirstCol.attributes('id'))
  })

  it('moves the selection with ArrowUp/ArrowDown and prevents page scrolling', async () => {
    const wrapper = mountInlinePicker({ modelValue: ['b', 2] })
    await flushPromises()

    const numberCol = wrapper.findAll('.tx-picker__scroller')[1]!.element

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
    keydown(wrapper.find('.tx-picker__scroller').element, 'ArrowDown')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['r']])
  })

  it('jumps to the first/last enabled option with Home/End', async () => {
    const wrapper = mountInlinePicker({ modelValue: ['b', 1] })
    await flushPromises()

    // Home in column 0 must consume the key even though the disabled 'a' leaves
    // 'b' as the first enabled option (already selected, so no value change).
    const home = keydown(wrapper.findAll('.tx-picker__scroller')[0]!.element, 'Home')
    await nextTick()
    expect(home.defaultPrevented).toBe(true)

    // End in the number column jumps from 1 to the last option 2.
    keydown(wrapper.findAll('.tx-picker__scroller')[1]!.element, 'End')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b', 2]])
  })

  it('ignores arrow keys and leaves the tab order when disabled', async () => {
    const wrapper = mountInlinePicker({ disabled: true, modelValue: ['b', 2] })
    await flushPromises()

    const numberCol = wrapper.findAll('.tx-picker__scroller')[1]!
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

    const scroller = document.body.querySelector('.tx-picker-popup .tx-picker__scroller')
    expect(scroller?.getAttribute('role')).toBe('listbox')
    expect(scroller?.getAttribute('tabindex')).toBe('0')

    const option = document.body.querySelector('.tx-picker-popup .tx-picker__item')
    expect(option?.getAttribute('role')).toBe('option')
    expect(option?.getAttribute('tabindex')).toBe('-1')

    wrapper.unmount()
  })
})
