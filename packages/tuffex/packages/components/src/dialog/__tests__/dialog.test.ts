import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxBottomDialog from '../src/TxBottomDialog.vue'
import TxBlowDialog from '../src/TxBlowDialog.vue'
import TxPopperDialog from '../src/TxPopperDialog.vue'
import TxTouchTip from '../src/TxTouchTip.vue'
import { asTrustedDialogHtml } from '../src/types'

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

  it('links PopperDialog title and message with instance-scoped ids', () => {
    const close = vi.fn()
    const wrapper = mount(TxPopperDialog, {
      props: {
        title: 'Confirm',
        message: 'Continue?',
        close,
      },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector<HTMLElement>('.tx-popper-dialog')
    const labelledBy = dialog?.getAttribute('aria-labelledby')
    const describedBy = dialog?.getAttribute('aria-describedby')

    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent?.trim()).toBe('Confirm')
    expect(document.getElementById(describedBy ?? '')?.textContent?.trim()).toBe('Continue?')

    wrapper.unmount()
  })

  it('keeps PopperDialog aria wiring correct when two dialogs coexist', () => {
    const close = vi.fn()
    // Both dialogs must live in ONE app: useId() is scoped per app instance, so
    // two separate mount() calls would each restart the counter and collide for
    // reasons unrelated to this component.
    const Host = defineComponent({
      setup: () => () => [
        h(TxPopperDialog, { title: 'First', message: 'First body', close }),
        h(TxPopperDialog, { title: 'Second', message: 'Second body', close }),
      ],
    })
    const wrapper = mount(Host, { attachTo: document.body })

    const dialogs = document.body.querySelectorAll<HTMLElement>('.tx-popper-dialog')
    expect(dialogs.length).toBe(2)

    const ids = Array.from(dialogs).map((d) => ({
      labelledBy: d.getAttribute('aria-labelledby') ?? '',
      describedBy: d.getAttribute('aria-describedby') ?? '',
    }))

    // Pre-fix both instances emitted the same literal ids, so getElementById
    // resolved to the first dialog and the second was mislabelled.
    expect(ids[0].labelledBy).not.toBe(ids[1].labelledBy)
    expect(ids[0].describedBy).not.toBe(ids[1].describedBy)
    expect(document.getElementById(ids[0].labelledBy)?.textContent?.trim()).toBe('First')
    expect(document.getElementById(ids[1].labelledBy)?.textContent?.trim()).toBe('Second')

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

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.tx-bottom-dialog__row')
    buttons[0]?.click()
    await vi.advanceTimersByTimeAsync(200)
    expect(close).not.toHaveBeenCalled()

    buttons[1]?.click()
    await vi.advanceTimersByTimeAsync(350)
    expect(close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('closes BottomDialog from the close control without firing any row action', async () => {
    const close = vi.fn()
    const onClick = vi.fn(() => false)
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        close,
        btns: [{ content: 'Stay', onClick }],
      },
      attachTo: document.body,
    })

    const closeControl = document.body.querySelector<HTMLButtonElement>('.tx-bottom-dialog__close')
    expect(closeControl?.tagName).toBe('BUTTON')
    expect(closeControl?.getAttribute('type')).toBe('button')
    expect(closeControl?.getAttribute('aria-label')).toBe('Close')

    closeControl?.click()
    await vi.advanceTimersByTimeAsync(150)

    expect(close).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('marks only the destructive BottomDialog row with is-danger', () => {
    const close = vi.fn()
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        close,
        btns: [
          { content: 'Info', type: 'info', onClick: () => true },
          { content: 'Remove', type: 'error', onClick: () => true },
        ],
      },
      attachTo: document.body,
    })

    const rows = document.body.querySelectorAll<HTMLButtonElement>('.tx-bottom-dialog__row')
    expect(rows.length).toBe(2)
    expect(rows[0]?.classList.contains('is-danger')).toBe(false)
    expect(rows[1]?.classList.contains('is-danger')).toBe(true)

    wrapper.unmount()
  })

  it('cancels BottomDialog button countdown timers on unmount', async () => {
    const onClick = vi.fn(() => true)
    const close = vi.fn()
    const wrapper = mount(TxBottomDialog, {
      props: {
        title: 'Confirm',
        close,
        btns: [{ content: 'Auto', time: 2, onClick }],
      },
      attachTo: document.body,
    })

    // Countdown ticks from 2 -> 1; not fired yet.
    await vi.advanceTimersByTimeAsync(1000)
    expect(onClick).not.toHaveBeenCalled()

    wrapper.unmount()

    // Push well past the remaining countdown; the timer must be dead.
    await vi.advanceTimersByTimeAsync(2000)
    expect(onClick).not.toHaveBeenCalled()
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

  it('renders TouchTip message as text by default', () => {
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        message: '<script>alert(1)</script>\nNext',
        close: vi.fn(),
        buttons: [],
      },
      attachTo: document.body,
    })

    const content = document.body.querySelector<HTMLElement>('.tx-touch-tip__content')

    expect(content?.textContent).toBe('<script>alert(1)</script>\nNext')
    expect(content?.querySelector('script')).toBeNull()

    wrapper.unmount()
  })

  it('renders TouchTip trusted messageHtml only when explicitly provided', () => {
    const wrapper = mount(TxTouchTip, {
      props: {
        title: 'Tip',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        close: vi.fn(),
        buttons: [],
      },
      attachTo: document.body,
    })

    const content = document.body.querySelector<HTMLElement>('.tx-touch-tip__content')

    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')

    wrapper.unmount()
  })

  it('renders PopperDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TxPopperDialog, {
      props: {
        title: 'Text',
        message: '<strong>Text</strong>',
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    let content = document.body.querySelector<HTMLElement>('.tx-popper-dialog__content')
    expect(content?.textContent).toBe('<strong>Text</strong>')
    expect(content?.querySelector('strong')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TxPopperDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<strong>Trusted</strong>'),
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    content = document.body.querySelector<HTMLElement>('.tx-popper-dialog__content')
    expect(content?.querySelector('strong')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })

  it('renders BlowDialog message as text and messageHtml as trusted html', () => {
    const textWrapper = mount(TxBlowDialog, {
      props: {
        title: 'Text',
        message: '<em>Text</em>',
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    let content = document.body.querySelector<HTMLElement>('.tx-blow-dialog__content')
    expect(content?.textContent).toBe('<em>Text</em>')
    expect(content?.querySelector('em')).toBeNull()
    textWrapper.unmount()

    const htmlWrapper = mount(TxBlowDialog, {
      props: {
        title: 'HTML',
        messageHtml: asTrustedDialogHtml('<em>Trusted</em>'),
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    content = document.body.querySelector<HTMLElement>('.tx-blow-dialog__content')
    expect(content?.querySelector('em')?.textContent).toBe('Trusted')
    htmlWrapper.unmount()
  })

  it('links BlowDialog title and message with instance-scoped ids', () => {
    const close = vi.fn()
    const wrapper = mount(TxBlowDialog, {
      props: {
        title: 'Heads up',
        message: 'Your session will expire soon.',
        close,
      },
      attachTo: document.body,
    })

    const dialog = document.body.querySelector<HTMLElement>('.tx-blow-dialog')
    const labelledBy = dialog?.getAttribute('aria-labelledby')
    const describedBy = dialog?.getAttribute('aria-describedby')

    // Pre-fix BlowDialog set only aria-labelledby (a hard-coded id) and never
    // exposed the message via aria-describedby.
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Heads up')
    expect(document.getElementById(describedBy ?? '')?.textContent?.trim()).toBe('Your session will expire soon.')

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

  it('preserves unrelated inline styles on #app when BlowDialog closes or unmounts', async () => {
    const app = document.createElement('div')
    app.id = 'app'
    app.style.setProperty('--app-accent', 'teal')
    app.style.minHeight = '100vh'
    document.body.appendChild(app)

    const close = vi.fn()
    const wrapper = mount(TxBlowDialog, {
      props: {
        title: 'Heads up',
        message: 'Check styles',
        close,
      },
      attachTo: document.body,
    })

    expect(app.style.transform).toBe('scale(1.25)')
    expect(app.style.getPropertyValue('--app-accent')).toBe('teal')
    expect(app.style.minHeight).toBe('100vh')

    document.body.querySelector<HTMLButtonElement>('.tx-blow-dialog__confirm')?.click()
    await vi.advanceTimersByTimeAsync(550)

    expect(close).toHaveBeenCalledTimes(1)
    expect(app.style.transform).toBe('')
    expect(app.style.opacity).toBe('')
    expect(app.style.transition).toBe('')
    expect(app.style.getPropertyValue('--app-accent')).toBe('teal')
    expect(app.style.minHeight).toBe('100vh')
    wrapper.unmount()

    const unmountClose = vi.fn()
    const openWrapper = mount(TxBlowDialog, {
      props: {
        title: 'Unmount open',
        close: unmountClose,
      },
      attachTo: document.body,
    })
    expect(app.style.transform).toBe('scale(1.25)')
    openWrapper.unmount()
    expect(app.style.transform).toBe('')
    expect(app.style.getPropertyValue('--app-accent')).toBe('teal')
    expect(app.style.minHeight).toBe('100vh')
  })

  it('resets loading state when BottomDialog or TouchTip button action rejects', async () => {
    const capturedErrors: unknown[] = []
    const errorHandler = (err: unknown) => {
      capturedErrors.push(err)
    }

    const bottomClose = vi.fn()
    const bottomWrapper = mount(TxBottomDialog, {
      props: {
        title: 'Retryable',
        close: bottomClose,
        btns: [
          {
            content: 'Fail once',
            onClick: async () => {
              throw new Error('bottom boom')
            },
          },
        ],
      },
      global: { config: { errorHandler } },
      attachTo: document.body,
    })

    const rowBtn = document.body.querySelector<HTMLButtonElement>('.tx-bottom-dialog__row')
    rowBtn?.click()
    await vi.advanceTimersByTimeAsync(200)
    expect(rowBtn?.disabled).toBe(false)
    expect(bottomClose).not.toHaveBeenCalled()
    bottomWrapper.unmount()

    const tipClose = vi.fn()
    const tipWrapper = mount(TxTouchTip, {
      props: {
        title: 'Retryable tip',
        close: tipClose,
        buttons: [
          {
            content: 'Fail once',
            onClick: async () => {
              throw new Error('tip boom')
            },
          },
        ],
      },
      global: { config: { errorHandler } },
      attachTo: document.body,
    })

    const tipBtn = document.body.querySelector<HTMLButtonElement>('.tx-touch-tip__btn')
    tipBtn?.click()
    await vi.advanceTimersByTimeAsync(120)
    expect(tipBtn?.disabled).toBe(false)
    expect(tipClose).not.toHaveBeenCalled()
    expect(capturedErrors).toHaveLength(2)
    tipWrapper.unmount()
  })

  it('does not invoke close callback when dialogs unmount mid-close animation', async () => {
    const blowClose = vi.fn()
    const blowWrapper = mount(TxBlowDialog, {
      props: { title: 'Blow', close: blowClose },
      attachTo: document.body,
    })
    document.body.querySelector<HTMLButtonElement>('.tx-blow-dialog__confirm')?.click()
    await vi.advanceTimersByTimeAsync(100)
    blowWrapper.unmount()
    await vi.advanceTimersByTimeAsync(600)
    expect(blowClose).not.toHaveBeenCalled()

    const popperClose = vi.fn()
    const popperWrapper = mount(TxPopperDialog, {
      props: { title: 'Popper', close: popperClose },
      attachTo: document.body,
    })
    document.body.querySelector<HTMLButtonElement>('.tx-popper-dialog__confirm')?.click()
    await vi.advanceTimersByTimeAsync(50)
    popperWrapper.unmount()
    await vi.advanceTimersByTimeAsync(300)
    expect(popperClose).not.toHaveBeenCalled()

    const bottomClose = vi.fn()
    const bottomWrapper = mount(TxBottomDialog, {
      props: { title: 'Bottom', close: bottomClose },
      attachTo: document.body,
    })
    document.body.querySelector<HTMLButtonElement>('.tx-bottom-dialog__close')?.click()
    await vi.advanceTimersByTimeAsync(50)
    bottomWrapper.unmount()
    await vi.advanceTimersByTimeAsync(200)
    expect(bottomClose).not.toHaveBeenCalled()

    const tipClose = vi.fn()
    const tipWrapper = mount(TxTouchTip, {
      props: { title: 'Tip', buttons: [], close: tipClose },
      attachTo: document.body,
    })
    document.body
      .querySelector<HTMLElement>('.tx-touch-tip__container')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(50)
    tipWrapper.unmount()
    await vi.advanceTimersByTimeAsync(350)
    expect(tipClose).not.toHaveBeenCalled()
  })

  it('renders custom render functions immediately on BlowDialog and PopperDialog without flashing fallback controls', () => {
    const blowWrapper = mount(TxBlowDialog, {
      props: {
        title: 'Ignored title',
        render: () => h('div', { class: 'custom-blow-body' }, 'Custom Blow'),
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    expect(document.body.querySelector('.custom-blow-body')?.textContent).toBe('Custom Blow')
    expect(document.body.querySelector('.tx-blow-dialog__confirm')).toBeNull()
    blowWrapper.unmount()

    const popperWrapper = mount(TxPopperDialog, {
      props: {
        title: 'Ignored title',
        render: () => h('div', { class: 'custom-popper-body' }, 'Custom Popper'),
        close: vi.fn(),
      },
      attachTo: document.body,
    })

    expect(document.body.querySelector('.custom-popper-body')?.textContent).toBe('Custom Popper')
    expect(document.body.querySelector('.tx-popper-dialog__confirm')).toBeNull()
    popperWrapper.unmount()
  })
})
