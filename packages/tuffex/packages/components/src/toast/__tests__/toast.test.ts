import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxToastHost from '../src/TxToastHost.vue'
import { clearToasts, dismissToast, toast, toastStore } from '../../../../utils/toast'

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

    const host = document.body.querySelector('.tx-toast-host')
    const item = document.body.querySelector('.tx-toast')
    const close = document.body.querySelector<HTMLButtonElement>('.tx-toast__close')

    expect(host?.getAttribute('role')).toBe('region')
    expect(host?.getAttribute('aria-label')).toBe('Notifications')
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
