import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = {
  on: vi.fn(),
  off: vi.fn(),
  removeListener: vi.fn(),
  setActivationPolicy: vi.fn(),
  isPackaged: false,
  dock: {
    show: vi.fn(),
    hide: vi.fn(),
    setIcon: vi.fn(),
    setBadge: vi.fn()
  }
}

vi.mock('electron', () => ({
  app: appMock,
  Tray: class {}
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
    touchEventBus: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
  }
})

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => ({
    setup: {
      showTray: true,
      experimentalTray: true,
      hideDock: false
    },
    window: {
      startSilent: false
    }
  }))
}))

import { TrayManager } from './tray-manager'

describe('TrayManager', () => {
  beforeEach(() => {
    appMock.on.mockReset()
    appMock.off.mockReset()
    appMock.removeListener.mockReset()
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

    ;(globalThis as typeof globalThis & { $app: any }).$app = {
      window: { window: destroyedWindow },
      config: { data: {} },
      isQuitting: false,
      version: 'dev'
    }

    const trayManager = new TrayManager() as unknown as {
      registerWindowEvents: () => void
    }
    trayManager.registerWindowEvents()

    const activateHandler = appMock.on.mock.calls.find(
      ([eventName]) => eventName === 'activate'
    )?.[1]
    expect(activateHandler).toBeTypeOf('function')
    expect(() => activateHandler?.()).not.toThrow()
  })
})
