import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import TxSlider from '../src/TxSlider.vue'

/** Browser boundaries only: the slider, its springs and Vue rendering are real. */
class MotionPreference extends EventTarget {
  matches = false
  readonly media = '(prefers-reduced-motion: reduce)'
  onchange: ((event: Event) => void) | null = null

  addListener(listener: EventListener) {
    this.addEventListener('change', listener)
  }

  removeListener(listener: EventListener) {
    this.removeEventListener('change', listener)
  }

  setReduced(matches: boolean) {
    this.matches = matches
    const event = Object.assign(new Event('change'), { matches, media: this.media })
    this.dispatchEvent(event)
    this.onchange?.(event)
  }
}

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = []
  readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  /** Retain a delivery already queued before disconnect, like the browser can. */
  queuedDelivery() {
    const entries = [...this.targets].map(target => ({ target }) as ResizeObserverEntry)
    return () => this.callback(entries, this as unknown as ResizeObserver)
  }
}

function queuedResizeDeliveries() {
  return ControlledResizeObserver.instances
    .filter(observer => observer.targets.size > 0)
    .map(observer => observer.queuedDelivery())
}

function pointer(target: EventTarget, type: string, clientX: number) {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX }))
}

function surface(wrapper: VueWrapper) {
  return wrapper.find('.tx-slider__surface').element as HTMLElement
}

function scale(element: HTMLElement) {
  const match = element.style.transform.match(/scale\(([\d.]+), ([\d.]+)\)/)
  return match ? [Number(match[1]), Number(match[2])] : null
}

function setMetrics(wrapper: VueWrapper) {
  let width = 200
  const main = wrapper.find('.tx-slider__main').element as HTMLElement
  main.style.setProperty('--tx-slider-thumb-size', '20px')
  main.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 28,
    width,
    height: 28,
    toJSON: () => ({}),
  } as DOMRect)
  queuedResizeDeliveries().forEach(deliver => deliver())
  return (next: number) => { width = next }
}

describe('txSlider suspended motion lifecycle', () => {
  const mounted: { unmount: () => void }[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  let preference: MotionPreference
  let originalResizeObserver: typeof ResizeObserver

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    frames.clear()
    nextFrame = 0
    preference = new MotionPreference()
    vi.spyOn(window, 'matchMedia').mockImplementation(query => query === preference.media
      ? preference as unknown as MediaQueryList
      : new MotionPreference() as unknown as MediaQueryList)
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrame
      frames.set(id, callback)
      return id
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    originalResizeObserver = globalThis.ResizeObserver
    ControlledResizeObserver.instances = []
    globalThis.ResizeObserver = ControlledResizeObserver as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    // Dispose consumers while their browser boundaries are still installed.
    mounted.splice(0).reverse().forEach(wrapper => wrapper.unmount())
    frames.clear()
    globalThis.ResizeObserver = originalResizeObserver
    ControlledResizeObserver.instances = []
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function advanceFrames(count: number) {
    for (let index = 0; index < count; index++) {
      vi.advanceTimersByTime(16)
      const due = [...frames.entries()]
      for (const [id, callback] of due) {
        // A preceding callback may cancel another job in the same browser frame.
        if (!frames.delete(id))
          continue
        callback(performance.now())
      }
      await nextTick()
    }
  }

  function slider(tooltipTilt = false) {
    const wrapper = mount(TxSlider, {
      props: {
        active: true,
        modelValue: 40,
        min: 0,
        max: 100,
        thumbSurface: true,
        showValue: true,
        showTooltip: tooltipTilt,
        tooltipTrigger: 'always',
        tooltipTilt,
        tooltipMotion: 'none',
      },
    })
    mounted.push(wrapper)
    return wrapper
  }

  async function grab(wrapper: VueWrapper) {
    pointer(wrapper.find('input').element, 'pointerdown', 30)
    await nextTick()
    await advanceFrames(3)
    pointer(window, 'pointermove', 90)
    await advanceFrames(3)
    const deformation = scale(surface(wrapper))
    expect(deformation).not.toBeNull()
    expect(deformation![1]).toBeGreaterThan(1)
  }

  it('active=false ends a held gesture, rejects stale work and still accepts native value events', async () => {
    const wrapper = slider(true)
    const changeWidth = setMetrics(wrapper)
    const main = wrapper.find('.tx-slider__main').element as HTMLElement
    const previousWidth = main.getBoundingClientRect().width
    await grab(wrapper)
    const staleFrames = [...frames.values()]
    const staleResizes = queuedResizeDeliveries()

    await wrapper.setProps({ active: false })
    expect(surface(wrapper).style.transform).toBe('')
    expect(wrapper.classes()).not.toContain('is-dragging')
    expect(frames.size).toBe(0)

    changeWidth(400)
    const parkedLeft = surface(wrapper).style.left
    staleResizes.forEach(deliver => deliver())
    staleFrames.forEach(callback => callback(performance.now()))
    pointer(window, 'pointermove', 180)
    pointer(window, 'pointerup', 180)
    await advanceFrames(6)
    expect(surface(wrapper).style.left).toBe(parkedLeft)
    expect(surface(wrapper).style.transform).toBe('')
    expect(frames.size).toBe(0)

    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).disabled).toBe(false)
    await input.setValue('65')
    expect(wrapper.find('.tx-slider__value').text()).toBe('65')
    expect(wrapper.emitted('update:modelValue')).toEqual([[65]])
    expect(wrapper.emitted('change')).toEqual([[65]])
    expect(frames.size).toBe(0)
    const pausedValueLeft = Number.parseFloat(surface(wrapper).style.left)
    const range = input.element as HTMLInputElement
    const valueFraction = (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min))

    await wrapper.setProps({ active: true })
    await nextTick()
    expect(surface(wrapper).style.transform).toBe('')
    // At the same native value, re-entry must apply the box's actual width change.
    const widthChange = main.getBoundingClientRect().width - previousWidth
    expect(Number.parseFloat(surface(wrapper).style.left) - pausedValueLeft)
      .toBeCloseTo(widthChange * valueFraction)
    await grab(wrapper)
  })

  it('removing the thumb surface while held cannot leave a hidden spring running or revive it on return', async () => {
    const wrapper = slider()
    setMetrics(wrapper)
    await grab(wrapper)
    const staleFrames = [...frames.values()]

    await wrapper.setProps({ thumbSurface: false })
    expect(wrapper.find('.tx-slider__surface').exists()).toBe(false)
    expect(frames.size).toBe(0)
    staleFrames.forEach(callback => callback(performance.now()))
    pointer(window, 'pointerup', 90)
    await advanceFrames(6)
    expect(frames.size).toBe(0)

    await wrapper.setProps({ thumbSurface: true })
    expect(surface(wrapper).style.transform).toBe('')
    await advanceFrames(3)
    expect(surface(wrapper).style.transform).toBe('')
    await grab(wrapper)
  })

  it('a live reduced-motion change neutralizes thumb and tooltip deformation without disabling the range', async () => {
    const wrapper = slider(true)
    setMetrics(wrapper)
    await grab(wrapper)
    const tooltip = wrapper.find('.tx-slider__tooltip').element as HTMLElement
    expect(tooltip.style.transform).not.toContain('rotate(0deg)')
    const staleFrames = [...frames.values()]

    preference.setReduced(true)
    await nextTick()
    expect(surface(wrapper).style.transform).toBe('')
    expect(tooltip.style.transform).toContain('rotate(0deg)')
    expect(tooltip.style.transform).toContain('skewX(0deg) scaleX(1) scaleY(1)')
    expect(frames.size).toBe(0)

    staleFrames.forEach(callback => callback(performance.now()))
    pointer(window, 'pointermove', 180)
    await wrapper.find('input').setValue('72')
    await advanceFrames(6)
    expect(wrapper.find('.tx-slider__value').text()).toBe('72')
    expect(wrapper.emitted('update:modelValue')).toEqual([[72]])
    expect(wrapper.emitted('change')).toEqual([[72]])
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(false)
    expect(surface(wrapper).style.transform).toBe('')
    expect(frames.size).toBe(0)

    pointer(window, 'pointerup', 180)
    preference.setReduced(false)
    await nextTick()
    expect(surface(wrapper).style.transform).toBe('')
    await grab(wrapper)
  })

  it('KeepAlive deactivation parks cached output and repeated activation or remount does not accelerate a new gesture', async () => {
    const present = ref(true)
    const host = mount(defineComponent({
      setup: () => () => h(KeepAlive, null, {
        default: () => present.value
          ? h(TxSlider, {
              active: true,
              modelValue: 40,
              thumbSurface: true,
              showTooltip: false,
            })
          : null,
      }),
    }))
    mounted.push(host)
    const cached = host.findComponent(TxSlider)
    const changeWidth = setMetrics(cached)
    await nextTick()

    async function gestureTrajectory(wrapper: VueWrapper) {
      pointer(wrapper.find('input').element, 'pointerdown', 30)
      await nextTick()
      const trajectory: string[] = []
      for (let index = 0; index < 5; index++) {
        await advanceFrames(1)
        trajectory.push(surface(wrapper).style.transform)
      }
      expect(scale(surface(wrapper))![0]).toBeGreaterThan(1)
      return trajectory
    }

    const initial = await gestureTrajectory(cached)
    for (let cycle = 0; cycle < 3; cycle++) {
      const parkedSurface = surface(cached)
      const staleFrames = [...frames.values()]
      const staleResizes = queuedResizeDeliveries()
      present.value = false
      await nextTick()
      expect(parkedSurface.style.transform).toBe('')
      expect(frames.size).toBe(0)

      const parkedLeft = parkedSurface.style.left
      changeWidth(400)
      staleResizes.forEach(deliver => deliver())
      staleFrames.forEach(callback => callback(performance.now()))
      pointer(window, 'pointermove', 180)
      pointer(window, 'pointerup', 180)
      await advanceFrames(3)
      expect(parkedSurface.style.left).toBe(parkedLeft)
      expect(parkedSurface.style.transform).toBe('')
      expect(frames.size).toBe(0)

      changeWidth(200)
      present.value = true
      await nextTick()
      expect(surface(cached).style.transform).toBe('')
      expect(await gestureTrajectory(cached)).toEqual(initial)
    }

    const discardedSurface = surface(cached)
    host.unmount()
    mounted.splice(mounted.indexOf(host), 1)
    const discardedStyle = discardedSurface.getAttribute('style')
    pointer(window, 'pointerup', 90)
    await advanceFrames(3)
    expect(discardedSurface.getAttribute('style')).toBe(discardedStyle)
    expect(frames.size).toBe(0)

    const replacement = slider()
    setMetrics(replacement)
    await nextTick()
    expect(await gestureTrajectory(replacement)).toEqual(initial)
  })
})
