// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_MOTION } from './composer-motion'
import { type ComposerPress, useComposerPress } from './useComposerPress'

interface AnimateCall {
  target: Element
  keyframes: Record<string, unknown>[]
  options: KeyframeAnimationOptions
  animation: { cancel: ReturnType<typeof vi.fn> }
}

let calls: AnimateCall[] = []
let reduced = false
/** What `getComputedStyle(el).scale` reads; jsdom computes no individual transforms. */
let computedScale = ''

beforeEach(() => {
  calls = []
  reduced = false
  computedScale = ''
  vi.useFakeTimers()
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const animation = { cancel: vi.fn() }
    calls.push({
      target: this,
      keyframes: keyframes as Record<string, unknown>[],
      options: options as KeyframeAnimationOptions,
      animation
    })
    return animation as unknown as Animation
  }
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query
  })) as unknown as typeof window.matchMedia
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = real(element)
    return new Proxy(style, {
      get: (target, key) => (key === 'scale' ? computedScale : Reflect.get(target, key))
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error jsdom ships no WAAPI; the stub is removed again.
  delete Element.prototype.animate
})

function mountPress(options: Parameters<typeof useComposerPress>[1] = {}) {
  let api!: ComposerPress
  const wrapper = mount(
    defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null)
        api = useComposerPress(el, options)
        return () => h('button', { ref: el, type: 'button' }, 'x')
      }
    }),
    { attachTo: document.body }
  )
  return { wrapper, api: () => api, button: wrapper.get('button').element as HTMLButtonElement }
}

function pointer(el: Element, type: string): void {
  const event = new Event(type, { bubbles: true }) as Event & { button: number; isPrimary: boolean }
  Object.assign(event, { button: 0, isPrimary: true })
  el.dispatchEvent(event)
}

describe('useComposerPress', () => {
  it('presses on the pointer with the individual scale property, held until release', async () => {
    const { button, wrapper } = mountPress({ scale: 0.86 })
    await wrapper.vm.$nextTick()
    pointer(button, 'pointerdown')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.keyframes).toEqual([{ scale: 1 }, { scale: 0.86 }])
    expect(calls[0]!.options).toMatchObject({
      duration: COMPOSER_MOTION.press.inMs,
      easing: COMPOSER_MOTION.press.inEasing,
      fill: 'forwards'
    })

    // Released from where the press holds it, on the release spring, back to rest.
    computedScale = '0.86'
    pointer(button, 'pointerup')
    expect(calls[0]!.animation.cancel).toHaveBeenCalled()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.keyframes).toEqual([{ scale: 0.86 }, { scale: 1 }])
    expect(calls[1]!.options.fill).toBeUndefined()
    wrapper.unmount()
  })

  it('presses from the keyboard too, and a key repeat does not press again', async () => {
    const { button, wrapper } = mountPress()
    await wrapper.vm.$nextTick()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.keyframes.at(-1)).toEqual({ scale: COMPOSER_MOTION.press.scale })
    wrapper.unmount()
  })

  it('reads a getter depth at press time', async () => {
    let capsule = false
    const { button, wrapper } = mountPress({ scale: () => (capsule ? 0.95 : 0.86) })
    await wrapper.vm.$nextTick()
    capsule = true
    pointer(button, 'pointerdown')
    expect(calls[0]!.keyframes.at(-1)).toEqual({ scale: 0.95 })
    wrapper.unmount()
  })

  it('pulses a programmatic press: in over pulseMs, then the release spring', async () => {
    const { api, wrapper } = mountPress({ scale: 0.86 })
    await wrapper.vm.$nextTick()
    api().pulse()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.options.duration).toBe(COMPOSER_MOTION.press.pulseMs)
    expect(api().pressedRecently()).toBe(true)

    computedScale = '0.86'
    vi.advanceTimersByTime(COMPOSER_MOTION.press.pulseMs)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.keyframes).toEqual([{ scale: 0.86 }, { scale: 1 }])
    wrapper.unmount()
  })

  it('does not press a disabled control', async () => {
    const { button, wrapper } = mountPress({ disabled: () => true })
    await wrapper.vm.$nextTick()
    pointer(button, 'pointerdown')
    pointer(button, 'pointerup')
    expect(calls).toHaveLength(0)
    wrapper.unmount()
  })

  it('never calls animate under reduced motion', async () => {
    reduced = true
    const { button, api, wrapper } = mountPress()
    await wrapper.vm.$nextTick()
    pointer(button, 'pointerdown')
    computedScale = '0.9'
    pointer(button, 'pointerup')
    api().pulse()
    vi.runAllTimers()
    expect(calls).toHaveLength(0)
    wrapper.unmount()
  })

  it('stops listening once unmounted', async () => {
    const { button, wrapper } = mountPress()
    await wrapper.vm.$nextTick()
    wrapper.unmount()
    pointer(button, 'pointerdown')
    expect(calls).toHaveLength(0)
  })
})
