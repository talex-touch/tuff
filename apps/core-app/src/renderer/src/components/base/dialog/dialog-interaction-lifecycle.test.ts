// @vitest-environment jsdom
import {
  TxBlowDialog,
  TxBottomDialog,
  TxPopperDialog,
  TxTouchTip
} from '@talex-touch/tuffex/dialog'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TDialogMention from './TDialogMention.vue'

// The dialogs' own labels come from vue-i18n. These tests are about rendering and focus, so the
// translator answers in English instead of installing the catalogs.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'common.confirm': 'Confirm',
        'common.close': 'Close'
      })[key] ?? key
  })
}))

const matchMediaMock = vi.hoisted(() => {
  const mock = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
  vi.stubGlobal('matchMedia', mock)
  return mock
})

type DialogButton = {
  content: string
  onClick: () => boolean
  loading?: (done: () => void) => void
}

type ButtonDialogDefinition = {
  buttonSelector: string
  component: Component
  closeDelay: number
  lockStrategy: 'body-overflow' | 'window-scroll'
  name: string
  propName: 'btns' | 'buttons'
}

const buttonDialogs: ButtonDialogDefinition[] = [
  {
    buttonSelector: '.tx-bottom-dialog__row',
    component: TxBottomDialog,
    closeDelay: 350,
    lockStrategy: 'body-overflow',
    name: 'TxBottomDialog',
    propName: 'btns'
  },
  {
    buttonSelector: '.tx-button',
    component: TDialogMention,
    closeDelay: 500,
    lockStrategy: 'window-scroll',
    name: 'TDialogMention',
    propName: 'btns'
  },
  {
    buttonSelector: '.tx-button',
    component: TxTouchTip,
    closeDelay: 400,
    lockStrategy: 'body-overflow',
    name: 'TxTouchTip',
    propName: 'buttons'
  }
]

let mountedWrappers: Array<{ unmount: () => void }> = []
function mockScrollTo() {
  return vi
    .spyOn(window, 'scrollTo')
    .mockImplementation((_options?: ScrollToOptions | number, _y?: number) => undefined)
}

beforeEach(() => {
  matchMediaMock.mockClear()
  matchMediaMock.mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
  vi.stubGlobal('matchMedia', matchMediaMock)
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  delete document.body.dataset.txFlipOverlayLockCount
  delete document.body.dataset.txFlipOverlayLockOverflow
  delete document.body.dataset.txFlipOverlayLockPaddingRight
})

function mountButtonDialog(
  definition: ButtonDialogDefinition,
  buttons: DialogButton | DialogButton[],
  close: () => void
) {
  const wrapper = mount(definition.component, {
    attachTo: document.body,
    props: {
      close,
      message: 'Continue with this action?',
      title: 'Confirm action',
      [definition.propName]: Array.isArray(buttons) ? buttons : [buttons]
    }
  })

  mountedWrappers.push(wrapper)
  return wrapper
}

function getButton(label: string, selector = '.tx-button'): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>(selector)).find(
    (candidate) => candidate.textContent?.includes(label)
  )

  expect(button).toBeTruthy()
  return button!
}

function unmountDialog(wrapper: { unmount: () => void }): void {
  wrapper.unmount()
  mountedWrappers = mountedWrappers.filter((candidate) => candidate !== wrapper)
}

afterEach(() => {
  for (const wrapper of mountedWrappers) wrapper.unmount()
  mountedWrappers = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  delete document.body.dataset.txFlipOverlayLockCount
  delete document.body.dataset.txFlipOverlayLockOverflow
  delete document.body.dataset.txFlipOverlayLockPaddingRight
})

describe('base dialog interaction and lifecycle contracts', () => {
  it.each(buttonDialogs)(
    '$name renders callback-controlled loading as disabled and blocks its action',
    async (definition) => {
      vi.useFakeTimers()

      const close = vi.fn()
      const action = vi.fn(() => false)
      const wrapper = mountButtonDialog(
        definition,
        {
          content: 'Working',
          loading: () => {},
          onClick: action
        },
        close
      )
      const button = getButton('Working', definition.buttonSelector)

      expect(button.disabled).toBe(true)
      button.click()
      await vi.advanceTimersByTimeAsync(200)

      expect(action).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()

      unmountDialog(wrapper)
    }
  )

  it.each(buttonDialogs)('$name only closes after a confirming action', async (definition) => {
    vi.useFakeTimers()

    const close = vi.fn()
    const declinedAction = vi.fn(() => false)
    const confirmedAction = vi.fn(() => true)
    const wrapper = mountButtonDialog(
      definition,
      [
        {
          content: 'Decline',
          onClick: declinedAction
        },
        {
          content: 'Confirm',
          onClick: confirmedAction
        }
      ],
      close
    )

    getButton('Decline', definition.buttonSelector).click()
    await vi.advanceTimersByTimeAsync(200)
    expect(declinedAction).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()

    getButton('Confirm', definition.buttonSelector).click()
    await vi.advanceTimersByTimeAsync(definition.closeDelay)

    expect(confirmedAction).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)

    unmountDialog(wrapper)
  })

  it.each(buttonDialogs)(
    '$name prevents scrolling while mounted and releases the scroll lock on unmount',
    (definition) => {
      const scrollTo = mockScrollTo()
      const wrapper = mountButtonDialog(
        definition,
        {
          content: 'Dismiss',
          onClick: () => false
        },
        vi.fn()
      )

      if (definition.lockStrategy === 'body-overflow') {
        expect(document.body.style.overflow).toBe('hidden')
        unmountDialog(wrapper)
        expect(document.body.style.overflow).toBe('')
      } else {
        window.dispatchEvent(new Event('scroll'))
        expect(scrollTo).toHaveBeenCalledTimes(1)
        expect(scrollTo).toHaveBeenCalledWith({ top: 0 })

        unmountDialog(wrapper)
        window.dispatchEvent(new Event('scroll'))
        expect(scrollTo).toHaveBeenCalledTimes(1)
      }
    }
  )

  it('TxBlowDialog focuses its dialog surface, does not lock scrolling, and restores focus after close', async () => {
    vi.useFakeTimers()

    const app = document.createElement('main')
    app.id = 'app'
    const trigger = document.createElement('button')
    trigger.textContent = 'Open dialog'
    document.body.append(app, trigger)
    trigger.focus()

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const close = vi.fn()
    const wrapper = mount(TxBlowDialog, {
      attachTo: document.body,
      props: {
        close,
        message: 'This action changes the current view.',
        title: 'Blow dialog'
      }
    })
    mountedWrappers.push(wrapper)

    const dialog = document.body.querySelector<HTMLElement>('.tx-blow-dialog')
    const confirm = getButton('Confirm')
    expect(document.activeElement).toBe(dialog)
    expect(dialog?.querySelector('.tx-base-surface--refraction')).toBeTruthy()
    expect(app.style.transform).toBe('scale(1.25)')
    expect(document.body.style.overflow).toBe('')

    window.dispatchEvent(new Event('scroll'))
    expect(scrollTo).not.toHaveBeenCalled()

    confirm.click()
    await vi.advanceTimersByTimeAsync(550)

    expect(close).toHaveBeenCalledTimes(1)
    expect(app.style.transform).toBe('')
    expect(app.style.opacity).toBe('')

    unmountDialog(wrapper)
    expect(document.activeElement).toBe(trigger)
  })

  it('TxPopperDialog uses refraction surface, renders Confirm, closes on Escape, and restores focus', async () => {
    vi.useFakeTimers()

    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.append(trigger)
    trigger.focus()

    const close = vi.fn()
    const wrapper = mount(TxPopperDialog, {
      attachTo: document.body,
      props: {
        close,
        title: 'Popper',
        message: 'Short notice'
      }
    })
    mountedWrappers.push(wrapper)

    const dialog = document.body.querySelector<HTMLElement>('.tx-popper-dialog')
    expect(dialog?.querySelector('.tx-base-surface--refraction')).toBeTruthy()
    expect(document.activeElement).toBe(dialog)
    expect(getButton('Confirm')).toBeTruthy()

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(250)

    expect(close).toHaveBeenCalledTimes(1)
    unmountDialog(wrapper)
    expect(document.activeElement).toBe(trigger)
  })
})
