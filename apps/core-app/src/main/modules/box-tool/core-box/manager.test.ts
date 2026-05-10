import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
  setGlobalPressure: vi.fn(),
  clearGlobalPressure: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  shrink: vi.fn(),
  expand: vi.fn(),
  on: vi.fn(),
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
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => ({
      setGlobalPressure: mocks.setGlobalPressure,
      clearGlobalPressure: mocks.clearGlobalPressure
    })
  }
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    PROVIDER_DEACTIVATED: 'provider-deactivated'
  },
  touchEventBus: {
    on: mocks.on
  }
}))

vi.mock('../../../core/runtime-accessor', () => ({
  maybeGetRegisteredMainRuntime: vi.fn(() => null)
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../storage', () => ({
  getMainConfig: mocks.getMainConfig
}))

vi.mock('../search-engine/search-core', () => ({
  SearchEngineCore: class SearchEngineCore {
    static getInstance() {
      return {
        search: vi.fn()
      }
    }
  }
}))

vi.mock('../search-engine/search-logger', () => ({
  searchLogger: {
    isEnabled: vi.fn(() => false),
    logSearchPhase: vi.fn()
  }
}))

vi.mock('./ipc', () => ({
  ipcManager: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}))

vi.mock('./window', () => ({
  windowManager: {
    create: vi.fn(),
    show: mocks.show,
    hide: mocks.hide,
    shrink: mocks.shrink,
    expand: mocks.expand,
    attachUIView: vi.fn(),
    detachUIView: vi.fn(),
    current: null
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    sendTo: vi.fn()
  }))
}))

describe('CoreBoxManager polling pressure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'))
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getMainConfig.mockReturnValue({ beginner: { init: true } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies temporary polling pressure while CoreBox is visible', async () => {
    const { coreBoxManager } = await import('./manager')

    coreBoxManager.trigger(true)

    expect(mocks.setGlobalPressure).toHaveBeenCalledWith({
      reason: 'corebox-active',
      until: Date.now() + 30_000,
      laneMultipliers: {
        realtime: 2,
        io: 4,
        maintenance: 8,
        serial: 6
      },
      concurrencyCaps: {
        realtime: 1,
        io: 1,
        maintenance: 1,
        serial: 1
      }
    })
    expect(mocks.show).toHaveBeenCalledWith(false)
  })

  it('clears polling pressure when CoreBox hides', async () => {
    const { coreBoxManager } = await import('./manager')
    coreBoxManager.trigger(true)
    await vi.advanceTimersByTimeAsync(250)

    coreBoxManager.trigger(false)

    expect(mocks.clearGlobalPressure).toHaveBeenCalledWith('corebox-active')
    expect(mocks.hide).toHaveBeenCalled()
  })
})
