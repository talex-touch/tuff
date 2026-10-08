import type { TuffItem } from '@talex-touch/utils/core-box'
import type { MetaShowRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    isVisible: vi.fn(() => true),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 720, height: 480 })),
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
      children: []
    },
    webContents: {
      isDestroyed: vi.fn(() => false),
      focus: vi.fn()
    },
    // The BrowserWindow 'hide' listeners the manager registers, so a test can hide CoreBox.
    hideListeners: new Set<() => void>(),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'hide') mocks.parentWindow.hideListeners.add(listener)
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'hide') mocks.parentWindow.hideListeners.delete(listener)
    })
  },
  // The CoreBox window height the manager reads and writes through WindowManager.
  windowHeight: 480,
  getSettledHeight: vi.fn((): number | null => mocks.windowHeight),
  setHeight: vi.fn((height: number, _target?: unknown) => {
    mocks.windowHeight = height
  }),
  // Whether an animated resize is still in flight; a resize without the animation lands at once.
  isResizing: vi.fn((): boolean => false),
  // Each WebContentsView the manager builds registers its own renderer here, so the readiness
  // tests can address the current meta webContents and prove an id from a destroyed one is stale.
  createdMetaWebContents: [] as Array<{ id: number }>,
  createdMetaViews: [] as Array<{
    webContents: { on: ReturnType<typeof vi.fn> }
    setVisible: ReturnType<typeof vi.fn>
  }>,
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
  getCoreBoxWindow: vi.fn(() => mocks.coreBoxWindow),
  windowManager: {
    get windows() {
      return [{ window: mocks.parentWindow }]
    },
    getSettledHeight: mocks.getSettledHeight,
    setHeight: mocks.setHeight,
    isResizing: mocks.isResizing
  }
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
      mocks.createdMetaViews.push(this)
    }

    setBounds = vi.fn()
    setBackgroundColor = vi.fn()
    setVisible = vi.fn()
    getVisible = vi.fn(() => true)
  }
}))

import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { COREBOX_FLOW_TRANSFER_ACTION_ID } from '../../../../shared/events/corebox-scenes'
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
    // The overlay's own `ui.hide` reset is the only `sendTo` this path may make.
    expect(mocks.sendTo.mock.calls.map(([, event]) => event)).toEqual([MetaOverlayEvents.ui.hide])
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
 * The overlay renderer is built once and retained across dismissals, so main must not deliver a
 * show before that renderer has mounted its `ui.show` listener: `webContents.isLoading() === false`
 * is already true while the async renderer bootstrap is still between document load and mount.
 * Retention is what the reuse cases below defend - rebuilding per dismissal put a full renderer
 * cold start in front of every open.
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

  it('reuses the retained renderer for a later show instead of rebuilding it', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    const rendererId = currentMetaWebContents().id
    expect(metaOverlayManager.markRendererReady(rendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(1)

    metaOverlayManager.hide()

    // A second open must not pay for a renderer, and must not wait for another handshake: the
    // renderer that already announced readiness is still the live one.
    metaOverlayManager.show(showRequest)

    expect(mocks.createdMetaWebContents).toHaveLength(1)
    expect(currentMetaWebContents().id).toBe(rendererId)
    expect(showDispatches()).toHaveLength(2)
    expect(metaOverlayManager.getVisible()).toBe(true)
  })

  it('resets the retained renderer on hide so a reused panel does not keep dismissed state', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id)).toBe(true)

    metaOverlayManager.hide()

    // Without this the renderer's `visible` never leaves `true`, so its watcher never re-runs and
    // the reused panel keeps the previous query, selection and action lock.
    const hideDispatches = mocks.sendTo.mock.calls.filter(
      ([, event]) => event === MetaOverlayEvents.ui.hide
    )
    expect(hideDispatches).toHaveLength(1)
    expect(hideDispatches[0][0]).toBe(currentMetaWebContents())
    expect(metaOverlayManager.getVisible()).toBe(false)
  })

  it('waits for a rebuilt renderer after the retained one died', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    const deadRendererId = currentMetaWebContents().id
    expect(metaOverlayManager.markRendererReady(deadRendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(1)

    // Only a renderer loss rebuilds now; destroy() is how that path is reached in this harness,
    // and it detaches the parent, so the caller reattaches exactly as CoreBox does on next show.
    metaOverlayManager.destroy()
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)

    expect(metaOverlayManager.markRendererReady(deadRendererId)).toBe(false)
    expect(showDispatches()).toHaveLength(1)

    const rebuiltRendererId = currentMetaWebContents().id
    expect(rebuiltRendererId).not.toBe(deadRendererId)
    expect(metaOverlayManager.markRendererReady(rebuiltRendererId)).toBe(true)
    expect(showDispatches()).toHaveLength(2)
  })

  it('drops a queued show with the renderer that died instead of replaying it', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    expect(showDispatches()).toHaveLength(0)

    metaOverlayManager.destroy()
    metaOverlayManager.init(mocks.parentWindow as never)

    // The request belonged to the renderer that was destroyed. Replaying it into the rebuilt one
    // would pop the overlay for an item the user is no longer looking at.
    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id)).toBe(true)
    expect(showDispatches()).toHaveLength(0)
    expect(metaOverlayManager.getVisible()).toBe(false)
  })

  it('drops a queued show when the user dismisses before the renderer is ready', () => {
    metaOverlayManager.init(mocks.parentWindow as never)
    metaOverlayManager.show(showRequest)
    expect(showDispatches()).toHaveLength(0)

    // ESC during a cold first open. The retained renderer announces readiness moments later, and
    // must not surface a panel the user already dismissed.
    metaOverlayManager.hide()

    expect(metaOverlayManager.markRendererReady(currentMetaWebContents().id)).toBe(true)
    expect(showDispatches()).toHaveLength(0)
    expect(metaOverlayManager.getVisible()).toBe(false)
  })
})

/**
 * The panel lives inside the CoreBox window, so the window has to hold it. It grows only when the
 * panel would not fit (R3), hands its height back when the panel closes, and does not resize under
 * an open panel: a layout update that arrives meanwhile is held and replayed on close.
 */
describe('MetaOverlayManager window height around the panel', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    // Destroy first: a panel a previous case left open hands its height back on the way out.
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 300
    metaOverlayManager.init(mocks.parentWindow as never)
    // A warm renderer: the show below is revealed at once rather than queued.
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  })

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  const hostWindow = expect.objectContaining({ window: mocks.parentWindow })

  it('grows a window the panel does not fit to exactly what it needs, and restores it on close', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    // Search header + gap (64), the panel (300), the footer + gap it sits above (52).
    expect(mocks.setHeight).toHaveBeenCalledExactlyOnceWith(416, hostWindow)
    expect(metaOverlayManager.getVisible()).toBe(true)

    metaOverlayManager.hide()

    expect(mocks.setHeight).toHaveBeenCalledTimes(2)
    expect(mocks.setHeight).toHaveBeenLastCalledWith(300, hostWindow)
    expect(mocks.windowHeight).toBe(300)
  })

  it('uses the smaller corner inset when there is no footer to sit above', () => {
    mocks.windowHeight = 56
    metaOverlayManager.show(request({ anchor: 'corner', desiredPanelHeight: 300 }))

    expect(mocks.setHeight).toHaveBeenCalledExactlyOnceWith(376, hostWindow)
  })

  it('leaves a window that already fits the panel alone, open and closed', () => {
    mocks.windowHeight = 480
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    metaOverlayManager.hide()

    // The old forceMax pushed every open to 600, leaving an empty strip of window under short
    // result lists.
    expect(mocks.setHeight).not.toHaveBeenCalled()
  })

  it('caps the panel at its maximum, so the window never grows past what that needs', () => {
    mocks.windowHeight = 56
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 5_000 }))

    expect(mocks.setHeight).toHaveBeenCalledExactlyOnceWith(536, hostWindow)
  })

  it('leaves the window alone when the request carries no panel height', () => {
    metaOverlayManager.show(request())
    metaOverlayManager.hide()

    expect(mocks.setHeight).not.toHaveBeenCalled()
  })

  it('holds layout updates while the panel is open and replays the latest one instead of restoring', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    const stale = vi.fn()
    const latest = vi.fn()

    expect(metaOverlayManager.holdLayoutUpdate(stale)).toBe(true)
    expect(metaOverlayManager.holdLayoutUpdate(latest)).toBe(true)
    mocks.setHeight.mockClear()

    metaOverlayManager.hide()

    expect(stale).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    // The replayed update sizes the window for the results as they are now; restoring the
    // pre-open height on top of it would undo that.
    expect(mocks.setHeight).not.toHaveBeenCalled()
    expect(metaOverlayManager.holdLayoutUpdate(vi.fn())).toBe(false)
  })

  it('does not hold layout updates while no panel is on screen', () => {
    expect(metaOverlayManager.holdLayoutUpdate(vi.fn())).toBe(false)

    metaOverlayManager.show(request())
    metaOverlayManager.hide()

    expect(metaOverlayManager.holdLayoutUpdate(vi.fn())).toBe(false)
  })

  it('closes with CoreBox without resizing the hidden window, replaying, or moving focus', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    const replay = vi.fn()
    metaOverlayManager.holdLayoutUpdate(replay)
    mocks.setHeight.mockClear()
    mocks.sendTo.mockClear()

    expect(mocks.parentWindow.hideListeners.size).toBe(1)
    for (const listener of mocks.parentWindow.hideListeners) listener()

    expect(metaOverlayManager.getVisible()).toBe(false)
    expect(mocks.createdMetaViews.at(-1)!.setVisible).toHaveBeenLastCalledWith(false)
    // The retained renderer still has to reset, or the next open shows the dismissed state.
    expect(mocks.sendTo.mock.calls.map(([, event]) => event)).toEqual([MetaOverlayEvents.ui.hide])
    expect(replay).not.toHaveBeenCalled()
    expect(mocks.setHeight).not.toHaveBeenCalled()
    expect(mocks.parentWindow.webContents.focus).not.toHaveBeenCalled()
    // No hold survives it: CoreBox resizes freely after its next show.
    expect(metaOverlayManager.holdLayoutUpdate(vi.fn())).toBe(false)
  })

  it('does not open a panel on a hidden CoreBox window', () => {
    // A ⌘K from a detached DivisionBox: CoreBox is hidden, so the panel could never be seen.
    mocks.parentWindow.isVisible.mockReturnValueOnce(false)
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    expect(metaOverlayManager.getVisible()).toBe(false)
    expect(mocks.sendTo).not.toHaveBeenCalled()
    expect(mocks.setHeight).not.toHaveBeenCalled()
    // Nothing is left open to surface on the next show or to hold CoreBox's layout.
    expect(metaOverlayManager.holdLayoutUpdate(vi.fn())).toBe(false)
  })

  it('stops listening to the CoreBox window when the overlay is destroyed', () => {
    expect(mocks.parentWindow.hideListeners.size).toBe(1)

    metaOverlayManager.destroy()

    expect(mocks.parentWindow.hideListeners.size).toBe(0)
  })

  it('leaves Esc to the IME while it composes', () => {
    metaOverlayManager.show(request())
    const beforeInput = mocks.createdMetaViews
      .at(-1)!
      .webContents.on.mock.calls.find(([event]) => event === 'before-input-event')?.[1] as (
      event: { preventDefault: () => void },
      input: { type: string; key: string; isComposing: boolean }
    ) => void
    expect(beforeInput).toBeTypeOf('function')

    const composing = { preventDefault: vi.fn() }
    beforeInput(composing, { type: 'keyDown', key: 'Escape', isComposing: true })
    expect(composing.preventDefault).not.toHaveBeenCalled()
    expect(metaOverlayManager.getVisible()).toBe(true)

    const plain = { preventDefault: vi.fn() }
    beforeInput(plain, { type: 'keyDown', key: 'Escape', isComposing: false })
    expect(plain.preventDefault).toHaveBeenCalledTimes(1)
    expect(metaOverlayManager.getVisible()).toBe(false)
  })
})

/**
 * CoreBox paints the space a grown window adds under the panel; otherwise that space shows the
 * window material, a blur of the desktop behind CoreBox. Main is the only one that knows whether
 * it grew the window, so it tells the CoreBox renderer on every change, fire-and-forget.
 */
describe('MetaOverlayManager panel state for the CoreBox renderer', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    // Destroy first: a panel a previous case left open is closed on the way out.
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 300
    metaOverlayManager.init(mocks.parentWindow as never)
  })

  function markReady(): void {
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  }

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  function published(): unknown[] {
    return mocks.broadcastToWindow.mock.calls
      .filter(([, event]) => event === CoreBoxEvents.metaOverlay.panelState)
      .map(([windowId, , payload]) => {
        expect(windowId).toBe(mocks.parentWindow.id)
        return payload
      })
  }

  it('says the panel grew the window, and that it closed', () => {
    markReady()
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    expect(published()).toEqual([{ visible: true, grown: true, blur: false }])
    // Never a request: nothing in the renderer answers it (channel-transport-contracts).
    expect(
      mocks.sendTo.mock.calls.some(([, event]) => event === CoreBoxEvents.metaOverlay.panelState)
    ).toBe(false)

    metaOverlayManager.hide()

    expect(published()).toEqual([
      { visible: true, grown: true, blur: false },
      { visible: false, grown: false, blur: false }
    ])
  })

  it('says the panel is open but did not grow a window that already fit it', () => {
    mocks.windowHeight = 480
    markReady()

    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    expect(published()).toEqual([{ visible: true, grown: false, blur: false }])
  })

  it('publishes changes only', () => {
    markReady()
    // Closing a panel that never opened tells CoreBox nothing new.
    metaOverlayManager.hide()
    expect(published()).toEqual([])

    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    metaOverlayManager.hide()
    metaOverlayManager.hide()

    expect(published()).toEqual([
      { visible: true, grown: true, blur: false },
      { visible: false, grown: false, blur: false }
    ])
  })

  it('publishes nothing for a queued show until the renderer takes it', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    expect(published()).toEqual([])

    markReady()

    expect(published()).toEqual([{ visible: true, grown: true, blur: false }])
  })

  it('clears the state when CoreBox hides under the panel', () => {
    markReady()
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    for (const listener of mocks.parentWindow.hideListeners) listener()

    expect(published().at(-1)).toEqual({ visible: false, grown: false, blur: false })
  })

  it('clears the state when the overlay goes away under the panel, and starts over after', () => {
    markReady()
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    metaOverlayManager.destroy()
    expect(published().at(-1)).toEqual({ visible: false, grown: false, blur: false })

    // A rebuilt overlay for the same CoreBox: the next grown open is news again.
    mocks.broadcastToWindow.mockClear()
    mocks.windowHeight = 300
    metaOverlayManager.init(mocks.parentWindow as never)
    markReady()
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    expect(published()).toEqual([{ visible: true, grown: true, blur: false }])
  })

  it('tells CoreBox the window grew before growing it', () => {
    markReady()
    let publishedWhenGrowing: unknown[] = []
    mocks.setHeight.mockImplementationOnce((height: number) => {
      publishedWhenGrowing = published()
      mocks.windowHeight = height
    })

    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))

    // CoreBox's first frame at the new size then already paints the space the growth adds.
    expect(mocks.setHeight).toHaveBeenCalledOnce()
    expect(publishedWhenGrowing).toEqual([{ visible: true, grown: true, blur: false }])
    expect(published()).toEqual([{ visible: true, grown: true, blur: false }])
  })
})

/**
 * With `animation.coreBoxResize` on, the height handed back on close takes up to 220ms to land,
 * and until then the window still has the space the panel added. CoreBox keeps painting it: the
 * paint dropping at close showed the desktop through the shrinking strip.
 */
describe('MetaOverlayManager panel state while the window animates back', () => {
  const hostWindow = expect.objectContaining({ window: mocks.parentWindow })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 300
    mocks.isResizing.mockReturnValue(false)
    metaOverlayManager.init(mocks.parentWindow as never)
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  })

  afterEach(() => {
    metaOverlayManager.destroy()
    mocks.isResizing.mockReturnValue(false)
    vi.useRealTimers()
  })

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  function published(): unknown[] {
    return mocks.broadcastToWindow.mock.calls
      .filter(([, event]) => event === CoreBoxEvents.metaOverlay.panelState)
      .map(([, , payload]) => payload)
  }

  /** Opens a panel that grows the window from 300 to 416, then closes it mid-animation. */
  function closeWhileRestoreAnimates(): void {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    mocks.isResizing.mockReturnValue(true)
    metaOverlayManager.hide()
  }

  it('keeps the space painted until the restore has landed', () => {
    closeWhileRestoreAnimates()

    expect(mocks.setHeight).toHaveBeenLastCalledWith(300, hostWindow)
    expect(published()).toEqual([
      { visible: true, grown: true, blur: false },
      { visible: false, grown: true, blur: false }
    ])

    vi.advanceTimersByTime(160)
    expect(published()).toHaveLength(2)

    mocks.isResizing.mockReturnValue(false)
    vi.advanceTimersByTime(40)

    expect(published()).toEqual([
      { visible: true, grown: true, blur: false },
      { visible: false, grown: true, blur: false },
      { visible: false, grown: false, blur: false }
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not wait on a window the panel never grew', () => {
    mocks.windowHeight = 480
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    // Something else animates the window, a held layout update for one: not the panel's doing.
    mocks.isResizing.mockReturnValue(true)
    metaOverlayManager.hide()

    expect(published()).toEqual([
      { visible: true, grown: false, blur: false },
      { visible: false, grown: false, blur: false }
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops at a second, so a window that never settles cannot keep the paint', () => {
    closeWhileRestoreAnimates()

    vi.advanceTimersByTime(900)
    expect(published().at(-1)).toEqual({ visible: false, grown: true, blur: false })

    vi.advanceTimersByTime(200)
    expect(published().at(-1)).toEqual({ visible: false, grown: false, blur: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops when CoreBox hides, so its next show does not open painted', () => {
    closeWhileRestoreAnimates()

    for (const listener of mocks.parentWindow.hideListeners) listener()

    expect(published().at(-1)).toEqual({ visible: false, grown: false, blur: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps painting through a reopen that grows the window again', () => {
    closeWhileRestoreAnimates()

    // Reopened before the restore landed: the window heads back up from where it was going.
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    expect(mocks.setHeight).toHaveBeenLastCalledWith(416, hostWindow)
    mocks.isResizing.mockReturnValue(false)
    vi.advanceTimersByTime(100)

    expect(published()).toEqual([
      { visible: true, grown: true, blur: false },
      { visible: false, grown: true, blur: false },
      { visible: true, grown: true, blur: false }
    ])

    metaOverlayManager.hide()
    expect(published().at(-1)).toEqual({ visible: false, grown: false, blur: false })
  })

  it('keeps painting through a reopen that fits, only until the window is back', () => {
    closeWhileRestoreAnimates()

    // 64 + 150 + 52 = 266 fits the 300 the window is heading back to: no second growth.
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 150 }))
    expect(published().at(-1)).toEqual({ visible: true, grown: true, blur: false })

    mocks.isResizing.mockReturnValue(false)
    vi.advanceTimersByTime(40)

    expect(published().at(-1)).toEqual({ visible: true, grown: false, blur: false })
  })
})

/**
 * The card is a stack of pages: the action list, the Flow targets and the Flow confirmation. The
 * overlay reports every change (`ui.page`), and main follows it: it grows the window for a page
 * that does not fit, leaves Esc to the overlay while the card can go back, and tells CoreBox to
 * blur under a Flow page.
 */
describe('MetaOverlayManager pages of the card', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 300
    mocks.isResizing.mockReturnValue(false)
    metaOverlayManager.init(mocks.parentWindow as never)
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  })

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  function published(): unknown[] {
    return mocks.broadcastToWindow.mock.calls
      .filter(([, event]) => event === CoreBoxEvents.metaOverlay.panelState)
      .map(([, , payload]) => payload)
  }

  /** Every height the window was set to, in order. */
  function heights(): number[] {
    return mocks.setHeight.mock.calls.map(([height]) => height)
  }

  it('grows the window for a page that does not fit, and hands the pre-open height back on close', () => {
    // 64 + 200 + 52.
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 200 }))
    expect(heights()).toEqual([316])

    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 300 })
    expect(heights()).toEqual([316, 416])

    metaOverlayManager.hide()

    // Recorded once, at the first growth: never the 316 that growth left behind.
    expect(heights()).toEqual([316, 416, 300])
  })

  it('never shrinks the window for a shorter page while the panel is open', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 200 }))
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 400 })
    expect(heights()).toEqual([316, 516])

    // Back on the action list the card shrinks inside the window; the window stays.
    metaOverlayManager.changePage({ page: 'actions', canGoBack: false, desiredPanelHeight: 200 })

    expect(heights()).toEqual([316, 516])
    // The room the shorter page leaves is still the panel's, so CoreBox keeps painting it.
    expect(published().at(-1)).toEqual({ visible: true, grown: true, blur: false })
  })

  it('records the height to return to when only a later page grows the window', () => {
    // 64 + 300 + 52 = 416 fits.
    mocks.windowHeight = 480
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    expect(heights()).toEqual([])

    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 420 })
    metaOverlayManager.changePage({
      page: 'flow-confirm',
      canGoBack: true,
      desiredPanelHeight: 420
    })
    expect(heights()).toEqual([536])

    metaOverlayManager.hide()
    expect(heights()).toEqual([536, 480])
  })

  it('sizes a page for the anchor the panel opened with', () => {
    mocks.windowHeight = 56
    // 64 + 100 + 12, then 64 + 300 + 12.
    metaOverlayManager.show(request({ anchor: 'corner', desiredPanelHeight: 100 }))
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 300 })

    expect(heights()).toEqual([176, 376])
  })

  it('leaves the window alone for a page change that carries no height', () => {
    metaOverlayManager.show(request())
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })

    expect(heights()).toEqual([])
  })

  it('still replays a layout update held under a grown page, instead of restoring', () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 200 }))
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 300 })
    const replay = vi.fn()
    expect(metaOverlayManager.holdLayoutUpdate(replay)).toBe(true)

    metaOverlayManager.hide()

    expect(replay).toHaveBeenCalledOnce()
    expect(heights()).toEqual([316, 416])
  })

  it('ignores a page change while no panel is open', () => {
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true, desiredPanelHeight: 300 })

    expect(heights()).toEqual([])
    expect(published()).toEqual([])

    // Nor does it reach the next open.
    metaOverlayManager.show(request())
    expect(published()).toEqual([{ visible: true, grown: false, blur: false }])
  })

  it('blurs CoreBox while the card shows a Flow page, and says so on change only', () => {
    mocks.windowHeight = 480
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })
    metaOverlayManager.changePage({ page: 'flow-confirm', canGoBack: true })
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })
    metaOverlayManager.changePage({ page: 'actions', canGoBack: false })

    expect(published()).toEqual([
      { visible: true, grown: false, blur: false },
      { visible: true, grown: false, blur: true },
      { visible: true, grown: false, blur: false }
    ])
  })

  it('opens blurred on a card that opens on its Flow page, and says so before growing', () => {
    let publishedWhenGrowing: unknown[] = []
    mocks.setHeight.mockImplementationOnce((height: number) => {
      publishedWhenGrowing = published()
      mocks.windowHeight = height
    })

    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300, page: 'flow' }))

    expect(mocks.setHeight).toHaveBeenCalledOnce()
    expect(publishedWhenGrowing).toEqual([{ visible: true, grown: true, blur: true }])
    expect(published()).toEqual([{ visible: true, grown: true, blur: true }])
  })

  it('opens a show request for any other page on the action list', () => {
    mocks.windowHeight = 480
    // Only the action list and the Flow targets open a card; the confirmation is reached from them.
    metaOverlayManager.show(request({ page: 'flow-confirm' as never }))

    expect(published()).toEqual([{ visible: true, grown: false, blur: false }])
  })

  it.each([
    ['it closes', () => metaOverlayManager.hide()],
    [
      'CoreBox hides under it',
      () => {
        for (const listener of mocks.parentWindow.hideListeners) listener()
      }
    ],
    ['the overlay goes away', () => metaOverlayManager.destroy()]
  ])('drops the blur when %s', (_label, close) => {
    mocks.windowHeight = 480
    metaOverlayManager.show(request({ page: 'flow' }))

    close()

    expect(published()).toEqual([
      { visible: true, grown: false, blur: true },
      { visible: false, grown: false, blur: false }
    ])
  })

  it('opens the next panel on its own page, not on the one the last panel closed on', () => {
    mocks.windowHeight = 480
    metaOverlayManager.show(request())
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })
    metaOverlayManager.hide()
    mocks.broadcastToWindow.mockClear()

    metaOverlayManager.show(request())

    expect(published()).toEqual([{ visible: true, grown: false, blur: false }])
  })
})

/**
 * Esc on the action list, and on a card that opened on its Flow page, closes the panel in main as
 * it always has. On a page the card can go back from, it is the overlay's: it takes the card back
 * one page, and only the Esc after that closes.
 */
describe('MetaOverlayManager Esc on a card with pages', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 480
    metaOverlayManager.init(mocks.parentWindow as never)
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  })

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  function pressEscape(isComposing = false): { preventDefault: ReturnType<typeof vi.fn> } {
    const beforeInput = mocks.createdMetaViews
      .at(-1)!
      .webContents.on.mock.calls.find(([event]) => event === 'before-input-event')?.[1] as (
      event: { preventDefault: () => void },
      input: { type: string; key: string; isComposing: boolean }
    ) => void
    expect(beforeInput).toBeTypeOf('function')
    const event = { preventDefault: vi.fn() }
    beforeInput(event, { type: 'keyDown', key: 'Escape', isComposing })
    return event
  }

  it('leaves Esc to the overlay while the card can go back, and closes once it cannot', () => {
    metaOverlayManager.show(request())
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })

    const back = pressEscape()
    expect(back.preventDefault).not.toHaveBeenCalled()
    expect(metaOverlayManager.getVisible()).toBe(true)

    // The overlay took the card back to the action list.
    metaOverlayManager.changePage({ page: 'actions', canGoBack: false })
    const close = pressEscape()

    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(metaOverlayManager.getVisible()).toBe(false)
  })

  it('closes on the first Esc a card that opened on its Flow page', () => {
    metaOverlayManager.show(request({ page: 'flow' }))

    const close = pressEscape()

    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(metaOverlayManager.getVisible()).toBe(false)
  })

  it('leaves Esc to the IME on any page', () => {
    metaOverlayManager.show(request({ page: 'flow' }))

    const composing = pressEscape(true)

    expect(composing.preventDefault).not.toHaveBeenCalled()
    expect(metaOverlayManager.getVisible()).toBe(true)
  })

  it('forgets the way back when the panel closes, or a new show replaces the card', () => {
    metaOverlayManager.show(request())
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })
    metaOverlayManager.hide()
    metaOverlayManager.show(request())
    expect(pressEscape().preventDefault).toHaveBeenCalledOnce()
    expect(metaOverlayManager.getVisible()).toBe(false)

    metaOverlayManager.show(request())
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })
    // ⌘⇧D over an open panel: the new card opens on its own page, with nothing to go back to.
    metaOverlayManager.show(request({ page: 'flow' }))
    expect(pressEscape().preventDefault).toHaveBeenCalledOnce()
    expect(metaOverlayManager.getVisible()).toBe(false)
  })
})

/**
 * The card's Flow page ends with the transfer action and the target it picked. Main relays the
 * selection to the CoreBox renderer, which dispatches it, and closes the panel at once: there is
 * no picker in CoreBox to hand the window to any more.
 */
describe('MetaOverlayManager Flow selection relay', () => {
  const selection = {
    targetId: 'com.example.notes.append',
    consentToken: 'consent-token-1',
    confirmationToken: 'confirmation-token-1'
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    metaOverlayManager.destroy()
    vi.clearAllMocks()
    mocks.createdMetaWebContents.length = 0
    mocks.createdMetaViews.length = 0
    mocks.windowHeight = 300
    mocks.isResizing.mockReturnValue(false)
    metaOverlayManager.init(mocks.parentWindow as never)
    expect(metaOverlayManager.markRendererReady(mocks.createdMetaWebContents.at(-1)!.id)).toBe(true)
  })

  afterEach(() => {
    // Also drops the plugin action a case registers.
    metaOverlayManager.destroy()
    vi.useRealTimers()
  })

  function request(overrides: Partial<MetaShowRequest> = {}): MetaShowRequest {
    return { item, builtinActions: [], itemActions: [], pluginActions: [], ...overrides }
  }

  function itemActions(): unknown[] {
    return mocks.broadcastToWindow.mock.calls
      .filter(([, event]) => event === CoreBoxEvents.metaOverlay.itemAction)
      .map(([windowId, , payload]) => {
        expect(windowId).toBe(mocks.parentWindow.id)
        return payload
      })
  }

  function heights(): number[] {
    return mocks.setHeight.mock.calls.map(([height]) => height)
  }

  it('relays the selection to CoreBox with the transfer, then closes and hands the height back', async () => {
    metaOverlayManager.show(request({ anchor: 'footer', desiredPanelHeight: 300 }))
    metaOverlayManager.changePage({ page: 'flow', canGoBack: true })

    await expect(
      metaOverlayManager.executeAction(COREBOX_FLOW_TRANSFER_ACTION_ID, item, selection)
    ).resolves.toEqual({ success: true })

    expect(itemActions()).toEqual([
      { actionId: COREBOX_FLOW_TRANSFER_ACTION_ID, item, flow: selection }
    ])
    expect(metaOverlayManager.getVisible()).toBe(false)
    expect(heights()).toEqual([416, 300])
    expect(mocks.parentWindow.webContents.focus).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends no selection with an action that carries none', async () => {
    metaOverlayManager.show(request())

    await metaOverlayManager.executeAction(COREBOX_FLOW_TRANSFER_ACTION_ID, item)

    expect(itemActions()).toEqual([{ actionId: COREBOX_FLOW_TRANSFER_ACTION_ID, item }])
    expect(itemActions()[0]).not.toHaveProperty('flow')
    expect(metaOverlayManager.getVisible()).toBe(false)
  })

  it('tells a plugin action registered under the transfer id that it ran, not what was picked', async () => {
    metaOverlayManager.registerPluginAction('plugin-a', {
      id: COREBOX_FLOW_TRANSFER_ACTION_ID,
      render: { basic: { title: 'Plugin action' } }
    })
    metaOverlayManager.show(request())

    await metaOverlayManager.executeAction(COREBOX_FLOW_TRANSFER_ACTION_ID, item, selection)

    // The tokens are capabilities granted to CoreBox's dispatch; a plugin never receives them.
    expect(mocks.sendToPlugin).toHaveBeenCalledExactlyOnceWith(
      'plugin-a',
      CoreBoxEvents.metaOverlay.actionExecuted,
      { actionId: COREBOX_FLOW_TRANSFER_ACTION_ID, item, pluginId: 'plugin-a' }
    )
    expect(itemActions()).toEqual([])
  })
})
