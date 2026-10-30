import type { LiquidTouchOptions } from '../src/use-liquid-touch'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useLiquidTouch } from '../src/use-liquid-touch'

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
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    button: 0,
    buttons: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }, extra)
}

function touch(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  return pointer(type, x, y, { pointerType: 'touch', buttons: type === 'pointerup' ? 0 : 1, ...extra })
}

function scales(element: HTMLElement): [number, number] {
  const [x, y] = element.style.getPropertyValue('scale').split(' ').map(Number)
  return [x ?? Number.NaN, y ?? Number.NaN]
}

function translation(element: HTMLElement): [number, number] {
  const [x, y] = element.style.getPropertyValue('translate').split(' ').map(Number.parseFloat)
  return [x ?? Number.NaN, y ?? Number.NaN]
}

function lifted(element: HTMLElement): number {
  return Number(element.style.getPropertyValue('--tx-glass-lift'))
}

/** A 200x100 surface whose middle is at (150, 150) when it does not lean. */
function mountSurface(options: LiquidTouchOptions = {}) {
  let state!: ReturnType<typeof useLiquidTouch>
  const Surface = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      state = useLiquidTouch(el, options)
      return () => h('div', { ref: el, class: 'surface' }, [h('button', { class: 'inside' }, 'x')])
    },
  })
  const wrapper = mount(Surface, { attachTo: document.body })
  const element = wrapper.element as HTMLElement
  // The rect of a real element carries the lean it is drawn with.
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const [x, y] = element.style.getPropertyValue('translate') ? translation(element) : [0, 0]
    return { left: 50 + x, top: 100 + y, right: 250 + x, bottom: 200 + y, width: 200, height: 100, x: 50 + x, y: 100 + y, toJSON: () => ({}) }
  })
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(200)
  vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(100)
  return { wrapper, element, state }
}

// A surface left mounted keeps its window listeners, and would hear the next test's pointer.
enableAutoUnmount(afterEach)

describe('useLiquidTouch', () => {
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

  it('lifts a little under a hovering mouse, and lets go entirely when it leaves', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 150, 150))
    runFrames(120)
    expect(state.hovered.value).toBe(true)
    expect(lifted(element)).toBeCloseTo(0.3, 3)
    expect(scales(element)[0]).toBeCloseTo(1.018, 3)
    expect(scales(element)[1]).toBeCloseTo(1.018, 3)
    // Held still, it sleeps with the lift drawn.
    expect(queue.size).toBe(0)

    element.dispatchEvent(pointer('pointerleave', 150, 150))
    runFrames(180)
    expect(state.hovered.value).toBe(false)
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(element.style.getPropertyValue('translate')).toBe('')
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('')
    expect(queue.size).toBe(0)
  })

  it('leans toward the pointer, by a share of its size and never past the cap', async () => {
    const { element } = mountSurface()
    await Promise.resolve()

    // The right edge of a 200px surface is a half-width away: 10% of 100px.
    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(10, 1)
    expect(translation(element)[1]).toBeCloseTo(0, 1)

    // The bottom edge is 50px away, and the share of that is 5px.
    element.dispatchEvent(pointer('pointermove', 150, 200))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(0, 1)
    expect(translation(element)[1]).toBeCloseTo(5, 1)

    // Past the edge it leans no further than at it.
    element.dispatchEvent(pointer('pointermove', -400, 150))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(-10, 1)

    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(10, 1)
  })

  it('caps the lean in px, and takes the cap and the share from the options', async () => {
    const { element } = mountSurface({ lean: 1, maxLean: 4 })
    await Promise.resolve()

    element.dispatchEvent(pointer('pointermove', 250, 150))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(4, 1)
  })

  it('presses under a finger without ever hovering, and lets go when the finger lifts', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    // A finger arrives as an enter and an over too, and neither is a hover.
    element.dispatchEvent(touch('pointerenter', 200, 150))
    element.dispatchEvent(touch('pointermove', 200, 150))
    runFrames(2)
    expect(state.hovered.value).toBe(false)
    expect(queue.size).toBe(0)

    element.dispatchEvent(touch('pointerdown', 200, 150))
    runFrames(120)
    expect(state.pressed.value).toBe(true)
    expect(lifted(element)).toBeCloseTo(1, 3)
    expect(scales(element)[0]).toBeCloseTo(1.06, 3)
    // A touch halfway to the edge leans halfway.
    expect(translation(element)[0]).toBeCloseTo(5, 1)

    element.dispatchEvent(touch('pointerup', 200, 150))
    element.dispatchEvent(touch('pointerleave', 200, 150))
    runFrames(180)
    expect(state.pressed.value).toBe(false)
    expect(state.hovered.value).toBe(false)
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })

  it('follows a finger that slides off the surface, and lets go of it when the page takes the touch', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(touch('pointerdown', 150, 150))
    document.body.dispatchEvent(touch('pointermove', 600, 150))
    runFrames(180)
    expect(translation(element)[0]).toBeCloseTo(10, 1)

    // The browser starts scrolling and cancels the pointer.
    document.body.dispatchEvent(touch('pointercancel', 600, 150))
    runFrames(180)
    expect(state.pressed.value).toBe(false)
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)

    // Let go, so it no longer follows.
    document.body.dispatchEvent(touch('pointermove', 100, 100))
    runFrames(2)
    expect(queue.size).toBe(0)
  })

  it('returns to the hover lift after a mouse press, if the mouse is still over it', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 150, 150))
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(120)
    expect(lifted(element)).toBeCloseTo(1, 3)

    element.dispatchEvent(pointer('pointerup', 150, 150))
    runFrames(180)
    expect(state.pressed.value).toBe(false)
    expect(state.hovered.value).toBe(true)
    expect(lifted(element)).toBeCloseTo(0.3, 3)

    // The mouse is back over it after a press that left, so hovering resumes.
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    element.dispatchEvent(pointer('pointerleave', 400, 150, { buttons: 1 }))
    document.body.dispatchEvent(pointer('pointermove', 400, 150, { buttons: 1 }))
    expect(state.hovered.value).toBe(false)
    element.dispatchEvent(pointer('pointerenter', 200, 150, { buttons: 1 }))
    expect(state.hovered.value).toBe(true)
    document.body.dispatchEvent(pointer('pointerup', 200, 150))
    runFrames(180)
    expect(lifted(element)).toBeCloseTo(0.3, 3)
  })

  it('ignores a control-click and the other buttons of a mouse', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1, ctrlKey: true }))
    element.dispatchEvent(pointer('pointerdown', 150, 150, { button: 2, buttons: 2 }))
    runFrames(2)
    expect(state.pressed.value).toBe(false)
    expect(queue.size).toBe(0)
  })

  it('ends a mouse press that moves on with no button down, as a release the page never heard does', async () => {
    const { element, state } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(60)
    expect(state.pressed.value).toBe(true)

    document.body.dispatchEvent(pointer('pointermove', 500, 150, { buttons: 0 }))
    expect(state.pressed.value).toBe(false)
  })

  it('stretches along the way the pointer moves, and keeps its volume', async () => {
    const { element } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 100, 150))
    for (let i = 1; i <= 20; i++) {
      element.dispatchEvent(pointer('pointermove', 100 + i * 12, 150))
      runFrames(1)
    }
    const [scaleX, scaleY] = scales(element)
    expect(scaleX).toBeGreaterThan(1.05)
    expect(scaleY).toBeLessThan(1)
    expect(scaleX).toBeGreaterThan(scaleY)

    // Stopped, it springs back to the plain hover shape.
    runFrames(240)
    expect(scales(element)[0]).toBeCloseTo(1.018, 3)
    expect(scales(element)[1]).toBeCloseTo(1.018, 3)
  })

  it('stretches less the slower the pointer goes, and never past the cap', async () => {
    const slow = mountSurface()
    await Promise.resolve()
    slow.element.dispatchEvent(pointer('pointerenter', 100, 150))
    for (let i = 1; i <= 30; i++) {
      slow.element.dispatchEvent(pointer('pointermove', 100 + i, 150))
      runFrames(1)
    }
    const slowStretch = scales(slow.element)[0]
    slow.wrapper.unmount()

    const fast = mountSurface({ maxStretch: 0.05 })
    await Promise.resolve()
    fast.element.dispatchEvent(pointer('pointerenter', 100, 150))
    for (let i = 1; i <= 30; i++) {
      fast.element.dispatchEvent(pointer('pointermove', 100 + i * 20, 150))
      runFrames(1)
    }
    const [fastX] = scales(fast.element)
    expect(fastX).toBeGreaterThan(slowStretch)
    // The hover swell, times the cap.
    expect(fastX).toBeLessThan(1.018 * 1.05 + 0.002)
  })

  it('does not read a pointer that arrives from afar as a swipe', async () => {
    const { element } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 240, 190))
    runFrames(1)
    expect(scales(element)[0]).toBeLessThan(1.02)
    expect(scales(element)[1]).toBeGreaterThan(1)
  })

  it('leaves the transform of the element alone', async () => {
    const { element } = mountSurface()
    await Promise.resolve()
    element.style.transform = 'rotate(3deg)'

    element.dispatchEvent(pointer('pointerdown', 220, 160, { buttons: 1 }))
    runFrames(30)
    expect(element.style.transform).toBe('rotate(3deg)')
    document.body.dispatchEvent(pointer('pointerup', 220, 160))
    runFrames(180)
    expect(element.style.transform).toBe('rotate(3deg)')
  })

  it('does nothing while disabled, and lets go of whatever it holds when it is disabled', async () => {
    const disabled = ref(true)
    const { element, state } = mountSurface({ disabled })
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 150, 150))
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(2)
    expect(state.hovered.value).toBe(false)
    expect(state.pressed.value).toBe(false)
    expect(queue.size).toBe(0)

    disabled.value = false
    await nextTick()
    element.dispatchEvent(pointer('pointerenter', 150, 150))
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(120)
    expect(lifted(element)).toBeCloseTo(1, 3)

    disabled.value = true
    await nextTick()
    runFrames(240)
    expect(state.hovered.value).toBe(false)
    expect(state.pressed.value).toBe(false)
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })

  it('lifts at once and never leans or stretches under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { element } = mountSurface()
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerenter', 250, 150))
    element.dispatchEvent(pointer('pointerdown', 250, 150, { buttons: 1 }))
    for (let i = 1; i <= 10; i++) {
      element.dispatchEvent(pointer('pointermove', 250 - i * 10, 150, { buttons: 1 }))
      runFrames(1)
    }
    expect(lifted(element)).toBe(1)
    expect(translation(element)).toEqual([0, 0])
    expect(scales(element)[0]).toBeCloseTo(1.06, 6)
    expect(scales(element)[1]).toBeCloseTo(1.06, 6)
  })

  it('reads its numbers again on every frame, so they can be tuned while it runs', async () => {
    const pressGrow = ref(0.06)
    const lean = ref(0.1)
    const { element } = mountSurface({ pressGrow, lean })
    await Promise.resolve()

    element.dispatchEvent(pointer('pointerdown', 250, 150, { buttons: 1 }))
    runFrames(120)
    expect(scales(element)[0]).toBeCloseTo(1.06, 3)
    expect(translation(element)[0]).toBeCloseTo(10, 1)
    expect(queue.size).toBe(0)

    // Asleep with the press held: a new number has to wake the loop by itself.
    pressGrow.value = 0.2
    lean.value = 0.05
    await nextTick()
    runFrames(180)
    expect(scales(element)[0]).toBeCloseTo(1.2, 3)
    expect(translation(element)[0]).toBeCloseTo(5, 1)
    expect(queue.size).toBe(0)
  })

  it('lets go of the element when the component goes', async () => {
    const { wrapper, element } = mountSurface()
    await Promise.resolve()
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(10)
    expect(element.style.getPropertyValue('scale')).not.toBe('')

    wrapper.unmount()
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(element.style.getPropertyValue('translate')).toBe('')
    expect(element.style.getPropertyValue('--tx-glass-lift')).toBe('')
    expect(queue.size).toBe(0)

    // Nothing hears the pointer after that: the listeners went with it.
    element.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    document.body.dispatchEvent(pointer('pointermove', 300, 150, { buttons: 1 }))
    runFrames(2)
    expect(element.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })
})
