import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../../utils/i18n-helper'

const {
  appMock,
  touchEventBusMock,
  getMainConfigMock,
  getDockIconMock,
  divisionBoxManagerMock,
  trayInstances
} = vi.hoisted(() => ({
  trayInstances: [] as Array<{
    setToolTip: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    setContextMenu: ReturnType<typeof vi.fn>
    getBounds: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }>,
  appMock: {
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    setActivationPolicy: vi.fn(),
    getLocale: vi.fn(() => 'en-US'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    dock: {
      show: vi.fn(),
      hide: vi.fn(),
      setIcon: vi.fn(),
      setBadge: vi.fn()
    }
  },
  touchEventBusMock: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  getMainConfigMock: vi.fn(() => ({
    setup: {
      showTray: true,
      hideDock: false
    },
    window: {
      startSilent: false
    }
  })),
  getDockIconMock: vi.fn(() => ({
    isEmpty: vi.fn(() => false)
  })),
  divisionBoxManagerMock: {
    getActiveSessions: vi.fn<() => unknown[]>(() => [])
  }
}))

vi.mock('electron', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  const electronModule = (original?.default ?? original) as Record<string, unknown>
  const electronRecord = electronModule as {
    ipcMain?: unknown
    MessageChannelMain?: unknown
  }
  const ipcMain =
    electronRecord.ipcMain ??
    ({
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      handle: vi.fn(),
      removeHandler: vi.fn()
    } as const)

  class MockMessagePortMain {
    on = vi.fn()
    once = vi.fn()
    start = vi.fn()
    close = vi.fn()
    postMessage = vi.fn()
    removeListener = vi.fn()
  }

  class MockMessageChannelMain {
    port1 = new MockMessagePortMain()
    port2 = new MockMessagePortMain()
  }

  return {
    ...electronModule,
    app: appMock,
    Menu: {
      buildFromTemplate: vi.fn((template) => template)
    },
    shell: {
      openPath: vi.fn(),
      openExternal: vi.fn()
    },
    Tray: class {
      setToolTip = vi.fn()
      on = vi.fn()
      setContextMenu = vi.fn()
      getBounds = vi.fn(() => ({ x: 0, y: 0, width: 22, height: 22 }))
      destroy = vi.fn()

      constructor() {
        trayInstances.push(this)
      }
    },
    ipcMain,
    MessageChannelMain: electronRecord.MessageChannelMain ?? MockMessageChannelMain
  }
})

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  MicaBrowserWindow: class {},
  useMicaElectron: vi.fn(),
  WIN10: 0
}))

vi.mock('node:process', () => ({
  default: {
    ...process,
    platform: 'darwin'
  }
}))

vi.mock('../../core/eventbus/touch-event', async (importOriginal) => {
  const original = (await importOriginal()) as object
  return {
    ...original,
    touchEventBus: touchEventBusMock
  }
})

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock
}))

vi.mock('../box-tool/core-box/manager', () => ({
  coreBoxManager: {
    trigger: vi.fn()
  }
}))

vi.mock('../division-box/manager', () => ({
  DivisionBoxManager: {
    getInstance: vi.fn(() => divisionBoxManagerMock)
  }
}))

vi.mock('../screenshot-session', () => ({
  screenshotSessionModule: {
    startStandalone: vi.fn(async () => undefined)
  }
}))

vi.mock('./tray-icon-provider', () => ({
  TrayIconProvider: {
    getIcon: vi.fn(() => ({
      isEmpty: vi.fn(() => false),
      setTemplateImage: vi.fn()
    })),
    getIconPath: vi.fn(() => '/tmp/tray-icon.png'),
    getDockIcon: getDockIconMock
  }
}))

import { TrayManager } from './tray-manager'

type TrayManagerOnInitHarness = {
  touchApp: {
    window: {
      window: {
        on: ReturnType<typeof vi.fn>
        removeListener: ReturnType<typeof vi.fn>
        isVisible: ReturnType<typeof vi.fn>
      }
    }
    config: { data: Record<string, unknown> }
    isQuitting: boolean
    version: string
  }
  initializeTray: ReturnType<typeof vi.fn>
  registerWindowEvents: ReturnType<typeof vi.fn>
  registerEventListeners: ReturnType<typeof vi.fn>
  applyActivationPolicy: ReturnType<typeof vi.fn>
  setupDockIcon: ReturnType<typeof vi.fn>
  updateDockVisibility: ReturnType<typeof vi.fn>
  onInit: (ctx: ModuleInitContext<TalexEvents>) => Promise<void>
}

function createInitContext(
  touchApp: TrayManagerOnInitHarness['touchApp']
): ModuleInitContext<TalexEvents> {
  return {
    runtime: { app: touchApp },
    app: touchApp
  } as unknown as ModuleInitContext<TalexEvents>
}

describe('TrayManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trayInstances.length = 0
    appMock.on.mockReset()
    appMock.off.mockReset()
    appMock.removeListener.mockReset()
    divisionBoxManagerMock.getActiveSessions.mockReturnValue([])
    getDockIconMock.mockReturnValue({
      isEmpty: vi.fn(() => false)
    })
    getMainConfigMock.mockReturnValue({
      setup: {
        showTray: true,
        hideDock: false
      },
      window: {
        startSilent: false
      }
    })
  })

  it('initializes tray runtime even without experimental flag', async () => {
    const trayManager = new TrayManager() as unknown as TrayManagerOnInitHarness

    trayManager.initializeTray = vi.fn()
    trayManager.registerWindowEvents = vi.fn()
    trayManager.registerEventListeners = vi.fn()
    trayManager.applyActivationPolicy = vi.fn()
    trayManager.setupDockIcon = vi.fn()
    trayManager.updateDockVisibility = vi.fn()
    trayManager.touchApp = {
      window: {
        window: {
          on: vi.fn(),
          removeListener: vi.fn(),
          isVisible: vi.fn(() => true)
        }
      },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }

    await trayManager.onInit(createInitContext(trayManager.touchApp))

    expect(trayManager.registerWindowEvents).toHaveBeenCalled()
    expect(trayManager.registerEventListeners).toHaveBeenCalled()
    expect(trayManager.initializeTray).toHaveBeenCalled()
  })

  it('captures hidden window state during silent start initialization', async () => {
    const trayManager = new TrayManager() as unknown as TrayManagerOnInitHarness & {
      getRuntimeSettingsSnapshot: () => {
        showTray: boolean
        hideDock: boolean
        available: boolean
        trayReady: boolean
        windowVisible: boolean
      }
    }

    trayManager.initializeTray = vi.fn()
    trayManager.registerWindowEvents = vi.fn()
    trayManager.registerEventListeners = vi.fn()
    trayManager.applyActivationPolicy = vi.fn()
    trayManager.setupDockIcon = vi.fn()
    trayManager.updateDockVisibility = vi.fn()
    trayManager.touchApp = {
      window: {
        window: {
          on: vi.fn(),
          removeListener: vi.fn(),
          isVisible: vi.fn(() => false)
        }
      },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }

    await trayManager.onInit(createInitContext(trayManager.touchApp))

    expect(trayManager.getRuntimeSettingsSnapshot().windowVisible).toBe(false)
  })

  it('updates dock visibility after tray initialization on macOS startup', async () => {
    const trayManager = new TrayManager() as unknown as TrayManagerOnInitHarness

    trayManager.initializeTray = vi.fn()
    trayManager.registerWindowEvents = vi.fn()
    trayManager.registerEventListeners = vi.fn()
    trayManager.applyActivationPolicy = vi.fn()
    trayManager.setupDockIcon = vi.fn()
    trayManager.updateDockVisibility = vi.fn()
    trayManager.touchApp = {
      window: {
        window: {
          on: vi.fn(),
          removeListener: vi.fn(),
          isVisible: vi.fn(() => false)
        }
      },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }

    await trayManager.onInit(createInitContext(trayManager.touchApp))

    expect(trayManager.initializeTray.mock.invocationCallOrder[0]).toBeLessThan(
      trayManager.updateDockVisibility.mock.invocationCallOrder[0]
    )
  })

  it('does not expose clipboard history without a dedicated history window', () => {
    const mainWindow = {
      on: vi.fn(),
      removeListener: vi.fn(),
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      isFocused: vi.fn(() => false),
      webContents: {}
    }
    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof mainWindow }
        channel: unknown
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      menuBuilder: { setTouchApp: (touchApp: unknown) => void }
      initializeTray: () => void
    }

    trayManager.touchApp = {
      window: { window: mainWindow },
      channel: {},
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.menuBuilder.setTouchApp(trayManager.touchApp)

    trayManager.initializeTray()

    const menuLabels = trayInstances[0]?.setContextMenu.mock.calls[0]?.[0].map(
      (item: { label?: string }) => item.label
    )
    expect(menuLabels).not.toContain('Clipboard History')
  })

  it('uses current locale when building tray menu', () => {
    const mainWindow = {
      on: vi.fn(),
      removeListener: vi.fn(),
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      isFocused: vi.fn(() => false),
      webContents: {}
    }
    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof mainWindow }
        channel: unknown
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      menuBuilder: { setTouchApp: (touchApp: unknown) => void }
      initializeTray: () => void
    }

    setLocale('zh-CN')
    trayManager.touchApp = {
      window: { window: mainWindow },
      channel: {},
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.menuBuilder.setTouchApp(trayManager.touchApp)

    trayManager.initializeTray()

    const menuLabels = trayInstances[0]?.setContextMenu.mock.calls[0]?.[0].map(
      (item: { label?: string }) => item.label
    )
    expect(menuLabels).toContain('隐藏主窗口')
    expect(menuLabels).toContain('设置')
  })

  it('uses localized tray tooltip when initializing tray', () => {
    const mainWindow = {
      on: vi.fn(),
      removeListener: vi.fn(),
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      isFocused: vi.fn(() => false),
      webContents: {}
    }
    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof mainWindow }
        channel: unknown
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      menuBuilder: { setTouchApp: (touchApp: unknown) => void }
      initializeTray: () => void
    }

    trayManager.touchApp = {
      window: { window: mainWindow },
      channel: {},
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.menuBuilder.setTouchApp(trayManager.touchApp)

    trayManager.initializeTray()

    expect(trayInstances[0]?.setToolTip).toHaveBeenCalledWith('Tuff')
  })

  it('returns real runtime tray snapshot values', () => {
    const mainWindow = {
      isVisible: vi.fn(() => false)
    }

    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof mainWindow }
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      tray: object | null
      getRuntimeSettingsSnapshot: () => {
        showTray: boolean
        hideDock: boolean
        available: boolean
        trayReady: boolean
        windowVisible: boolean
      }
    }

    trayManager.touchApp = {
      window: { window: mainWindow },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.tray = {}

    expect(trayManager.getRuntimeSettingsSnapshot()).toMatchObject({
      showTray: true,
      hideDock: false,
      available: true,
      trayReady: true,
      windowVisible: false
    })
  })

  it('defaults missing Dock and silent-start booleans to enabled while preserving false', () => {
    const trayManager = new TrayManager() as unknown as {
      getHideDockConfig: () => boolean
      getStartSilentConfig: () => boolean
    }

    getMainConfigMock.mockReturnValue({ setup: {}, window: {} } as never)
    expect(trayManager.getHideDockConfig()).toBe(true)
    expect(trayManager.getStartSilentConfig()).toBe(true)

    getMainConfigMock.mockReturnValue({
      setup: { hideDock: false },
      window: { startSilent: false }
    } as never)
    expect(trayManager.getHideDockConfig()).toBe(false)
    expect(trayManager.getStartSilentConfig()).toBe(false)
  })

  it('does not throw when activate fires after main window destroyed', () => {
    const mainWindowHandlers: Record<string, (...args: unknown[]) => void> = {}
    const destroyedWindow = {
      on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
        mainWindowHandlers[eventName] = handler
      }),
      removeListener: vi.fn(),
      isDestroyed: vi.fn(() => true),
      isVisible: vi.fn(() => {
        throw new Error('isVisible should not be called for destroyed window')
      }),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn()
    }

    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof destroyedWindow }
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      registerWindowEvents: () => void
    }
    trayManager.touchApp = {
      window: { window: destroyedWindow },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.registerWindowEvents()

    const activateHandler = appMock.on.mock.calls.find(
      ([eventName]) => eventName === 'activate'
    )?.[1]
    expect(activateHandler).toBeTypeOf('function')
    expect(() => activateHandler?.()).not.toThrow()
  })

  it('sets Dock icon with a loadable native image on macOS', () => {
    const dockIcon = { isEmpty: vi.fn(() => false) }
    getDockIconMock.mockReturnValue(dockIcon)
    const trayManager = new TrayManager() as unknown as {
      touchApp: { version: string }
      setupDockIcon: () => void
    }
    trayManager.touchApp = { version: 'release' }

    trayManager.setupDockIcon()

    expect(appMock.dock.setIcon).toHaveBeenCalledWith(dockIcon)
  })

  it('skips Dock icon setup when no loadable image is available', () => {
    getDockIconMock.mockReturnValue({ isEmpty: vi.fn(() => true) })
    const trayManager = new TrayManager() as unknown as {
      touchApp: { version: string }
      setupDockIcon: () => void
    }
    trayManager.touchApp = { version: 'release' }

    trayManager.setupDockIcon()

    expect(appMock.dock.setIcon).not.toHaveBeenCalled()
  })

  it('refreshes Dock visibility for every lifecycle change of a created non-main window', () => {
    const mainWindow = {
      on: vi.fn(),
      removeListener: vi.fn(),
      isVisible: vi.fn(() => false),
      isDestroyed: vi.fn(() => false)
    }
    const secondaryWindowHandlers: Record<string, () => void> = {}
    const secondaryWindow = {
      on: vi.fn((eventName: string, handler: () => void) => {
        secondaryWindowHandlers[eventName] = handler
      }),
      removeListener: vi.fn(),
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false)
    }
    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: { window: typeof mainWindow }
        config: { data: Record<string, unknown> }
        isQuitting: boolean
        version: string
      }
      registerWindowEvents: () => void
      updateDockVisibility: ReturnType<typeof vi.fn>
    }

    trayManager.touchApp = {
      window: { window: mainWindow },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }
    trayManager.updateDockVisibility = vi.fn()
    trayManager.registerWindowEvents()

    const browserWindowCreatedHandler = appMock.on.mock.calls.find(
      ([eventName]) => eventName === 'browser-window-created'
    )?.[1]
    expect(browserWindowCreatedHandler).toBeTypeOf('function')

    browserWindowCreatedHandler?.({}, secondaryWindow)

    expect(secondaryWindow.on).toHaveBeenCalledWith('show', expect.any(Function))
    expect(secondaryWindow.on).toHaveBeenCalledWith('hide', expect.any(Function))
    expect(secondaryWindow.on).toHaveBeenCalledWith('closed', expect.any(Function))

    secondaryWindowHandlers.show()
    expect(trayManager.updateDockVisibility).toHaveBeenCalledTimes(1)
    secondaryWindowHandlers.hide()
    expect(trayManager.updateDockVisibility).toHaveBeenCalledTimes(2)
    secondaryWindowHandlers.closed()
    expect(trayManager.updateDockVisibility).toHaveBeenCalledTimes(3)
  })

  it.each([
    {
      name: 'an alive visible window',
      session: {
        getWindow: vi.fn(() => ({
          window: {
            isDestroyed: vi.fn(() => false),
            isVisible: vi.fn(() => true)
          }
        }))
      },
      dockVisible: true
    },
    {
      name: 'a hidden window',
      session: {
        getWindow: vi.fn(() => ({
          window: {
            isDestroyed: vi.fn(() => false),
            isVisible: vi.fn(() => false)
          }
        }))
      },
      dockVisible: false
    },
    {
      name: 'a destroyed window',
      session: {
        getWindow: vi.fn(() => ({
          window: {
            isDestroyed: vi.fn(() => true),
            isVisible: vi.fn(() => true)
          }
        }))
      },
      dockVisible: false
    },
    {
      name: 'no window',
      session: {
        getWindow: vi.fn(() => undefined)
      },
      dockVisible: false
    }
  ])(
    'keeps the Dock visible only for DivisionBox sessions with $name',
    ({ session, dockVisible }) => {
      const mainWindow = {
        isVisible: vi.fn(() => false),
        isDestroyed: vi.fn(() => false)
      }
      const trayManager = new TrayManager() as unknown as {
        touchApp: {
          window: { window: typeof mainWindow }
          config: { data: Record<string, unknown> }
          isQuitting: boolean
          version: string
        }
        tray: object | null
        updateDockVisibility: () => void
      }

      getMainConfigMock.mockReturnValue({
        setup: { showTray: true, hideDock: true },
        window: { startSilent: false }
      })
      divisionBoxManagerMock.getActiveSessions.mockReturnValue([session])
      trayManager.touchApp = {
        window: { window: mainWindow },
        config: { data: {} },
        isQuitting: false,
        version: 'dev'
      }
      trayManager.tray = {}

      trayManager.updateDockVisibility()

      if (dockVisible) {
        expect(appMock.dock.show).toHaveBeenCalledTimes(1)
        expect(appMock.dock.hide).not.toHaveBeenCalled()
      } else {
        expect(appMock.dock.hide).toHaveBeenCalledTimes(1)
        expect(appMock.dock.show).not.toHaveBeenCalled()
      }
    }
  )
})
