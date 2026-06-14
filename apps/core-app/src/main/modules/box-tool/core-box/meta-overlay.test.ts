import type { TuffItem } from '@talex-touch/utils/core-box'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendTo: vi.fn(async () => undefined),
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
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendTo: mocks.sendTo,
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
      addListener: vi.fn(),
      on: vi.fn(),
      isLoading: vi.fn(() => false),
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      focus: vi.fn()
    }

    setBounds = vi.fn()
    setBackgroundColor = vi.fn()
    setVisible = vi.fn()
    getVisible = vi.fn(() => true)
  }
}))

import { CoreBoxEvents, CoreBoxRetainedEvents } from '@talex-touch/utils/transport/events'
import { metaOverlayManager } from './meta-overlay'

const item = {
  id: 'app-1',
  kind: 'app',
  source: { id: 'apps', type: 'application' },
  render: { basic: { title: 'App' } },
  meta: { app: { path: '/Applications/App.app' } }
} as TuffItem

describe('MetaOverlayManager action execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    metaOverlayManager.unregisterPluginActions('plugin-a')
  })

  it('bridges builtin actions to the CoreBox renderer action pipeline', async () => {
    const result = await metaOverlayManager.executeAction('reveal-in-finder', item)

    expect(result).toEqual({ success: true })
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
    expect(mocks.sendTo).toHaveBeenCalledWith(
      mocks.coreBoxWindow.window.webContents,
      CoreBoxEvents.metaOverlay.itemAction,
      { actionId: 'reveal-in-finder', item }
    )
    expect(mocks.sendTo).toHaveBeenCalledWith(
      mocks.coreBoxWindow.window.webContents,
      CoreBoxRetainedEvents.legacy.metaOverlayItemAction,
      { actionId: 'reveal-in-finder', item }
    )
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
    expect(mocks.sendTo).not.toHaveBeenCalledWith(
      mocks.coreBoxWindow.window.webContents,
      CoreBoxEvents.metaOverlay.itemAction,
      expect.anything()
    )
    expect(mocks.sendToPlugin).toHaveBeenCalledWith(
      'plugin-a',
      CoreBoxEvents.metaOverlay.actionExecuted,
      { actionId: 'plugin-action', item, pluginId: 'plugin-a' }
    )
    expect(mocks.sendToPlugin).toHaveBeenCalledWith(
      'plugin-a',
      CoreBoxRetainedEvents.legacy.metaOverlayActionExecuted,
      { actionId: 'plugin-action', item, pluginId: 'plugin-a' }
    )
  })

  it('returns a failure when action execution has no item context', async () => {
    const result = await metaOverlayManager.executeAction('toggle-pin')

    expect(result).toEqual({ success: false, error: 'Missing item context' })
    expect(mocks.sendTo).not.toHaveBeenCalled()
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
  })
})
