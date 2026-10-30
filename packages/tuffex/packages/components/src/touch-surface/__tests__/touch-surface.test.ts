import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw, nextTick } from 'vue'
import { TouchSurface, TxTouchSurface, useLiquidTouch } from '../index'

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

/** The rect and the layout size of a surface 200x100 with its middle at (150, 150). */
function measure(element: HTMLElement): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 100, right: 250, bottom: 200, width: 200, height: 100, x: 50, y: 100, toJSON: () => ({}) })
  vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(200)
  vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(100)
}

enableAutoUnmount(afterEach)

describe('txTouchSurface', () => {
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

  it('is exported with its composable, and installs under its name', () => {
    expect(TxTouchSurface.name).toBe('TxTouchSurface')
    expect(TouchSurface).toBe(TxTouchSurface)
    expect(typeof useLiquidTouch).toBe('function')
    expect((TouchSurface as { install?: unknown }).install).toBeTypeOf('function')
  })

  it('is a base surface by default, and hands it every attribute it does not own', () => {
    const wrapper = mount(TxTouchSurface, {
      attrs: { mode: 'blur', radius: 18, id: 'card', style: 'width: 200px' },
      slots: { default: '<span class="label">Hello</span>' },
    })
    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('tx-touch-surface')).toBe(true)
    expect(root.classList.contains('tx-base-surface')).toBe(true)
    expect(root.classList.contains('tx-base-surface--blur')).toBe(true)
    expect(root.classList.contains('tx-base-surface--own-radius')).toBe(true)
    expect(root.id).toBe('card')
    expect(root.style.width).toBe('200px')
    expect(wrapper.find('.tx-base-surface__content .label').text()).toBe('Hello')
  })

  it('lays the effect on a glass surface when asked, with its engine and size', () => {
    const wrapper = mount(TxTouchSurface, {
      props: { surface: 'glass' },
      attrs: { engine: 'lens', width: 210, height: 150, borderRadius: 75 },
      slots: { default: '<span class="label">Hello</span>' },
    })
    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('tx-touch-surface')).toBe(true)
    expect(root.classList.contains('tx-glass-surface')).toBe(true)
    expect(root.classList.contains('tx-glass-surface--lens')).toBe(true)
    expect(root.style.width).toBe('210px')
    expect(root.style.height).toBe('150px')
    expect(wrapper.find('.tx-glass-surface__content .label').text()).toBe('Hello')
  })

  it('lays the effect on any component whose root is the surface', () => {
    const Panel = markRaw(defineComponent({
      props: { tone: { type: String, default: 'plain' } },
      setup(props, { slots }) {
        return () => h('section', { class: ['panel', `panel--${props.tone}`] }, slots.default?.())
      },
    }))
    const wrapper = mount(TxTouchSurface, {
      props: { surface: Panel },
      attrs: { tone: 'warm' },
      slots: { default: 'Hello' },
    })
    const root = wrapper.element as HTMLElement
    expect(root.tagName).toBe('SECTION')
    expect(root.classList.contains('panel--warm')).toBe(true)
    expect(root.classList.contains('tx-touch-surface')).toBe(true)
    expect(root.textContent).toBe('Hello')
  })

  it('leans, lifts and springs back under a hovering mouse', async () => {
    const wrapper = mount(TxTouchSurface, { attachTo: document.body })
    const root = wrapper.element as HTMLElement
    measure(root)
    await nextTick()

    root.dispatchEvent(pointer('pointerenter', 250, 150))
    runFrames(180)
    expect(root.style.getPropertyValue('translate')).toBe('10px 0px')
    expect(root.style.getPropertyValue('--tx-glass-lift')).toBe('0.3')
    expect(root.style.getPropertyValue('scale')).toBe('1.018 1.018')

    root.dispatchEvent(pointer('pointerleave', 250, 150))
    runFrames(180)
    expect(root.style.getPropertyValue('translate')).toBe('')
    expect(root.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })

  it('lifts the shadows of a glass lens through its lift property', async () => {
    const wrapper = mount(TxTouchSurface, {
      attachTo: document.body,
      props: { surface: 'glass' },
      attrs: { engine: 'lens', width: 200, height: 100 },
    })
    const root = wrapper.element as HTMLElement
    measure(root)
    await nextTick()

    root.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(180)
    expect(root.style.getPropertyValue('--tx-glass-lift')).toBe('1')
  })

  it('takes its numbers from its props, and follows them when they change', async () => {
    const wrapper = mount(TxTouchSurface, {
      attachTo: document.body,
      props: { pressGrow: 0.2, lean: 0.05, hoverLift: 0.5 },
    })
    const root = wrapper.element as HTMLElement
    measure(root)
    await nextTick()

    root.dispatchEvent(pointer('pointerenter', 250, 150))
    runFrames(180)
    // Half lifted, so half of the 20% growth, and half of 5% of the half-width leaning.
    expect(root.style.getPropertyValue('scale')).toBe('1.1 1.1')
    expect(root.style.getPropertyValue('translate')).toBe('5px 0px')

    await wrapper.setProps({ hoverLift: 1, lean: 0.1 })
    runFrames(180)
    expect(root.style.getPropertyValue('scale')).toBe('1.2 1.2')
    expect(root.style.getPropertyValue('translate')).toBe('10px 0px')
  })

  it('keeps working when the surface it is laid on is swapped', async () => {
    const wrapper = mount(TxTouchSurface, { attachTo: document.body })
    const first = wrapper.element as HTMLElement
    measure(first)
    await nextTick()
    first.dispatchEvent(pointer('pointerenter', 150, 150))
    runFrames(120)
    expect(first.style.getPropertyValue('scale')).toBe('1.018 1.018')

    await wrapper.setProps({ surface: 'glass' })
    await nextTick()
    // The first surface is gone, and lets go of what it held.
    expect(first.style.getPropertyValue('scale')).toBe('')

    const second = wrapper.element as HTMLElement
    expect(second.classList.contains('tx-glass-surface')).toBe(true)
    measure(second)
    second.dispatchEvent(pointer('pointerenter', 150, 150))
    runFrames(120)
    expect(second.style.getPropertyValue('scale')).toBe('1.018 1.018')
  })

  it('does nothing while disabled', async () => {
    const wrapper = mount(TxTouchSurface, { attachTo: document.body, props: { disabled: true } })
    const root = wrapper.element as HTMLElement
    measure(root)
    await nextTick()

    root.dispatchEvent(pointer('pointerenter', 250, 150))
    root.dispatchEvent(pointer('pointerdown', 250, 150, { buttons: 1 }))
    runFrames(60)
    expect(root.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })

  it('lets go of the surface when it goes', async () => {
    const wrapper = mount(TxTouchSurface, { attachTo: document.body })
    const root = wrapper.element as HTMLElement
    measure(root)
    await nextTick()
    root.dispatchEvent(pointer('pointerdown', 150, 150, { buttons: 1 }))
    runFrames(10)
    expect(root.style.getPropertyValue('scale')).not.toBe('')

    wrapper.unmount()
    expect(root.style.getPropertyValue('scale')).toBe('')
    expect(queue.size).toBe(0)
  })
})
