// @vitest-environment jsdom

import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { NotificationPushPayload } from '@talex-touch/utils/transport/events'
import { NotificationEvents } from '@talex-touch/utils/transport/events'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useDialogManager } from '../mention/dialog-manager'
import { captureAppContext } from '../mention/dialog-mention'
import { registerNotificationHub } from './notification-hub'

vi.mock('@talex-touch/utils/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/renderer')>()
  return {
    ...actual,
    isCoreBox: () => false
  }
})

vi.mock('~/modules/lang/useI18nText', () => ({
  useI18nText: () => ({
    t: (key: string) =>
      ({
        'common.confirm': 'Confirm',
        'common.close': 'Close',
        'notifications.defaultTitle': 'Notification'
      })[key] ?? key
  })
}))

const matchMediaMock = vi.hoisted(() =>
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
)

let hostWrapper: { unmount: () => void } | null = null
let disposeHub: (() => void) | null = null

function resetBodyScrollLock(): void {
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  delete document.body.dataset.txFlipOverlayLockCount
  delete document.body.dataset.txFlipOverlayLockOverflow
  delete document.body.dataset.txFlipOverlayLockPaddingRight
}

describe('notification-hub dialog presentations', () => {
  const listeners = new Map<unknown, (payload: unknown) => Promise<void> | void>()
  const sendMock = vi.fn(async () => undefined)

  const transport = {
    on: (event: unknown, listener: (payload: unknown) => Promise<void> | void) => {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
    send: sendMock
  } as unknown as ITuffTransport

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', matchMediaMock)
    listeners.clear()
    sendMock.mockClear()
    document.body.innerHTML = ''
    resetBodyScrollLock()

    const Host = defineComponent({
      setup() {
        captureAppContext()
        return () => h('div', { id: 'app' })
      }
    })
    hostWrapper = mount(Host, { attachTo: document.body })
    disposeHub = registerNotificationHub(transport)
  })

  afterEach(() => {
    disposeHub?.()
    disposeHub = null
    useDialogManager().clearAll()
    hostWrapper?.unmount()
    hostWrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    resetBodyScrollLock()
  })

  it('dispatches mention presentation through TxTouchTip and reports action selection', async () => {
    const notifyHandler = listeners.get(NotificationEvents.push.notify)
    expect(notifyHandler).toBeTypeOf('function')

    const payload: NotificationPushPayload = {
      id: 'notif-1',
      request: {
        channel: 'app',
        level: 'warning',
        title: 'Permission Needed',
        message: 'Allow clipboard access?',
        app: { presentation: 'mention' },
        actions: [{ id: 'allow', label: 'Allow' }]
      }
    }

    const handled = notifyHandler!(payload)
    const tip = document.body.querySelector('.tx-touch-tip')
    expect(tip).toBeTruthy()
    expect(tip?.querySelector('.tx-touch-tip__title')?.textContent).toBe('Permission Needed')

    const actionButton = tip?.querySelector<HTMLButtonElement>('.tx-touch-tip__btn')
    expect(actionButton?.textContent?.trim()).toBe('Allow')
    actionButton?.click()

    await vi.advanceTimersByTimeAsync(400)
    await handled

    expect(sendMock).toHaveBeenCalledWith(NotificationEvents.api.action, {
      id: 'notif-1',
      actionId: 'allow',
      channel: 'app'
    })
    expect(document.body.querySelector('.tx-touch-tip')).toBeNull()
  })

  it('dispatches blow and popper presentations through TxBlowDialog and TxPopperDialog', async () => {
    const notifyHandler = listeners.get(NotificationEvents.push.notify)!

    const blowHandled = notifyHandler({
      id: 'notif-blow',
      request: {
        channel: 'app',
        message: 'Major announcement',
        app: { presentation: 'blow' }
      }
    })

    expect(document.body.querySelector('.tx-blow-dialog__title')?.textContent).toBe('Notification')
    document.body.querySelector<HTMLButtonElement>('.tx-blow-dialog__confirm')?.click()
    await vi.advanceTimersByTimeAsync(550)
    await blowHandled
    expect(document.body.querySelector('.tx-blow-dialog')).toBeNull()

    const popperHandled = notifyHandler({
      id: 'notif-popper',
      request: {
        channel: 'app',
        title: 'Quick Tip',
        message: 'Indexed 12 items',
        app: { presentation: 'popper' }
      }
    })

    expect(document.body.querySelector('.tx-popper-dialog__title')?.textContent).toBe('Quick Tip')
    document.body.querySelector<HTMLButtonElement>('.tx-popper-dialog__confirm')?.click()
    await vi.advanceTimersByTimeAsync(250)
    await popperHandled
    expect(document.body.querySelector('.tx-popper-dialog')).toBeNull()
  })
})
