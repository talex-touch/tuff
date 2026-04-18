import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock, touchEventBusMock, getMainConfigMock } = vi.hoisted(() => ({
  appMock: {
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    setActivationPolicy: vi.fn(),
    getLocale: vi.fn(() => 'en-US'),
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
  }))
}))

vi.mock('electron', async (importOriginal) => {
  const original = await importOriginal<any>()
  const electronModule = original?.default ?? original
  const ipcMain =
    electronModule?.ipcMain ??
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
    Tray: class {},
    ipcMain,
    MessageChannelMain: electronModule?.MessageChannelMain ?? MockMessageChannelMain
  }
})

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

import { TrayManager } from './tray-manager'

describe('TrayManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appMock.on.mockReset()
    appMock.off.mockReset()
    appMock.removeListener.mockReset()
  })

  it('initializes tray runtime even without experimental flag', async () => {
    const trayManager = new TrayManager() as unknown as {
      touchApp: {
        window: {
          window: { on: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
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
          removeListener: vi.fn()
        }
      },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }

    await (trayManager as any).onInit({
      runtime: { app: trayManager.touchApp },
      app: trayManager.touchApp
    })

    expect(trayManager.registerWindowEvents).toHaveBeenCalled()
    expect(trayManager.registerEventListeners).toHaveBeenCalled()
    expect(trayManager.initializeTray).toHaveBeenCalled()
  })

  it('does not throw when activate fires after main window destroyed', () => {
    const mainWindowHandlers: Record<string, (...args: any[]) => void> = {}
    const destroyedWindow = {
      on: vi.fn((eventName: string, handler: (...args: any[]) => void) => {
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
})
