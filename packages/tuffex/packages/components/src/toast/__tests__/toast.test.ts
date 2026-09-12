import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxToastHost from '../src/TxToastHost.vue'
import { clearToasts, dismissToast, pauseToasts, resumeToasts, toast, toastsPaused, toastStore } from '../../../../utils/toast'

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearToasts()
  })

  afterEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it('adds toasts, returns ids, and replaces existing ids', () => {
    const id = toast({
      id: 'save',
      title: 'Saved',
      description: 'Changes saved',
      variant: 'success',
      duration: 0,
    })

    toast({
      id: 'save',
      title: 'Updated',
      duration: 0,
    })

    expect(id).toBe('save')
    expect(toastStore.items).toHaveLength(1)
    expect(toastStore.items[0]).toMatchObject({
      id: 'save',
      title: 'Updated',
      variant: 'default',
      duration: 0,
    })
  })

  it('auto dismisses positive-duration toasts', () => {
    toast({
      id: 'auto',
      title: 'Auto',
      duration: 100,
    })

    expect(toastStore.items).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(toastStore.items).toHaveLength(0)
  })

  it('cancels the previous auto-dismiss timer when replacing the same id', () => {
    toast({ id: 'sync', title: 'First', duration: 5000 })

    vi.advanceTimersByTime(4000)
    toast({ id: 'sync', title: 'Second', duration: 5000 })

    // The original 5s timer fires here; it must not dismiss the replacement.
    vi.advanceTimersByTime(1000)
    expect(toastStore.items).toHaveLength(1)
    expect(toastStore.items[0]).toMatchObject({ id: 'sync', title: 'Second' })

    // The replacement keeps its own full duration.
    vi.advanceTimersByTime(3999)
    expect(toastStore.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toastStore.items).toHaveLength(0)
  })

  it('holds a countdown while paused and resumes from what was left', () => {
    toast({ id: 'hold', title: 'Hold', duration: 1000 })
    vi.advanceTimersByTime(400)

    pauseToasts()
    vi.advanceTimersByTime(5000)
    expect(toastStore.items).toHaveLength(1)

    resumeToasts()
    // 600ms was owed when the hold started, not the full 1000.
    vi.advanceTimersByTime(599)
    expect(toastStore.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toastStore.items).toHaveLength(0)
  })

  it('does not start the countdown for a toast raised while paused', () => {
    pauseToasts()
    toast({ id: 'late', title: 'Late', duration: 500 })

    vi.advanceTimersByTime(5000)
    expect(toastStore.items).toHaveLength(1)

    resumeToasts()
    vi.advanceTimersByTime(500)
    expect(toastStore.items).toHaveLength(0)
  })

  it('lifts the hold when the queue is cleared', () => {
    pauseToasts()
    expect(toastsPaused()).toBe(true)

    clearToasts()
    expect(toastsPaused()).toBe(false)

    // A hold left behind by a torn-down host would strand every later toast.
    toast({ id: 'after', title: 'After', duration: 100 })
    vi.advanceTimersByTime(100)
    expect(toastStore.items).toHaveLength(0)
  })

  it('does not auto dismiss persistent toasts', () => {
    toast({
      id: 'persistent',
      title: 'Persistent',
      duration: 0,
    })

    vi.advanceTimersByTime(10000)
    expect(toastStore.items).toHaveLength(1)
  })

  it('dismisses and clears toasts', () => {
    toast({ id: 'first', title: 'First', duration: 0 })
    toast({ id: 'second', title: 'Second', duration: 0 })

    dismissToast('first')
    expect(toastStore.items.map(item => item.id)).toEqual(['second'])

    clearToasts()
    expect(toastStore.items).toHaveLength(0)
  })

  it('escalates danger toasts to an assertive alert role', async () => {
    toast({ id: 'err', title: 'Failed', variant: 'danger', duration: 0 })

    const wrapper = mount(TxToastHost, { attachTo: document.body })
    // The host claims the queue in `onMounted`, so the toasts land on the tick
    // after mount rather than in the first render.
    await wrapper.vm.$nextTick()
    const item = document.body.querySelector('.tx-toast')

    expect(item?.getAttribute('role')).toBe('alert')

    wrapper.unmount()
  })

  it('renders host notifications and accessible close buttons', async () => {
    toast({
      id: 'visible',
      title: 'Visible',
      description: 'Visible description',
      variant: 'warning',
      duration: 0,
    })

    const wrapper = mount(TxToastHost, {
      attachTo: document.body,
    })
    await wrapper.vm.$nextTick()

    const host = document.body.querySelector('.tx-toast-host')
    const item = document.body.querySelector('.tx-toast')
    const close = document.body.querySelector<HTMLButtonElement>('.tx-toast__close')

    expect(host?.getAttribute('role')).toBe('region')
    expect(host?.getAttribute('aria-label')).toBe('Notifications')
    // The host is a polite live region so toasts announce while focus is elsewhere.
    expect(host?.getAttribute('aria-live')).toBe('polite')
    // Non-danger toasts rely on the host region and carry no nested live-region role.
    expect(item?.getAttribute('role')).toBeNull()
    expect(item?.classList.contains('tx-toast--warning')).toBe(true)
    expect(item?.textContent).toContain('Visible')
    expect(item?.textContent).toContain('Visible description')
    expect(close?.getAttribute('aria-label')).toBe('Dismiss notification')

    close?.click()
    await wrapper.vm.$nextTick()
    expect(toastStore.items).toHaveLength(0)

    wrapper.unmount()
  })
})
