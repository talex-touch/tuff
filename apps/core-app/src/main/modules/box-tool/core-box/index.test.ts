import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const callOrder: string[] = []

  return {
    callOrder,
    clearRegisteredMainRuntime: vi.fn(() => {
      callOrder.push('clear-runtime')
    }),
    registerMainRuntime: vi.fn((_: string, runtime: unknown) => runtime),
    resolveMainRuntime: vi.fn(() => ({
      moduleManager: {
        loadModule: vi.fn(async () => undefined)
      },
      transport: {
        on: vi.fn(() => () => {})
      },
      app: {}
    })),
    getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
    showCoreBox: false,
    isCollapsed: false,
    coreBoxManagerTrigger: vi.fn(),
    ensureCreated: vi.fn(async (): Promise<void> => {}),
    getCurScreen: vi.fn(() => ({ id: 1 })),
    updatePosition: vi.fn(),
    setHeight: vi.fn(),
    markExpanded: vi.fn(),
    // Mirrors MetaOverlayManager.holdLayoutUpdate: holds while a panel is open, keeping the latest.
    metaOverlayVisible: false,
    heldLayoutReplay: null as null | (() => void),
    holdLayoutUpdate: vi.fn((replay: () => void): boolean => {
      if (!mocks.metaOverlayVisible) return false
      mocks.heldLayoutReplay = replay
      return true
    }),
    stopAppSettingSubscription: vi.fn(),
    currentWindow: null as null | {
      window: {
        isDestroyed: () => boolean
        isVisible: () => boolean
        isFocused: () => boolean
        webContents?: { id: number }
      }
    },
    windows: [] as Array<{
      window: {
        isDestroyed: () => boolean
        isVisible: () => boolean
        isFocused: () => boolean
        webContents: { id: number }
      }
    }>,
    registerMainShortcut: vi.fn(
      (_id: string, _defaultAccelerator: string, _callback: () => void, _options?: unknown) => true
    ),
    unregisterMainShortcut: vi.fn((id: string) => {
      callOrder.push(`unregister:${id}`)
      return true
    }),
    searchLoggerDestroy: vi.fn(() => {
      callOrder.push('search-logger-destroy')
    }),
    ipcRegister: vi.fn(),
    ipcUnregister: vi.fn(() => {
      callOrder.push('ipc-unregister')
    }),
    coreBoxManagerDestroy: vi.fn(() => {
      callOrder.push('core-box-manager-destroy')
    }),
    disposeLagBurst: vi.fn(() => {
      callOrder.push('dispose-lag-burst')
    }),
    disposeTransport: vi.fn(() => {
      callOrder.push('dispose-transport')
    }),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      child: vi.fn(() => ({
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn()
      }))
    }
  }
})

vi.mock('../../../core/runtime-accessor', () => ({
  clearRegisteredMainRuntime: mocks.clearRegisteredMainRuntime,
  getRegisteredMainRuntime: vi.fn(),
  maybeGetRegisteredMainRuntime: vi.fn(() => null),
  registerMainRuntime: mocks.registerMainRuntime,
  resolveMainRuntime: mocks.resolveMainRuntime
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../../utils/dev-process-manager', () => ({
  devProcessManager: {
    isShuttingDownProcess: vi.fn(() => false)
  }
}))

vi.mock('../../../utils/perf-monitor', () => ({
  perfMonitor: {
    onSevereLagBurst: vi.fn(() => () => {})
  }
}))

vi.mock('../../abstract-base-module', () => ({
  BaseModule: class {
    constructor() {
      //
    }
  }
}))

vi.mock('../../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: mocks.registerMainShortcut,
    unregisterMainShortcut: mocks.unregisterMainShortcut
  }
}))

vi.mock('../../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  onboardingGate: {
    evaluate: vi.fn(() => ({ state: 'allowed' }))
  }
}))

vi.mock('../search-engine/search-core', () => ({
  default: class SearchEngineCore {},
  SearchEngineCore: class SearchEngineCore {
    static getInstance() {
      return {}
    }
  }
}))

vi.mock('../search-engine/search-logger', () => ({
  searchLogger: {
    init: vi.fn(),
    destroy: mocks.searchLoggerDestroy,
    enableBurst: vi.fn(),
    isEnabled: vi.fn(() => false),
    logSearchPhase: vi.fn()
  }
}))

vi.mock('./ipc', () => ({
  ipcManager: {
    register: mocks.ipcRegister,
    unregister: mocks.ipcUnregister
  }
}))

vi.mock('./manager', () => ({
  coreBoxManager: {
    destroy: mocks.coreBoxManagerDestroy,
    trigger: mocks.coreBoxManagerTrigger,
    markExpanded: mocks.markExpanded,
    get isCollapsed() {
      return mocks.isCollapsed
    },
    get showCoreBox() {
      return mocks.showCoreBox
    }
  }
}))

vi.mock('./meta-overlay', () => ({
  metaOverlayManager: {
    holdLayoutUpdate: mocks.holdLayoutUpdate
  }
}))

vi.mock('./window', () => ({
  COREBOX_MIN_HEIGHT: 56,
  windowManager: {
    create: vi.fn(),
    ensureCreated: mocks.ensureCreated,
    getCurScreen: mocks.getCurScreen,
    updatePosition: mocks.updatePosition,
    setHeight: mocks.setHeight,
    stopAppSettingSubscription: mocks.stopAppSettingSubscription,
    get windows() {
      return mocks.windows
    },
    get current() {
      return mocks.currentWindow
    }
  }
}))

import { CoreBoxModule } from './index'

describe('CoreBoxModule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'))
    mocks.callOrder.length = 0
    mocks.showCoreBox = false
    mocks.isCollapsed = false
    mocks.currentWindow = null
    mocks.windows = []
    mocks.metaOverlayVisible = false
    mocks.heldLayoutReplay = null
    mocks.getMainConfig.mockReturnValue({ beginner: { init: true } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the hidden CoreBox renderer before registering its shortcut', async () => {
    let resolveCreation!: () => void
    let markEnsureStarted!: () => void
    const ensureStarted = new Promise<void>((resolve) => {
      markEnsureStarted = resolve
    })
    const creation = new Promise<void>((resolve) => {
      resolveCreation = resolve
    })
    mocks.ensureCreated.mockImplementationOnce(() => {
      markEnsureStarted()
      return creation
    })

    const module = new CoreBoxModule()
    const initialization = module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])
    let initializationCompleted = false
    void initialization.then(() => {
      initializationCompleted = true
    })

    const nextStage = await Promise.race([
      ensureStarted.then(() => 'ensure-started' as const),
      initialization.then(() => 'initialization-completed' as const)
    ])

    expect(nextStage).toBe('ensure-started')
    expect(mocks.ensureCreated).toHaveBeenCalledTimes(1)
    expect(initializationCompleted).toBe(false)
    expect(mocks.registerMainShortcut).not.toHaveBeenCalled()

    resolveCreation()
    await initialization

    expect(initializationCompleted).toBe(true)
    expect(mocks.ensureCreated).toHaveBeenCalledTimes(1)
    expect(mocks.registerMainShortcut).toHaveBeenCalledTimes(1)
  })

  it('registers only core.box.toggle as enabled by default', async () => {
    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    expect(mocks.registerMainShortcut).toHaveBeenCalledTimes(1)
    expect(mocks.registerMainShortcut).toHaveBeenCalledWith(
      'core.box.toggle',
      'Alt+Space',
      expect.any(Function),
      expect.objectContaining({ enabled: true })
    )
  })

  it('moves the old ⌘E default to ⌥Space, and asks for a notice rather than a stand-in', async () => {
    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    const options = mocks.registerMainShortcut.mock.calls[0]?.[3] as Record<string, unknown>
    // ⌘E survives only as the old default to move away from.
    expect(options.legacyDefaultAccelerators).toEqual(['CommandOrControl+E'])
    // When ⌥Space cannot be had, CoreBox has no key and the user is told why; nothing stands in.
    expect(options.unavailableNotice).toEqual({
      titleKey: 'notifications.coreBoxShortcutUnavailableTitle',
      refusedBodyKey: 'notifications.coreBoxShortcutRefusedBody',
      conflictBodyKey: 'notifications.coreBoxShortcutConflictBody',
      conflictNamedBodyKey: 'notifications.coreBoxShortcutConflictNamedBody'
    })
    expect(Object.keys(options).sort()).toEqual([
      'enabled',
      'legacyDefaultAccelerators',
      'owner',
      'unavailableNotice'
    ])
  })

  it('registers the CoreBox IPC handlers during init', async () => {
    // Before #524 this happened inside coreBoxManager.init(); the wiring now lives here. If it is
    // dropped, no CoreBox IPC handler is ever registered and the launcher stops responding —
    // with nothing throwing to say so.
    const module = new CoreBoxModule()

    expect(mocks.ipcRegister).not.toHaveBeenCalled()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    expect(mocks.ipcRegister).toHaveBeenCalledTimes(1)
  })

  it('opens CoreBox when manager state is stale but real window is hidden', async () => {
    mocks.showCoreBox = true
    mocks.currentWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => false,
        isFocused: () => false
      }
    }

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    const toggleRegistration = mocks.registerMainShortcut.mock.calls.find(
      ([id]) => id === 'core.box.toggle'
    )
    const toggleHandler = toggleRegistration?.[2] as (() => void) | undefined

    expect(toggleHandler).toBeDefined()
    toggleHandler?.()

    expect(mocks.coreBoxManagerTrigger).toHaveBeenCalledWith(true, {
      triggeredByShortcut: true
    })
    expect(mocks.coreBoxManagerTrigger).not.toHaveBeenCalledWith(false)
  })

  it('hides CoreBox when visible on the same screen even if it is not focused', async () => {
    const visibleWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => false
      }
    }

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    const toggleRegistration = mocks.registerMainShortcut.mock.calls.find(
      ([id]) => id === 'core.box.toggle'
    )
    const toggleHandler = toggleRegistration?.[2] as (() => void) | undefined

    mocks.currentWindow = null
    toggleHandler?.()

    mocks.coreBoxManagerTrigger.mockClear()
    mocks.currentWindow = visibleWindow
    vi.advanceTimersByTime(200)
    toggleHandler?.()

    expect(mocks.coreBoxManagerTrigger).toHaveBeenCalledWith(false)
    expect(mocks.coreBoxManagerTrigger).not.toHaveBeenCalledWith(true, {
      triggeredByShortcut: true
    })
  })

  it('moves visible CoreBox instead of hiding when shortcut is pressed on another screen', async () => {
    mocks.getCurScreen.mockReturnValueOnce({ id: 1 }).mockReturnValueOnce({ id: 2 })
    const visibleWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => false
      }
    }

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])

    const toggleRegistration = mocks.registerMainShortcut.mock.calls.find(
      ([id]) => id === 'core.box.toggle'
    )
    const toggleHandler = toggleRegistration?.[2] as (() => void) | undefined

    mocks.currentWindow = null
    toggleHandler?.()

    mocks.coreBoxManagerTrigger.mockClear()
    mocks.currentWindow = visibleWindow
    vi.advanceTimersByTime(200)
    toggleHandler?.()

    expect(mocks.updatePosition).toHaveBeenCalledWith(
      visibleWindow,
      expect.objectContaining({ id: 2 })
    )
    expect(mocks.coreBoxManagerTrigger).not.toHaveBeenCalledWith(false)
  })

  it('ignores layout updates while CoreBox window is hidden', async () => {
    mocks.currentWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => false,
        isFocused: () => false
      }
    }

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])
    ;(
      module as unknown as {
        applyLayoutUpdate: (payload: {
          height: number
          resultCount: number
          loading: boolean
          recommendationPending: boolean
          activationCount: number
        }) => void
      }
    ).applyLayoutUpdate({
      height: 56,
      resultCount: 0,
      loading: false,
      recommendationPending: false,
      activationCount: 0
    })

    expect(mocks.coreBoxManagerTrigger).not.toHaveBeenCalled()
    expect(mocks.markExpanded).not.toHaveBeenCalled()
    expect(mocks.setHeight).not.toHaveBeenCalled()
  })

  it('applies measured visible search-state height while search is pending', async () => {
    mocks.isCollapsed = true
    mocks.currentWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => true,
        webContents: { id: 10 }
      }
    }
    mocks.windows = [mocks.currentWindow as (typeof mocks.windows)[number]]

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])
    ;(
      module as unknown as {
        applyLayoutUpdate: (payload: {
          height: number
          resultCount: number
          loading: boolean
          recommendationPending: boolean
          activationCount: number
        }) => void
      }
    ).applyLayoutUpdate({
      height: 196,
      resultCount: 0,
      loading: true,
      recommendationPending: false,
      activationCount: 0
    })

    expect(mocks.markExpanded).toHaveBeenCalled()
    expect(mocks.setHeight).toHaveBeenCalledWith(196, mocks.currentWindow)
  })

  it('applies layout updates to the sender CoreBox window when another CoreBox is current', async () => {
    mocks.isCollapsed = true
    const senderWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => true,
        webContents: { id: 31 }
      }
    }
    const currentWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => true,
        webContents: { id: 42 }
      }
    }
    mocks.currentWindow = currentWindow
    mocks.windows = [senderWindow, currentWindow]

    const module = new CoreBoxModule()

    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])
    ;(
      module as unknown as {
        applyLayoutUpdate: (
          payload: {
            height: number
            resultCount: number
            loading: boolean
            recommendationPending: boolean
            activationCount: number
          },
          context?: { sender: { id: number } }
        ) => void
      }
    ).applyLayoutUpdate(
      {
        height: 196,
        resultCount: 0,
        loading: true,
        recommendationPending: false,
        activationCount: 0
      },
      { sender: { id: 31 } }
    )

    expect(mocks.setHeight).toHaveBeenCalledWith(196, senderWindow)
  })

  it('holds layout updates while the action panel is open and applies the latest on release', async () => {
    const visibleWindow = {
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        isFocused: () => true,
        webContents: { id: 10 }
      }
    }
    mocks.currentWindow = visibleWindow
    mocks.windows = [visibleWindow]
    mocks.metaOverlayVisible = true

    const module = new CoreBoxModule()
    await module.onInit({
      app: {},
      manager: { loadModule: vi.fn(async () => undefined) }
    } as unknown as Parameters<CoreBoxModule['onInit']>[0])
    const applyLayoutUpdate = (
      module as unknown as {
        applyLayoutUpdate: (payload: {
          height: number
          resultCount: number
          loading: boolean
          recommendationPending: boolean
          activationCount: number
        }) => void
      }
    ).applyLayoutUpdate.bind(module)
    const layout = (height: number) => ({
      height,
      resultCount: 3,
      loading: false,
      recommendationPending: false,
      activationCount: 0
    })

    // A stream finishing under the open panel would shrink the window and clip the panel.
    applyLayoutUpdate(layout(240))
    applyLayoutUpdate(layout(260))

    expect(mocks.setHeight).not.toHaveBeenCalled()
    expect(mocks.holdLayoutUpdate).toHaveBeenCalledTimes(2)

    // The panel closes: the manager replays only the latest held update.
    mocks.metaOverlayVisible = false
    mocks.heldLayoutReplay?.()

    expect(mocks.setHeight).toHaveBeenCalledExactlyOnceWith(260, visibleWindow)
  })

  it('cleans up shortcuts and disposers before clearing runtime registration', async () => {
    const module = new CoreBoxModule()
    const timer = setTimeout(() => undefined, 1_000)

    ;(
      module as unknown as {
        disposeLagBurstSubscription: (() => void) | null
        layoutApplyTimer: NodeJS.Timeout | null
        transportDisposers: Array<() => void>
        transport: unknown
      }
    ).disposeLagBurstSubscription = mocks.disposeLagBurst
    ;(
      module as unknown as {
        disposeLagBurstSubscription: (() => void) | null
        layoutApplyTimer: NodeJS.Timeout | null
        transportDisposers: Array<() => void>
        transport: unknown
      }
    ).layoutApplyTimer = timer
    ;(
      module as unknown as {
        disposeLagBurstSubscription: (() => void) | null
        layoutApplyTimer: NodeJS.Timeout | null
        transportDisposers: Array<() => void>
        transport: unknown
      }
    ).transportDisposers = [mocks.disposeTransport]
    ;(
      module as unknown as {
        disposeLagBurstSubscription: (() => void) | null
        layoutApplyTimer: NodeJS.Timeout | null
        transportDisposers: Array<() => void>
        transport: unknown
      }
    ).transport = {}

    await module.onDestroy()

    expect(mocks.callOrder).toEqual([
      'unregister:core.box.toggle',
      'dispose-lag-burst',
      'dispose-transport',
      'search-logger-destroy',
      // Was inside coreBoxManager.destroy() before #524 moved the wiring to this module; the
      // relative order has to survive the move.
      'ipc-unregister',
      'core-box-manager-destroy',
      'clear-runtime'
    ])
    expect(
      (module as unknown as { layoutApplyTimer: NodeJS.Timeout | null }).layoutApplyTimer
    ).toBeNull()
    expect((module as unknown as { transport: unknown }).transport).toBeNull()
  })
})
