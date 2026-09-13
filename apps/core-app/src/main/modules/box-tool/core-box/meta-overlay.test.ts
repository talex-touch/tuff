import type { TuffItem } from '@talex-touch/utils/core-box'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendTo: vi.fn(async (_target: unknown, _event: unknown, _payload: unknown) => undefined),
  broadcastToWindow: vi.fn((_windowId: number, _event: unknown, _payload: unknown) => undefined),
  sendToPlugin: vi.fn(async () => undefined),
  focus: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      success: vi.fn()
    }))
  },
  coreBoxWindow: {
    window: {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        focus: vi.fn()
      }
    }
  },
  parentWindow: {
    id: 4711,
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 720, height: 480 })),
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
      children: []
    },
    webContents: {
      isDestroyed: vi.fn(() => false),
      focus: vi.fn()
    }
  },
  // Each WebContentsView the manager builds registers its own renderer here, so the readiness
  // tests can address the current meta webContents and prove an id from a destroyed one is stale.
  createdMetaWebContents: [] as Array<{ id: number }>,
  nextMetaWebContentsId: 7301
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendTo: mocks.sendTo,
    broadcastToWindow: mocks.broadcastToWindow,
    sendToPlugin: mocks.sendToPlugin
  }))
}))

vi.mock('../../../core/runtime-accessor', () => ({
  maybeGetRegisteredMainRuntime: vi.fn(() => ({
    app: { channel: {} },
    channel: {}
  }))
}))

vi.mock('../../../core/window-security-profile', () => ({
  buildWindowWebPreferences: vi.fn((_: string, options: unknown) => options)
}))

vi.mock('../../../hooks/use-electron-guard', () => ({
  useAliveTarget: vi.fn((target: unknown) => target),
  useAliveWebContents: vi.fn((target: { webContents?: unknown } | null | undefined) => {
    if (!target) return null
    return target.webContents ?? target
  })
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('./window', () => ({
  getCoreBoxWindow: vi.fn(() => mocks.coreBoxWindow)
}))

vi.mock('../../../config/default', () => ({
  BoxWindowOption: {
    webPreferences: {
      preload: '/tmp/preload.js'
    }
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  },
  WebContentsView: class WebContentsView {
    webContents = {
      id: mocks.nextMetaWebContentsId++,
      addListener: vi.fn(),
      on: vi.fn(),
      // installAppViewNavigationPolicy, which init() now runs (#1465), denies window.open and
      // rejects webview attachment through these. A mock without them throws before the test
      // reaches what it is actually asserting.
      setWindowOpenHandler: vi.fn(),
      isLoading: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      focus: vi.fn()
    }

    constructor() {
      mocks.createdMetaWebContents.push(this.webContents)
    }

    setBounds = vi.fn()
    setBackgroundColor = vi.fn()
    setVisible = vi.fn()
    getVisible = vi.fn(() => true)
  }
}))

import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { metaOverlayManager } from './meta-overlay'

const item = {
  id: 'app-1',
  kind: 'app',
  source: { id: 'apps', type: 'application' },
  render: { basic: { title: 'App' } },
  meta: { app: { path: '/Applications/App.app' } }
} as TuffItem

// init() resolves the CoreBox renderer URL, and electron.app is mocked as unpackaged above, so it
// takes the development branch and throws without one. Introduced by #1465, which gave app-profile
// views the navigation guards plugin views have; this test was not updated with it.
// Set through vi.stubEnv rather than by assignment: electron-vite declares ELECTRON_RENDERER_URL
// readonly, so writing it fails the main-process typecheck (TS2540/TS2704) even though the test
// itself passes. vi.unstubAllEnvs also restores it, which the hand-rolled save/restore was for.
afterAll(() => {
  vi.unstubAllEnvs()
})

describe('MetaOverlayManager action execution', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')

    vi.clearAllMocks()
    metaOverlayManager.unregisterPluginActions('plugin-a')
    metaOverlayManager.destroy()
  })

  it('broadcasts a builtin action to the attached parent window without a request/response sendTo', async () => {
    metaOverlayManager.init(mocks.parentWindow as never)

    const result = await metaOverlayManager.executeAction('reveal-in-finder', item)

    expect(result).toEqual({ success: true })
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
    // Fire-and-forget: a void `sendTo` would leave the action panel waiting for a reply that never
    // comes and only surface the callback 60s later, after the overlay has already hidden.
    expect(mocks.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      mocks.parentWindow.id,
      CoreBoxEvents.metaOverlay.itemAction,
      { actionId: 'reveal-in-finder', item }
    )
    expect(mocks.sendTo).not.toHaveBeenCalled()
  })

  it('relays item actions to the parent window rather than the top-level CoreBox window', async () => {
    metaOverlayManager.init(mocks.parentWindow as never)

    const result = await metaOverlayManager.executeAction('copy-answer', item)

    expect(result).toEqual({ success: true })
    expect(mocks.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      mocks.parentWindow.id,
      CoreBoxEvents.metaOverlay.itemAction,
      { actionId: 'copy-answer', item }
    )
    expect(mocks.broadcastToWindow).not.toHaveBeenCalledWith(
      mocks.coreBoxWindow.window.webContents,
      expect.anything(),
      expect.anything()
    )
  })

  it('skips the relay entirely when no parent window is attached', async () => {
    // destroy() detaches the parent; a stale broadcast would target a dead window id.
    metaOverlayManager.destroy()
    metaOverlayManager.unregisterPluginActions('plugin-a')

    const result = await metaOverlayManager.executeAction('reveal-in-finder', item)

    expect(result).toEqual({ success: true })
    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()
    expect(mocks.sendTo).not.toHaveBeenCalled()
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
  })

  it('keeps plugin actions on the plugin action-executed channel', async () => {
    metaOverlayManager.registerPluginAction('plugin-a', {
      id: 'plugin-action',
      render: {
        basic: {
          title: 'Plugin action'
        }
      }
    })

    const result = await metaOverlayManager.executeAction('plugin-action', item)

    expect(result).toEqual({ success: true })
    // Plugin actions are owned by the plugin host, so they must not reach the CoreBox action
    // pipeline as if they were built-in actions.
    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()
    expect(mocks.sendToPlugin).toHaveBeenCalledWith(
      'plugin-a',
      CoreBoxEvents.metaOverlay.actionExecuted,
      { actionId: 'plugin-action', item, pluginId: 'plugin-a' }
    )
    expect(mocks.sendToPlugin).toHaveBeenCalledTimes(1)
  })

  it('prefers current item actions over registered plugin actions with the same id', async () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.registerPluginAction('plugin-a', {
      id: 'copy-answer',
      render: {
        basic: {
          title: 'Plugin copy'
        }
      }
    })
    const itemWithAction = {
      ...item,
      actions: [
        {
          id: 'copy-answer',
          type: 'execute',
          label: 'Copy answer'
        }
      ]
    } as TuffItem

    const result = await metaOverlayManager.executeAction('copy-answer', itemWithAction)

    expect(result).toEqual({ success: true })
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
    expect(mocks.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      mocks.parentWindow.id,
      CoreBoxEvents.metaOverlay.itemAction,
      { actionId: 'copy-answer', item: itemWithAction }
    )
  })

  it('returns a failure when action execution has no item context', async () => {
    const result = await metaOverlayManager.executeAction('toggle-pin')

    expect(result).toEqual({ success: false, error: 'Missing item context' })
    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()
    expect(mocks.sendTo).not.toHaveBeenCalled()
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
  })
})

/**
 * A dismissed overlay destroys its WebContentsView, so the next show builds a fresh renderer whose
 * `isLoading()` is already false before `MetaOverlay.vue` has mounted its `ui.show` listener. Sending
 * on load completion therefore raced the listener and left a blank overlay; readiness is now an
 * explicit announcement from the current renderer.
 */
describe('MetaOverlayManager renderer readiness handshake', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.nextMetaWebContentsId = 7301
    metaOverlayManager.destroy()
  })

  const showRequest = {
    item,
    builtinActions: [],
    itemActions: [],
    pluginActions: []
  }

  function currentMetaWebContents(): { id: number } {
    const current = mocks.createdMetaWebContents.at(-1)
    expect(current, 'expected the manager to have built an overlay renderer').toBeDefined()
    return current!
  }

  function showDispatches(): Array<[unknown, unknown, unknown]> {
    return mocks.sendTo.mock.calls.filter(
      ([, event]) => event === MetaOverlayEvents.ui.show
    ) as Array<[unknown, unknown, unknown]>
  }

  it('holds the first show until the overlay renderer announces it is ready', () => {
    metaOverlayManager.init(mocks.parentWindow as never)

    metaOverlayManager.show(showRequest)

    // Not merely the message: showing the view before its listener exists leaves a blank overlay
    // that the user has to dismiss and reopen.
    expect(showDispatches()).toHaveLength(0)
    expect(metaOverlayManager.getVisible()).toBe(false)

    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id + 1)).toBe(false)
    expect(showDispatches()).toHaveLength(0)

    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id)).toBe(true)
    expect(showDispatches()).toHaveLength(1)
    expect(showDispatches()[0][0]).toBe(currentMetaWebContents())
    expect(showDispatches()[0][2]).toEqual(showRequest)
    expect(metaOverlayManager.getVisible()).toBe(true)
  })

  it('releases a pending show exactly once per renderer', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    const rendererId = currentMetaWebContents().id

    expect(metaOverlayManager.markRendererReady(rendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(1)

    // A second announcement must not replay the request the renderer already received.
    metaOverlayManager.markRendererReady(rendererId)
    expect(showDispatches()).toHaveLength(1)
  })

  it('waits for the rebuilt renderer after the overlay was dismissed', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    const dismissedRendererId = currentMetaWebContents().id
    expect(metaOverlayManager.markRendererReady(dismissedRendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(1)

    metaOverlayManager.hide()
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)

    // The destroyed renderer's id must not release the rebuilt one's pending request.
    expect(metaOverlayManager.markRendererReady(dismissedRendererId)).toBe(false)
    expect(showDispatches()).toHaveLength(1)

    const rebuiltRendererId = currentMetaWebContents().id
    expect(rebuiltRendererId).not.toBe(dismissedRendererId)
    expect(metaOverlayManager.markRendererReady(rebuiltRendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(2)
  })

  it('drops a queued show with the renderer that died instead of replaying it', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    expect(showDispatches()).toHaveLength(0)

    metaOverlayManager.hide()
    metaOverlayManager.init(mocks.parentWindow as never)

    // The request belonged to the renderer that was destroyed. Replaying it into the rebuilt one
    // would pop the overlay for an item the user is no longer looking at.
    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id)).toBe(true)
    expect(showDispatches()).toHaveLength(0)
    expect(metaOverlayManager.getVisible()).toBe(false)
  })
})
