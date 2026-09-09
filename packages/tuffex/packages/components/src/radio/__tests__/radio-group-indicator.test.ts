import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import TxRadio from '../src/TxRadio.vue'
import TxRadioGroup from '../src/TxRadioGroup.vue'

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) } as DOMRect
}

/**
 * The indicator is absolutely positioned inside the group's padding box, but
 * its target is measured from `getBoundingClientRect`, a border box. The
 * group's 1px border therefore has to come off the measurement, or the
 * indicator lands 1px down and right of the button it covers — which is how
 * it shipped until 2026-09-06.
 */
describe('txRadioGroup indicator placement', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('measures the checked button from inside the group border', async () => {
    const wrapper = mount(TxRadioGroup, {
      props: { modelValue: 'week', type: 'button' },
      slots: {
        default: () => [
          h(TxRadio, { value: 'day', label: 'Day' }),
          h(TxRadio, { value: 'week', label: 'Week' }),
        ],
      },
    })

    // Group border box at (100, 50), 1px border on every side.
    const root = wrapper.element as HTMLElement
    root.getBoundingClientRect = () => domRect(100, 50, 180, 36)
    Object.defineProperty(root, 'clientLeft', { value: 1 })
    Object.defineProperty(root, 'clientTop', { value: 1 })
    // The checked button, 55px in from the padding-box origin and 3px down (the group's padding).
    const checked = wrapper.find('.tx-radio.is-checked').element as HTMLElement
    checked.getBoundingClientRect = () => domRect(156, 54, 55, 28)

    // onMounted queues the measurement on the next frame.
    await nextTick()
    vi.advanceTimersByTime(32)
    await nextTick()

    const style = wrapper.find('.tx-radio-group__indicator-plain').attributes('style') ?? ''
    // 156 − 100 − 1 = 55, 54 − 50 − 1 = 3: the border is not part of the offset.
    expect(style).toMatch(/translate3d\(55px, 3px, 0\)/)
    expect(style).toContain('width: 55px')
    expect(style).toContain('height: 28px')

    wrapper.unmount()
  })
})
