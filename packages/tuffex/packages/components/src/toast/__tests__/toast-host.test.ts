import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { clearToasts, toast, toastsPaused, toastStore } from '../../../../utils/toast'
import { resetToastHostClaims } from '../src/host-registry'
import TxToastHost from '../src/TxToastHost.vue'

/**
 * jsdom has no PointerEvent, and the properties the host reads off one
 * (`pointerId`, `pointerType`, `timeStamp`) are all read-only on a real event.
 * A MouseEvent carries `clientY` and `button`; the rest is pinned here so the
 * velocity arithmetic is deterministic instead of "however fast the test ran".
 */
function pointer(
  type: string,
  init: { clientY?: number, pointerId?: number, at?: number, relatedTarget?: EventTarget | null } = {},
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientY: init.clientY ?? 0,
    relatedTarget: (init.relatedTarget ?? null) as EventTarget | null,
  })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  Object.defineProperty(event, 'timeStamp', { value: init.at ?? 0 })
  return event
}

function cards(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.tx-toast')]
}

function host(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.tx-toast-host')
}

describe('toast host', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    clearToasts()
    resetToastHostClaims()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.useRealTimers()
  })

  function open(props: Record<string, unknown> = {}) {
    wrapper = mount(TxToastHost, { attachTo: document.body, props })
    return nextTick()
  }

  it('puts the newest toast in front and pushes the older ones back', async () => {
    toast({ id: 'a', title: 'A', duration: 0 })
    toast({ id: 'b', title: 'B', duration: 0 })
    toast({ id: 'c', title: 'C', duration: 0 })
    await open()

    // DOM order stays chronological so the live region reads in order; the
    // stack is the reverse of it.
    expect(cards().map(el => el.dataset.front)).toEqual(['false', 'false', 'true'])
    expect(cards().map(el => el.style.zIndex)).toEqual(['1', '2', '3'])
    expect(cards().map(el => el.style.getPropertyValue('--tx-toast-scale'))).toEqual(['0.9', '0.95', '1'])
    expect(cards().map(el => el.style.getPropertyValue('--tx-toast-y'))).toEqual(['-28px', '-14px', '0px'])
  })

  it('grows the stack downward from a top position', async () => {
    toast({ id: 'a', title: 'A', duration: 0 })
    toast({ id: 'b', title: 'B', duration: 0 })
    await open({ position: 'top-right' })

    expect(host()?.dataset.position).toBe('top-right')
    expect(cards().map(el => el.style.getPropertyValue('--tx-toast-y'))).toEqual(['14px', '0px'])
    expect(host()?.style.getPropertyValue('--tx-toast-shift')).toBe('-100%')
  })

  it('holds toasts past visibleToasts out of sight', async () => {
    for (const id of ['a', 'b', 'c', 'd'])
      toast({ id, title: id, duration: 0 })
    await open()

    expect(cards().map(el => el.dataset.visible)).toEqual(['false', 'true', 'true', 'true'])
  })

  it('expands on hover and stops the countdowns while it is open', async () => {
    vi.useFakeTimers()
    toast({ id: 'a', title: 'A', duration: 1000 })
    toast({ id: 'b', title: 'B', duration: 1000 })
    await open()

    expect(host()?.dataset.expanded).toBe('false')

    cards()[0].dispatchEvent(pointer('pointerover'))
    await nextTick()

    expect(host()?.dataset.expanded).toBe('true')
    expect(toastsPaused()).toBe(true)
    // Expanded, every card is upright and offset by its own height plus a gap.
    expect(cards().map(el => el.style.getPropertyValue('--tx-toast-scale'))).toEqual(['1', '1'])

    vi.advanceTimersByTime(5000)
    expect(toastStore.items).toHaveLength(2)

    cards()[0].dispatchEvent(pointer('pointerout', { relatedTarget: document.body }))
    await nextTick()

    expect(host()?.dataset.expanded).toBe('false')
    expect(toastsPaused()).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(toastStore.items).toHaveLength(0)
  })

  it('stays expanded while the pointer crosses between cards', async () => {
    toast({ id: 'a', title: 'A', duration: 0 })
    toast({ id: 'b', title: 'B', duration: 0 })
    await open()

    cards()[1].dispatchEvent(pointer('pointerover'))
    await nextTick()
    expect(host()?.dataset.expanded).toBe('true')

    // Leaving one card for another is still inside the stack.
    cards()[1].dispatchEvent(pointer('pointerout', { relatedTarget: cards()[0] }))
    await nextTick()
    expect(host()?.dataset.expanded).toBe('true')
  })

  it('dismisses a card dragged past the swipe threshold', async () => {
    toast({ id: 'swipe', title: 'Swipe', duration: 0 })
    await open()

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    card.dispatchEvent(pointer('pointermove', { clientY: 60, at: 400 }))
    await nextTick()
    expect(card.style.getPropertyValue('--tx-toast-swipe')).toBe('60px')

    card.dispatchEvent(pointer('pointerup', { clientY: 60, at: 400 }))
    await nextTick()
    expect(toastStore.items).toHaveLength(0)
  })

  it('dismisses a short but fast flick', async () => {
    toast({ id: 'flick', title: 'Flick', duration: 0 })
    await open()

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    card.dispatchEvent(pointer('pointermove', { clientY: 30, at: 40 }))
    card.dispatchEvent(pointer('pointerup', { clientY: 30, at: 40 }))
    await nextTick()

    expect(toastStore.items).toHaveLength(0)
  })

  it('springs a slow short drag back instead of dismissing it', async () => {
    toast({ id: 'short', title: 'Short', duration: 0 })
    await open()

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    card.dispatchEvent(pointer('pointermove', { clientY: 20, at: 900 }))
    card.dispatchEvent(pointer('pointerup', { clientY: 20, at: 900 }))
    await nextTick()

    expect(toastStore.items).toHaveLength(1)
    expect(cards()[0].style.getPropertyValue('--tx-toast-swipe')).toBe('0px')
  })

  it('ignores a fast twitch that never travelled far enough to be a flick', async () => {
    toast({ id: 'twitch', title: 'Twitch', duration: 0 })
    await open()

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    // 8px in 10ms is 0.8px/ms — well past the velocity gate on its own.
    card.dispatchEvent(pointer('pointermove', { clientY: 8, at: 10 }))
    card.dispatchEvent(pointer('pointerup', { clientY: 8, at: 10 }))
    await nextTick()

    expect(toastStore.items).toHaveLength(1)
  })

  it('resists a drag away from the anchored edge', async () => {
    toast({ id: 'resist', title: 'Resist', duration: 0 })
    await open()

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    // Bottom-anchored, so dragging up is the wrong way: 100px of travel gives
    // 20px of movement and never reaches the threshold.
    card.dispatchEvent(pointer('pointermove', { clientY: -100, at: 100 }))
    await nextTick()
    expect(card.style.getPropertyValue('--tx-toast-swipe')).toBe('-20px')

    card.dispatchEvent(pointer('pointerup', { clientY: -100, at: 100 }))
    await nextTick()
    expect(toastStore.items).toHaveLength(1)
  })

  it('leaves swiping off when swipeToDismiss is false', async () => {
    toast({ id: 'locked', title: 'Locked', duration: 0 })
    await open({ swipeToDismiss: false })

    const card = cards()[0]
    card.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    card.dispatchEvent(pointer('pointermove', { clientY: 90, at: 100 }))
    card.dispatchEvent(pointer('pointerup', { clientY: 90, at: 100 }))
    await nextTick()

    expect(card.style.getPropertyValue('--tx-toast-swipe')).toBe('0px')
    expect(toastStore.items).toHaveLength(1)
  })

  it('does not start a drag from a button inside the card', async () => {
    toast({ id: 'btn', title: 'Button', duration: 0 })
    await open()

    const card = cards()[0]
    const close = card.querySelector<HTMLButtonElement>('.tx-toast__close')!
    close.dispatchEvent(pointer('pointerdown', { clientY: 0, at: 0 }))
    card.dispatchEvent(pointer('pointermove', { clientY: 90, at: 100 }))
    await nextTick()

    expect(card.style.getPropertyValue('--tx-toast-swipe')).toBe('0px')
  })

  it('renders the status glyph for a variant and none for the plain one', async () => {
    toast({ id: 'ok', title: 'Ok', variant: 'success', duration: 0 })
    toast({ id: 'plain', title: 'Plain', duration: 0 })
    await open()

    expect(cards()[0].querySelector('.tx-toast__icon [data-icon-value="check-circle"]')).not.toBeNull()
    expect(cards()[1].querySelector('.tx-toast__icon')).toBeNull()
  })

  it('runs a toast action and closes the toast behind it', async () => {
    const onClick = vi.fn()
    toast({ id: 'undo', title: 'Deleted', duration: 0, action: { label: 'Undo', onClick } })
    await open()

    const action = document.body.querySelector<HTMLButtonElement>('.tx-toast__action')
    expect(action?.textContent?.trim()).toBe('Undo')

    action?.click()
    await nextTick()

    expect(onClick).toHaveBeenCalledWith('undo')
    expect(toastStore.items).toHaveLength(0)
  })

  it('keeps the toast open for an action that opts out of dismissing', async () => {
    toast({ id: 'retry', title: 'Failed', duration: 0, action: { label: 'Retry', dismiss: false } })
    await open()

    document.body.querySelector<HTMLButtonElement>('.tx-toast__action')?.click()
    await nextTick()

    expect(toastStore.items).toHaveLength(1)
  })

  it('draws the queue once when a page mounts two hosts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    toast({ id: 'a', title: 'A', duration: 0 })

    const first = mount(TxToastHost, { attachTo: document.body })
    const second = mount(TxToastHost, { attachTo: document.body })
    await nextTick()

    // Both containers stay in the DOM so SSR markup still hydrates cleanly;
    // only the first one that claimed the queue draws it.
    expect(document.body.querySelectorAll('.tx-toast-host')).toHaveLength(2)
    expect(cards()).toHaveLength(1)

    // The owner leaving hands the queue to whoever is left.
    first.unmount()
    await nextTick()
    expect(cards()).toHaveLength(1)

    second.unmount()
    await nextTick()
    expect(cards()).toHaveLength(0)

    vi.mocked(console.warn).mockRestore()
  })

  it('says why the second host is empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = mount(TxToastHost, { attachTo: document.body })
    const second = mount(TxToastHost, { attachTo: document.body })
    await nextTick()

    // Without this the only symptom is a host that silently draws nothing.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('already mounted')

    first.unmount()
    second.unmount()
    warn.mockRestore()
  })

  it('does not let a second host lift the hold the first one is keeping', async () => {
    toast({ id: 'a', title: 'A', duration: 1000 })

    const first = mount(TxToastHost, { attachTo: document.body })
    const second = mount(TxToastHost, { attachTo: document.body })
    await nextTick()

    cards()[0].dispatchEvent(pointer('pointerover'))
    await nextTick()
    expect(toastsPaused()).toBe(true)

    // The spare host was never the one holding the stack open.
    second.unmount()
    expect(toastsPaused()).toBe(true)

    first.unmount()
    expect(toastsPaused()).toBe(false)
  })

  it('lifts the hold when a hovered host unmounts', async () => {
    toast({ id: 'a', title: 'A', duration: 1000 })
    await open()

    cards()[0].dispatchEvent(pointer('pointerover'))
    await nextTick()
    expect(toastsPaused()).toBe(true)

    wrapper?.unmount()
    wrapper = null
    expect(toastsPaused()).toBe(false)
  })
})
