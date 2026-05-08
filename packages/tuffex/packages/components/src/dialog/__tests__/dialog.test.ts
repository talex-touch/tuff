import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxBottomDialog from '../src/TxBottomDialog.vue'
import TxTouchTip from '../src/TxTouchTip.vue'

describe('dialog components', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="before">Before</button>'
    document.getElementById('before')?.focus()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('links BottomDialog title and message with instance-scoped ids', () => {
    const close = vi.fn()
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        message: 'Continue?',
        close,
      },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector<HTMLElement>('.tx-bottom-dialog')
    const labelledBy = dialog?.getAttribute('aria-labelledby')
    const describedBy = dialog?.getAttribute('aria-describedby')

    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Confirm')
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe('Continue?')

    wrapper.unmount()
  })

  it('closes BottomDialog on Escape and restores focus', async () => {
    const close = vi.fn()
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        close,
      },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector<HTMLElement>('.tx-bottom-dialog')
    expect(document.activeElement).toBe(dialog)

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)

    expect(close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(document.activeElement).toBe(document.getElementById('before'))
  })

  it('keeps BottomDialog open when button returns false and closes when true', async () => {
    const close = vi.fn()
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        close,
        btns: [
          { content: 'Stay', onClick: () => false },
          { content: 'Close', type: 'success', onClick: () => true },
        ],
      },
      attachTo: document.body,
    })

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.tx-bottom-dialog__btn')
    buttons[0]?.click()
    await vi.advanceTimersByTimeAsync(200)
    expect(close).not.toHaveBeenCalled()

    buttons[1]?.click()
    await vi.advanceTimersByTimeAsync(350)
    expect(close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders TouchTip dialog semantics on the focused container', () => {
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        message: 'Use this action',
        close: vi.fn(),
        buttons: [],
      },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector<HTMLElement>('.tx-touch-tip__container')
    const labelledBy = dialog?.getAttribute('aria-labelledby')
    const describedBy = dialog?.getAttribute('aria-describedby')

    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog)
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Tip')
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe('Use this action')

    wrapper.unmount()
  })

  it('blocks TouchTip close when button returns false', async () => {
    const close = vi.fn()
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        close,
        buttons: [
          { content: 'Stay', onClick: () => false },
          { content: 'Close', onClick: () => true },
        ],
      },
      attachTo: document.body,
    })

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.tx-touch-tip__btn')
    buttons[0]?.click()
    await vi.advanceTimersByTimeAsync(120)
    expect(close).not.toHaveBeenCalled()

    buttons[1]?.click()
    await vi.advanceTimersByTimeAsync(400)
    expect(close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
