import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxScroll from '../src/TxScroll.vue'

function defineReadonlyNumber(target: HTMLElement, key: string, value: number) {
  Object.defineProperty(target, key, {
    configurable: true,
    value,
  })
}

function touchEvent(type: string, y: number, field: 'touches' | 'changedTouches') {
  const event = new Event(type) as Event & {
    touches?: Array<{ clientY: number }>
    changedTouches?: Array<{ clientY: number }>
  } & Record<typeof field, Array<{ clientY: number }>>
  Object.defineProperty(event, field, {
    configurable: true,
    value: [{ clientY: y }],
  })
  return event
}

describe('txScroll', () => {
  it('renders native mode with directional overflow, no padding, and slots', () => {
    const wrapper = mount(TxScroll, {
      props: {
        native: true,
        direction: 'both',
        noPadding: true,
        scrollChaining: true,
      },
      slots: {
        header: '<div>Header</div>',
        default: '<p>Content</p>',
        footer: '<div>Footer</div>',
      },
    })

    expect(wrapper.classes()).toContain('is-native')
    expect(wrapper.text()).toContain('Header')
    expect(wrapper.text()).toContain('Content')
    expect(wrapper.text()).toContain('Footer')

    const native = wrapper.find('.tx-scroll__native')
    expect(native.attributes('style')).toContain('overflow-y: auto')
    expect(native.attributes('style')).toContain('overflow-x: auto')
    expect(native.attributes('style')).toContain('overscroll-behavior-y: auto')
    expect(native.attributes('style')).toContain('overscroll-behavior-x: auto')
    expect(wrapper.find('.tx-scroll__content').attributes('style')).toContain('padding: 0px')
    expect(wrapper.find('.tx-scroll__content').attributes('style')).toContain('width: max-content')
  })

  it('emits native scroll position and exposes getScrollInfo/scrollTo', async () => {
    const wrapper = mount(TxScroll, {
      props: {
        native: true,
      },
    })

    const native = wrapper.find('.tx-scroll__native').element as HTMLElement
    native.scrollTop = 24
    native.scrollLeft = 8
    defineReadonlyNumber(native, 'scrollHeight', 400)
    defineReadonlyNumber(native, 'scrollWidth', 300)
    defineReadonlyNumber(native, 'clientHeight', 120)
    defineReadonlyNumber(native, 'clientWidth', 100)

    await wrapper.find('.tx-scroll__native').trigger('scroll')
    expect(wrapper.emitted('scroll')?.[0][0]).toEqual({ scrollTop: 24, scrollLeft: 8 })

    expect(wrapper.vm.getScrollInfo()).toEqual({
      scrollTop: 24,
      scrollLeft: 8,
      scrollHeight: 400,
      scrollWidth: 300,
      clientHeight: 120,
      clientWidth: 100,
    })

    const calls: Array<[number, number]> = []
    native.scrollTo = (x: number, y: number) => calls.push([x, y])
    wrapper.vm.scrollTo(32, 48)
    expect(calls).toEqual([[32, 48]])
  })

  it('emits native pull-up once until finishPullUp resets it', async () => {
    const wrapper = mount(TxScroll, {
      props: {
        native: true,
        pullUpLoad: true,
        pullUpThreshold: 20,
      },
    })

    const native = wrapper.find('.tx-scroll__native').element as HTMLElement
    native.scrollTop = 80
    defineReadonlyNumber(native, 'scrollHeight', 200)
    defineReadonlyNumber(native, 'clientHeight', 100)

    await wrapper.find('.tx-scroll__native').trigger('scroll')
    await wrapper.find('.tx-scroll__native').trigger('scroll')
    expect(wrapper.emitted('pulling-up')).toHaveLength(1)

    wrapper.vm.finishPullUp()
    await wrapper.find('.tx-scroll__native').trigger('scroll')
    expect(wrapper.emitted('pulling-up')).toHaveLength(2)
  })

  it('emits native pull-down once until finishPullDown resets it', async () => {
    const wrapper = mount(TxScroll, {
      props: {
        native: true,
        pullDownRefresh: true,
        pullDownThreshold: 40,
      },
    })

    const native = wrapper.find('.tx-scroll__native').element as HTMLElement
    native.scrollTop = 0

    const start = touchEvent('touchstart', 10, 'touches')
    native.dispatchEvent(start)
    await nextTick()

    const end = touchEvent('touchend', 60, 'changedTouches')
    native.dispatchEvent(end)
    await nextTick()
    native.dispatchEvent(touchEvent('touchend', 60, 'changedTouches'))
    await nextTick()
    expect(wrapper.emitted('pulling-down')).toHaveLength(1)

    wrapper.vm.finishPullDown()
    const nextStart = touchEvent('touchstart', 10, 'touches')
    native.dispatchEvent(nextStart)
    await nextTick()
    native.dispatchEvent(touchEvent('touchend', 60, 'changedTouches'))
    await nextTick()
    expect(wrapper.emitted('pulling-down')).toHaveLength(2)
  })
})
