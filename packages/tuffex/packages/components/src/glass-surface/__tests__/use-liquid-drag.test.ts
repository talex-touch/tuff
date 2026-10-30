import type { LiquidDragOptions } from '../src/use-liquid-drag'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useLiquidDrag } from '../src/use-liquid-drag'

const FRAME_MS = 1000 / 60

let queue = new Map<number, (time: number) => void>()
let nextId = 1
let clock = 1000

function runFrames(count: number): void {
  for (let i = 0; i < count; i++) {
    clock += FRAME_MS
    const due = queue
    queue = new Map()
    due.forEach(callback => callback(clock))
  }
}

function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), { button: 0, clientX: x, clientY: y, pointerId: 1 }, extra)
}

function scales(element: HTMLElement): [number, number] {
  const match = /scale\(([^,]+), ([^)]+)\)/.exec(element.style.transform)
  return [Number(match?.[1]), Number(match?.[2])]
}

function translation(element: HTMLElement): [number, number] {
  const match = /translate3d\(([^p]+)px, ([^p]+)px/.exec(element.style.transform)
  return [Number(match?.[1]), Number(match?.[2])]
}

/** A 200x100 lens whose centre is at (150, 150) in a stage from (0, 0) to (400, 300). */
function mountLens(options: LiquidDragOptions = {}) {
  const stage = document.createElement('div')
  const Lens = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      const bounds = ref<HTMLElement | null>(stage)
      const drag = useLiquidDrag(el, { bounds, ...options })
      return () => h('div', { ref: el, class: 'lens' }, [h('button', { class: 'close' }, 'x')])
    },
  })
  const wrapper = mount(Lens, { attachTo: document.body })
  const element = wrapper.element as HTMLElement
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 100, right: 250, bottom: 200, width: 200, height: 100, x: 50, y: 100, toJSON: () => ({}) })
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) })
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(200)
  vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(100)
  return { wrapper, element }
}

describe('useLiquidDrag', () => {
  beforeEach(() => {
    queue = new Map()
    nextId = 1
    clock = 1000
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      queue.set(nextId, callback)
      return nextId++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('lifts under a press, and settles to rest after the release', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    runFrames(90)
    expect(Number(element.style.getPropertyValue('--tx-glass-lift'))).toBeGreaterThan(0.99)
    expect(scales(element)[1]).toBeCloseTo(1.1, 1)

    element.dispatchEvent(pointer('pointerup', 150, 150))
    runFrames(180)
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('0')
    expect(element.style.transform).toBe('translate3d(0px, 0px, 0) scale(1, 1)')
    expect(queue.size).toBe(0)
  })

  it('swells the width while the lift is changing, and not once it has settled', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    runFrames(6)
    expect(scales(element)[0]).toBeGreaterThan(1)
    runFrames(120)
    expect(scales(element)[0]).toBeCloseTo(1, 2)
  })

  it('follows the pointer exactly, keeping the grab point', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 170, 130))
    element.dispatchEvent(pointer('pointermove', 270, 180))
    runFrames(1)
    expect(translation(element)).toEqual([100, 50])
  })

  it('keeps following the pointer once it has left the lens, and lets go wherever it is released', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    // Not on the lens: the pointer got ahead of it and nothing captured it.
    document.body.dispatchEvent(pointer('pointermove', 300, 200))
    runFrames(1)
    expect(translation(element)).toEqual([150, 50])

    document.body.dispatchEvent(pointer('pointerup', 300, 200))
    runFrames(180)
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('0')
    expect(queue.size).toBe(0)

    // Let go, so it no longer follows.
    document.body.dispatchEvent(pointer('pointermove', 100, 100))
    runFrames(1)
    expect(translation(element)).toEqual([150, 50])
  })

  it('stretches along the way it is dragged, and keeps its volume', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    for (let i = 1; i <= 20; i++) {
      element.dispatchEvent(pointer('pointermove', 150 + i * 5, 150))
      runFrames(1)
    }
    const [scaleX, scaleY] = scales(element)
    expect(scaleX).toBeGreaterThan(1.02)
    // The press makes it taller, but squeezed by the stretch it stays below where it would be at rest.
    expect(scaleY).toBeLessThan(1.1)
  })

  it('stretches less the slower it goes, and never past the cap', async () => {
    const slow = mountLens()
    await Promise.resolve()
    slow.element.dispatchEvent(pointer('pointerdown', 150, 150))
    for (let i = 1; i <= 30; i++) {
      slow.element.dispatchEvent(pointer('pointermove', 150 + i, 150))
      runFrames(1)
    }
    const slowStretch = scales(slow.element)[0]
    slow.wrapper.unmount()

    const fast = mountLens({ maxStretch: 0.05 })
    await Promise.resolve()
    fast.element.dispatchEvent(pointer('pointerdown', 150, 150))
    for (let i = 1; i <= 30; i++) {
      fast.element.dispatchEvent(pointer('pointermove', 150 + i * 6, 150))
      runFrames(1)
    }
    const [fastX] = scales(fast.element)
    expect(fastX).toBeGreaterThan(slowStretch)
    expect(fastX).toBeLessThan(1.06)
  })

  it('stays inside its bounds', async () => {
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    element.dispatchEvent(pointer('pointermove', 900, 900))
    runFrames(1)
    // The 200x100 lens, centred at (150, 150), may travel until it meets the 400x300 stage.
    expect(translation(element)).toEqual([150, 100])

    element.dispatchEvent(pointer('pointermove', -900, -900))
    runFrames(1)
    expect(translation(element)).toEqual([-50, -100])
  })

  it('does not start from the elements it is told to ignore', async () => {
    const { wrapper, element } = mountLens({ ignore: '.close' })
    await Promise.resolve()

    wrapper.find('.close').element.dispatchEvent(pointer('pointerdown', 150, 150))
    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(2)
    expect(translation(element)).toEqual([0, 0])
  })

  it('ignores everything but the primary button, and a disabled lens', async () => {
    const disabled = ref(true)
    const { element } = mountLens({ disabled })
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(1)
    expect(translation(element)).toEqual([0, 0])

    disabled.value = false
    element.dispatchEvent(pointer('pointerdown', 150, 150, { button: 2 }))
    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(1)
    expect(translation(element)).toEqual([0, 0])
  })

  it('lifts at once and never stretches under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { element } = mountLens()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    for (let i = 1; i <= 10; i++) {
      element.dispatchEvent(pointer('pointermove', 150 + i * 20, 150))
      runFrames(1)
    }
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('1')
    expect(scales(element)[0]).toBe(1)
    expect(scales(element)[1]).toBeCloseTo(1.1, 6)
  })

  it('reads its numbers again on every frame, so they can be tuned while it runs', async () => {
    const pressGrow = ref(0.1)
    const restHeight = ref(1)
    const { element } = mountLens({ pressGrow, restHeight })
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150))
    runFrames(90)
    expect(scales(element)[1]).toBeCloseTo(1.1, 1)

    pressGrow.value = 0.5
    runFrames(1)
    expect(scales(element)[1]).toBeCloseTo(1.5, 1)

    element.dispatchEvent(pointer('pointerup', 150, 150))
    runFrames(180)
    expect(queue.size).toBe(0)

    // Asleep at rest: a new rest height has to wake the loop by itself.
    restHeight.value = 0.8
    await nextTick()
    runFrames(2)
    expect(scales(element)[1]).toBeCloseTo(0.8, 6)
    expect(queue.size).toBe(0)
  })

  it('lets go of the element when the component goes', async () => {
    const { wrapper, element } = mountLens()
    await Promise.resolve()
    element.dispatchEvent(pointer('pointerdown', 150, 150))
    runFrames(2)

    wrapper.unmount()
    expect(element.style.transform).toBe('')
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('')
    expect(queue.size).toBe(0)

    // A press after that does nothing: the listeners went with it.
    element.dispatchEvent(pointer('pointerdown', 150, 150))
    runFrames(2)
    expect(element.style.transform).toBe('')
  })
})
