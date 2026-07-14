// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TBlowDialog from './TBlowDialog.vue'
import TBottomDialog from './TBottomDialog.vue'
import TDialogMention from './TDialogMention.vue'
import TouchTip from './TouchTip.vue'

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
  component: Component
  closeDelay: number
  name: string
  propName: 'btns' | 'buttons'
}

const buttonDialogs: ButtonDialogDefinition[] = [
  {
    component: TBottomDialog,
    closeDelay: 350,
    name: 'TBottomDialog',
    propName: 'btns'
  },
  {
    component: TDialogMention,
    closeDelay: 500,
    name: 'TDialogMention',
    propName: 'btns'
  },
  {
    component: TouchTip,
    closeDelay: 700,
    name: 'TouchTip',
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

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.tx-button')).find(
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
      const button = getButton('Working')

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

    getButton('Decline').click()
    await vi.advanceTimersByTimeAsync(200)
    expect(declinedAction).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()

    getButton('Confirm').click()
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

      window.dispatchEvent(new Event('scroll'))
      expect(scrollTo).toHaveBeenCalledTimes(1)
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 })

      unmountDialog(wrapper)
      window.dispatchEvent(new Event('scroll'))
      expect(scrollTo).toHaveBeenCalledTimes(1)
    }
  )

  it('TBlowDialog focuses its confirmation action, does not lock scrolling, and restores focus after unmount', async () => {
    vi.useFakeTimers()

    const app = document.createElement('main')
    app.id = 'app'
    const trigger = document.createElement('button')
    trigger.textContent = 'Open dialog'
    document.body.append(app, trigger)
    trigger.focus()

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const close = vi.fn()
    const wrapper = mount(TBlowDialog, {
      attachTo: document.body,
      props: {
        close,
        message: 'This action changes the current view.',
        title: 'Blow dialog'
      }
    })
    mountedWrappers.push(wrapper)

    const confirm = getButton('Confirm')
    expect(document.activeElement).toBe(confirm)
    expect(app.style.transform).toBe('scale(1.25)')

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
})
