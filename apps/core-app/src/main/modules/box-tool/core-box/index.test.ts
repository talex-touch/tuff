import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const callOrder: string[] = []

  return {
    callOrder,
    clearRegisteredMainRuntime: vi.fn(() => {
      callOrder.push('clear-runtime')
    }),
    unregisterMainShortcut: vi.fn((id: string) => {
      callOrder.push(`unregister:${id}`)
      return true
    }),
    searchLoggerDestroy: vi.fn(() => {
      callOrder.push('search-logger-destroy')
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
  registerMainRuntime: vi.fn(),
  resolveMainRuntime: vi.fn()
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../../utils/dev-process-manager', () => ({
  devProcessManager: {}
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
    registerMainShortcut: vi.fn(() => true),
    unregisterMainShortcut: mocks.unregisterMainShortcut
  }
}))

vi.mock('../../storage', () => ({
  getMainConfig: vi.fn()
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

vi.mock('./manager', () => ({
  coreBoxManager: {
    init: vi.fn(),
    destroy: mocks.coreBoxManagerDestroy
  }
}))

vi.mock('./window', () => ({
  windowManager: {
    create: vi.fn()
  }
}))

import { CoreBoxModule } from './index'

describe('CoreBoxModule onDestroy', () => {
  beforeEach(() => {
    mocks.callOrder.length = 0
    vi.clearAllMocks()
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
      'unregister:core.box.aiQuickCall',
      'dispose-lag-burst',
      'dispose-transport',
      'search-logger-destroy',
      'core-box-manager-destroy',
      'clear-runtime'
    ])
    expect(
      (module as unknown as { layoutApplyTimer: NodeJS.Timeout | null }).layoutApplyTimer
    ).toBeNull()
    expect((module as unknown as { transport: unknown }).transport).toBeNull()
  })
})
