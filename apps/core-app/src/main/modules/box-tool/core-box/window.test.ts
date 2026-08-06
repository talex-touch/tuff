import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 }
  }

  return {
    display,
    captureForegroundAppSnapshot: vi.fn(),
    updateMetaOverlayBounds: vi.fn(),
    unregisterPolling: vi.fn(),
    getMainConfig: vi.fn(() => ({})),
    attachExistingUIView: vi.fn(),
    releaseExistingUIView: vi.fn(),
    createSessionWithoutUI: vi.fn(),
    destroySession: vi.fn(),
    enforcePermission: vi.fn(),
    relinquishCachedView: vi.fn(),
    restoreCachedView: vi.fn(),
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
    }
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    focus: vi.fn()
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn()
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayMatching: vi.fn(() => mocks.display),
    getDisplayNearestPoint: vi.fn(() => mocks.display),
    getPrimaryDisplay: vi.fn(() => mocks.display)
  },
  WebContentsView: class WebContentsView {}
}))

vi.mock('@talex-touch/utils', () => ({
  DivisionBoxErrorCode: {
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    STATE_ERROR: 'STATE_ERROR'
  },
  sleep: vi.fn(async () => undefined),
  StorageList: {
    APP_SETTING: 'app-setting'
  }
}))

vi.mock('@talex-touch/utils/animation/window-node', () => ({
  useWindowAnimation: vi.fn(() => ({
    changeWindow: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      start: vi.fn(),
      register: vi.fn(),
      unregister: mocks.unregisterPolling
    }))
  }
}))

vi.mock('@talex-touch/utils/plugin', () => ({
  PluginStatus: {
    ACTIVE: 'active',
    RUNNING: 'running'
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    broadcastToWindow: vi.fn(),
    sendTo: vi.fn(async () => undefined),
    sendToPlugin: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/transport/events', () => ({
  CoreBoxEvents: {
    ui: {
      trigger: 'core-box:ui:trigger',
      shortcutTriggered: 'core-box:ui:shortcut-triggered'
    },
    input: {
      change: 'core-box:input:change'
    }
  },
  PluginEvents: {}
}))

vi.mock('@talex-touch/utils/transport/prelude', () => ({
  getPluginChannelPreludeCode: vi.fn(() => '')
}))

vi.mock('../../../config/default', () => ({
  BoxWindowOption: {}
}))

vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: vi.fn(() => ({
    app: { channel: {}, version: 'dev' },
    channel: {}
  }))
}))

vi.mock('../../../core/window-security-profile', () => ({
  buildWindowWebPreferences: vi.fn((_: string, options: unknown) => options)
}))

vi.mock('../../../../shared/theme/theme-mode', () => ({
  resolveThemeStateFromStyle: vi.fn(() => ({ dark: false }))
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  CoreBoxWindowHiddenEvent: class CoreBoxWindowHiddenEvent {},
  CoreBoxWindowShownEvent: class CoreBoxWindowShownEvent {},
  TalexEvents: {
    COREBOX_WINDOW_HIDDEN: 'corebox/window-hidden',
    COREBOX_WINDOW_SHOWN: 'corebox/window-shown'
  },
  touchEventBus: {
    emit: vi.fn()
  }
}))

vi.mock('../../../core/touch-window', () => ({
  TouchWindow: class TouchWindow {}
}))

vi.mock('../../../hooks/use-electron-guard', () => ({
  useAliveWebContents: vi.fn((target: unknown) => target)
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../division-box/manager', () => ({
  DivisionBoxManager: {
    getInstance: vi.fn(() => ({
      createSessionWithoutUI: mocks.createSessionWithoutUI,
      destroySession: mocks.destroySession
    }))
  }
}))

vi.mock('../../permission', () => ({
  getPermissionModule: vi.fn(() => ({
    enforcePermission: mocks.enforcePermission
  }))
}))

vi.mock('../../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('../../plugin/runtime/plugin-injections', () => ({
  usePluginInjections: vi.fn(() => ({}))
}))

vi.mock('../../plugin/runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: vi.fn(() => ({}))
}))

vi.mock('../../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  subscribeMainConfig: vi.fn(() => vi.fn())
}))

vi.mock('../item-sdk', () => ({
  getBoxItemManager: vi.fn(() => ({
    getItems: vi.fn(() => [])
  }))
}))

vi.mock('./manager', () => ({
  coreBoxManager: {
    showCoreBox: false,
    isUIMode: false,
    trigger: vi.fn(),
    exitUIMode: vi.fn(),
    syncVisibility: vi.fn()
  }
}))

vi.mock('./meta-overlay', () => ({
  metaOverlayManager: {
    updateBounds: mocks.updateMetaOverlayBounds,
    init: vi.fn(),
    destroy: vi.fn()
  }
}))

vi.mock('./theme/tuff-element.css?raw', () => ({
  default: ''
}))

vi.mock('./view-cache', () => ({
  viewCacheManager: {
    get: vi.fn(() => null),
    set: vi.fn(),
    clear: vi.fn(),
    relinquish: mocks.relinquishCachedView,
    restore: mocks.restoreCachedView
  }
}))

vi.mock('./web-contents-view-guard', () => ({
  getLiveViewWebContents: vi.fn(() => null)
}))

vi.mock('../../system/foreground-app-snapshot', () => ({
  captureForegroundAppSnapshot: mocks.captureForegroundAppSnapshot
}))

import { app } from 'electron'
import { coreBoxManager } from './manager'
import { COREBOX_MIN_HEIGHT, COREBOX_WIDTH, WindowManager } from './window'

describe('WindowManager CoreBox compact bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMainConfig.mockReturnValue({})
    mocks.createSessionWithoutUI.mockResolvedValue({
      sessionId: 'division-session',
      meta: { pluginId: 'demo-plugin' },
      getState: vi.fn(() => 'active'),
      attachExistingUIView: mocks.attachExistingUIView,
      releaseExistingUIView: mocks.releaseExistingUIView
    })
    mocks.releaseExistingUIView.mockReturnValue('released')
    mocks.destroySession.mockResolvedValue(undefined)
    mocks.relinquishCachedView.mockReturnValue({ cacheKey: 'demo-plugin:feature' })
    mocks.restoreCachedView.mockReturnValue(true)
  })

  it('applies compact bounds even when the CoreBox window is hidden', () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => false),
      isResizable: vi.fn(() => false),
      setResizable: vi.fn(),
      getBounds: vi.fn(() => ({ x: 600, y: 260, width: 720, height: 240 })),
      setMinimumSize: vi.fn(),
      setBounds: vi.fn(),
      getMinimumSize: vi.fn(() => [720, COREBOX_MIN_HEIGHT])
    }

    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    manager.shrink()

    expect(browserWindow.setMinimumSize).toHaveBeenCalledWith(COREBOX_WIDTH, COREBOX_MIN_HEIGHT)
    expect(browserWindow.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        width: COREBOX_WIDTH,
        height: COREBOX_MIN_HEIGHT
      }),
      false
    )
    expect(mocks.updateMetaOverlayBounds).toHaveBeenCalled()
    expect(browserWindow.setResizable).toHaveBeenNthCalledWith(1, true)
    expect(browserWindow.setResizable).toHaveBeenLastCalledWith(false)
  })

  it('snapshots the foreground app before the shortcut show steals focus', () => {
    vi.useFakeTimers()
    try {
      const manager = new WindowManager()
      const order: string[] = []
      mocks.captureForegroundAppSnapshot.mockImplementation(() => order.push('snapshot'))
      vi.mocked(app.focus).mockImplementation(() => order.push('app-focus') as unknown as void)
      const browserWindow = {
        id: 7,
        webContents: { id: 8 },
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        isResizable: vi.fn(() => false),
        setResizable: vi.fn(),
        getBounds: vi.fn(() => ({ x: 600, y: 260, width: 720, height: 240 })),
        getSize: vi.fn(() => [720, 240]),
        setMinimumSize: vi.fn(),
        setBounds: vi.fn(),
        getMinimumSize: vi.fn(() => [720, COREBOX_MIN_HEIGHT]),
        show: vi.fn(() => order.push('show')),
        showInactive: vi.fn(() => order.push('show-inactive')),
        moveTop: vi.fn(),
        focus: vi.fn()
      }

      manager.windows = [
        {
          window: browserWindow
        } as unknown as WindowManager['windows'][number]
      ]

      manager.show(true)

      expect(order).toEqual(['snapshot', 'app-focus', 'show'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-centers and restores compact width when stale bounds already have compact height', () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => false),
      isResizable: vi.fn(() => false),
      setResizable: vi.fn(),
      getBounds: vi.fn(() => ({ x: 500, y: 260, width: 920, height: COREBOX_MIN_HEIGHT })),
      setMinimumSize: vi.fn(),
      setBounds: vi.fn(),
      getMinimumSize: vi.fn(() => [COREBOX_WIDTH, COREBOX_MIN_HEIGHT])
    }

    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    manager.shrink()

    expect(browserWindow.setBounds).toHaveBeenCalledWith(
      {
        x: 600,
        y: 260,
        width: COREBOX_WIDTH,
        height: COREBOX_MIN_HEIGHT
      },
      false
    )
  })

  it('does not hide when a transient blur regains focus before confirmation', async () => {
    vi.useFakeTimers()
    try {
      const manager = new WindowManager()
      let focused = false
      const browserWindow = {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        isFocused: vi.fn(() => focused)
      }
      const touchWindow = {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]

      manager.windows = [touchWindow]
      ;(
        manager as unknown as {
          scheduleBlurHide: (window: WindowManager['windows'][number]) => void
        }
      ).scheduleBlurHide(touchWindow)

      focused = true
      await vi.advanceTimersByTimeAsync(130)

      expect(coreBoxManager.trigger).not.toHaveBeenCalledWith(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides after blur remains unfocused through confirmation', async () => {
    vi.useFakeTimers()
    try {
      const manager = new WindowManager()
      const browserWindow = {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        isFocused: vi.fn(() => false)
      }
      const touchWindow = {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]

      manager.windows = [touchWindow]
      ;(
        manager as unknown as {
          scheduleBlurHide: (window: WindowManager['windows'][number]) => void
        }
      ).scheduleBlurHide(touchWindow)

      await vi.advanceTimersByTimeAsync(130)

      expect(coreBoxManager.trigger).toHaveBeenCalledWith(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('transfers the owned plugin view into DivisionBox without renderer plugin identity', async () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 200, y: 100, width: 720, height: 600 }))
    }
    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    const view = {} as Electron.WebContentsView
    const plugin = {
      name: 'demo-plugin',
      sdkapi: 2,
      icon: { value: 'i-ri-apps-line' }
    }
    vi.spyOn(manager, 'getAttachedPlugin').mockReturnValue(plugin as never)
    vi.spyOn(manager, 'extractUIView').mockReturnValue({
      view,
      plugin: plugin as never
    })
    const restore = vi.spyOn(manager, 'restoreExtractedUIView')

    const response = await manager.detachUIViewToDivisionBox('current query')

    expect(mocks.enforcePermission).toHaveBeenCalledWith(
      'demo-plugin',
      'division-box:session:open',
      2
    )
    expect(mocks.createSessionWithoutUI).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'plugin://demo-plugin/index.html',
        pluginId: 'demo-plugin',
        ui: { showInput: true, initialInput: 'current query' },
        initialBounds: { width: 720, height: 544 }
      })
    )
    expect(mocks.attachExistingUIView).toHaveBeenCalledWith(view, plugin)
    expect(mocks.relinquishCachedView).toHaveBeenCalledWith(plugin, view, undefined)
    expect(mocks.restoreCachedView).not.toHaveBeenCalled()
    expect(coreBoxManager.exitUIMode).toHaveBeenCalledTimes(1)
    expect(coreBoxManager.trigger).toHaveBeenCalledWith(false, { immediate: true })
    expect(restore).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      success: true,
      data: { sessionId: 'division-session' }
    })
  })

  it('rejects permission before changing plugin view ownership', async () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 200, y: 100, width: 720, height: 600 }))
    }
    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    const plugin = { name: 'demo-plugin', sdkapi: 2 }
    vi.spyOn(manager, 'getAttachedPlugin').mockReturnValue(plugin as never)
    const extract = vi.spyOn(manager, 'extractUIView')
    const restore = vi.spyOn(manager, 'restoreExtractedUIView')
    mocks.enforcePermission.mockImplementationOnce(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' })
    })

    const response = await manager.detachUIViewToDivisionBox()

    expect(extract).not.toHaveBeenCalled()
    expect(mocks.relinquishCachedView).not.toHaveBeenCalled()
    expect(mocks.createSessionWithoutUI).not.toHaveBeenCalled()
    expect(restore).not.toHaveBeenCalled()
    expect(coreBoxManager.exitUIMode).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Permission denied'
      }
    })
  })

  it('restores the extracted view when DivisionBox session creation fails', async () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 200, y: 100, width: 720, height: 600 }))
    }
    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    const view = {} as Electron.WebContentsView
    const plugin = { name: 'demo-plugin', sdkapi: 2 }
    vi.spyOn(manager, 'getAttachedPlugin').mockReturnValue(plugin as never)
    const extracted = {
      view,
      plugin: plugin as never
    }
    vi.spyOn(manager, 'extractUIView').mockReturnValue(extracted)
    const restore = vi.spyOn(manager, 'restoreExtractedUIView').mockReturnValue(true)
    mocks.createSessionWithoutUI.mockRejectedValueOnce(new Error('Session creation failed'))

    const response = await manager.detachUIViewToDivisionBox()

    expect(restore).toHaveBeenCalledWith(extracted)
    expect(mocks.restoreCachedView).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: 'demo-plugin:feature' })
    )
    expect(mocks.destroySession).not.toHaveBeenCalled()
    expect(coreBoxManager.exitUIMode).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: {
        code: 'STATE_ERROR',
        message: 'Session creation failed'
      }
    })
  })

  it('releases and destroys a partially attached DivisionBox before restoring CoreBox', async () => {
    const manager = new WindowManager()
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 200, y: 100, width: 720, height: 600 }))
    }
    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    const view = {
      webContents: {
        isDestroyed: vi.fn(() => false),
        close: vi.fn()
      }
    } as unknown as Electron.WebContentsView
    const plugin = { name: 'demo-plugin', sdkapi: 2 }
    const extracted = { view, plugin: plugin as never }
    vi.spyOn(manager, 'getAttachedPlugin').mockReturnValue(plugin as never)
    vi.spyOn(manager, 'extractUIView').mockReturnValue(extracted)
    const restore = vi.spyOn(manager, 'restoreExtractedUIView').mockReturnValue(true)
    mocks.attachExistingUIView.mockRejectedValueOnce(new Error('Partial attach failed'))

    const response = await manager.detachUIViewToDivisionBox()

    expect(mocks.releaseExistingUIView).toHaveBeenCalledWith(view)
    expect(mocks.destroySession).toHaveBeenCalledWith('division-session')
    expect(restore).toHaveBeenCalledWith(extracted)
    expect(mocks.restoreCachedView).toHaveBeenCalledTimes(1)
    expect(mocks.releaseExistingUIView.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.destroySession.mock.invocationCallOrder[0]
    )
    expect(mocks.destroySession.mock.invocationCallOrder[0]).toBeLessThan(
      restore.mock.invocationCallOrder[0]
    )
    expect(restore.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.restoreCachedView.mock.invocationCallOrder[0]
    )
    expect(view.webContents.close).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: {
        code: 'STATE_ERROR',
        message: 'Partial attach failed'
      }
    })
  })

  it('does not restore a view when DivisionBox cannot release ownership', async () => {
    const manager = new WindowManager()
    const pluginViewController = Reflect.get(manager, 'pluginViewController') as {
      enableInputMonitoring: () => void
      enableClipboardMonitoring: (types: number) => void
      getClipboardAllowedTypes: () => number
    }
    pluginViewController.enableInputMonitoring()
    pluginViewController.enableClipboardMonitoring(7)

    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 200, y: 100, width: 720, height: 600 }))
    }
    manager.windows = [
      {
        window: browserWindow
      } as unknown as WindowManager['windows'][number]
    ]

    const view = {
      webContents: {
        isDestroyed: vi.fn(() => false),
        close: vi.fn()
      }
    } as unknown as Electron.WebContentsView
    const plugin = { name: 'demo-plugin', sdkapi: 2 }
    vi.spyOn(manager, 'getAttachedPlugin').mockReturnValue(plugin as never)
    vi.spyOn(manager, 'extractUIView').mockReturnValue({ view, plugin: plugin as never })
    const restore = vi.spyOn(manager, 'restoreExtractedUIView')
    mocks.attachExistingUIView.mockRejectedValueOnce(new Error('Partial attach failed'))
    mocks.releaseExistingUIView.mockReturnValueOnce('failed')

    const response = await manager.detachUIViewToDivisionBox()

    expect(mocks.destroySession).toHaveBeenCalledWith('division-session')
    expect(restore).not.toHaveBeenCalled()
    expect(mocks.restoreCachedView).not.toHaveBeenCalled()
    expect(coreBoxManager.exitUIMode).toHaveBeenCalledTimes(1)
    expect(Reflect.get(pluginViewController, 'inputAllowed')).toBe(false)
    expect(pluginViewController.getClipboardAllowedTypes()).toBe(0)
    expect(view.webContents.close).toHaveBeenCalledTimes(1)
    expect(response.success).toBe(false)
  })
})
