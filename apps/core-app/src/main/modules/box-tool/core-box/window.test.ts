import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 }
  }

  return {
    display,
    updateMetaOverlayBounds: vi.fn(),
    unregisterPolling: vi.fn(),
    getMainConfig: vi.fn(() => ({})),
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
    sendTo: vi.fn(),
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
    clear: vi.fn()
  }
}))

vi.mock('./web-contents-view-guard', () => ({
  getLiveViewWebContents: vi.fn(() => null)
}))

import { coreBoxManager } from './manager'
import { COREBOX_MIN_HEIGHT, COREBOX_WIDTH, WindowManager } from './window'

describe('WindowManager CoreBox compact bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMainConfig.mockReturnValue({})
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
})
