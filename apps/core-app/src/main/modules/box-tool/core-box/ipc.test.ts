import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => unknown>(),
  on: vi.fn(
    (event: { toEventName?: () => string } | string, handler: (payload?: unknown) => unknown) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      mocks.handlers.set(eventName, handler)
      return () => {
        mocks.handlers.delete(eventName)
      }
    }
  ),
  sendTo: vi.fn(),
  trigger: vi.fn(),
  shrink: vi.fn(),
  expand: vi.fn(),
  search: vi.fn(),
  markExpanded: vi.fn(),
  enterUIMode: vi.fn(),
  exitUIMode: vi.fn(),
  getBoxItemManager: vi.fn(() => ({
    clear: vi.fn()
  })),
  setPinned: vi.fn(),
  isPinned: vi.fn(() => false),
  isCollapsed: false,
  searchEngineCore: {
    getActivationState: vi.fn(() => []),
    getCurrentGatherController: vi.fn(() => null),
    cancelSearch: vi.fn(),
    deactivateProvider: vi.fn(),
    deactivateProviders: vi.fn(),
    getProvidersByIds: vi.fn(() => [])
  },
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
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: mocks.on,
    sendTo: mocks.sendTo
  }))
}))

vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: vi.fn(() => ({
    app: {
      channel: {}
    }
  }))
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../../utils/legacy-alias-telemetry', () => ({
  withLegacyAliasTelemetry: vi.fn((handler) => handler)
}))

vi.mock('../../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: new Map()
    }
  }
}))

vi.mock('../item-sdk', () => ({
  getBoxItemManager: mocks.getBoxItemManager
}))

vi.mock('../search-engine/search-core', () => ({
  default: mocks.searchEngineCore
}))

vi.mock('../search-engine/search-logger', () => ({
  searchLogger: {
    isEnabled: vi.fn(() => false),
    logSearchPhase: vi.fn()
  }
}))

vi.mock('./input-transport', () => ({
  coreBoxInputTransport: {
    register: vi.fn()
  }
}))

vi.mock('./key-transport', () => ({
  coreBoxKeyTransport: {
    register: vi.fn()
  }
}))

vi.mock('./image-translate', () => ({
  translateCoreBoxImageItem: vi.fn()
}))

vi.mock('./manager', () => ({
  coreBoxManager: {
    trigger: mocks.trigger,
    shrink: mocks.shrink,
    expand: mocks.expand,
    search: mocks.search,
    markExpanded: mocks.markExpanded,
    enterUIMode: mocks.enterUIMode,
    exitUIMode: mocks.exitUIMode,
    get isUIMode() {
      return false
    },
    get isCollapsed() {
      return mocks.isCollapsed
    }
  }
}))

vi.mock('./meta-overlay', () => ({
  metaOverlayManager: {
    getPluginActions: vi.fn(() => []),
    show: vi.fn(),
    hide: vi.fn(),
    getVisible: vi.fn(() => false),
    executeAction: vi.fn(),
    registerPluginAction: vi.fn(),
    unregisterPluginAction: vi.fn(),
    unregisterPluginActions: vi.fn()
  }
}))

vi.mock('./window', () => ({
  COREBOX_MIN_HEIGHT: 56,
  getCoreBoxWindow: vi.fn(() => null),
  windowManager: {
    current: null,
    enableClipboardMonitoring: vi.fn(),
    enableInputMonitoring: vi.fn(),
    setPinned: mocks.setPinned,
    isPinned: mocks.isPinned,
    setHeight: vi.fn(),
    setPositionOffset: vi.fn()
  }
}))

vi.mock('../../../../shared/events/corebox-scenes', () => ({
  coreBoxImageTranslateEvent: 'core-box:image-translate'
}))

import { CoreBoxEvents, CoreBoxRetainedEvents } from '@talex-touch/utils/transport/events'
import { ipcManager } from './ipc'

describe('CoreBox IPC hide transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.isPinned.mockReturnValue(false)
    mocks.isCollapsed = false
    ipcManager.unregister()
    ipcManager.register()
  })

  it('maps canonical hide payload into an immediate manager trigger', () => {
    const handler = mocks.handlers.get(CoreBoxEvents.ui.hide.toEventName())

    expect(handler).toBeTypeOf('function')
    handler?.({ immediate: true, reason: 'execute' })

    expect(mocks.trigger).toHaveBeenCalledWith(false, { immediate: true })
  })

  it('keeps legacy hide payload compatible with normal delayed hide', () => {
    const handler = mocks.handlers.get(CoreBoxRetainedEvents.legacy.hide.toEventName())

    expect(handler).toBeTypeOf('function')
    handler?.()

    expect(mocks.trigger).toHaveBeenCalledWith(false, { immediate: false })
  })

  it('applies canonical window pin requests through the window manager', () => {
    mocks.isPinned.mockReturnValue(true)
    const handler = mocks.handlers.get(CoreBoxEvents.ui.setPinned.toEventName())

    expect(handler).toBeTypeOf('function')
    const response = handler?.({ pinned: true })

    expect(mocks.setPinned).toHaveBeenCalledWith(true)
    expect(response).toEqual({ pinned: true })
  })

  it('uses the CoreBox header height as the layout minimum', () => {
    const handler = mocks.handlers.get(CoreBoxEvents.layout.setHeight.toEventName())

    expect(handler).toBeTypeOf('function')
    expect(() => handler?.({ height: 55 })).toThrow('Invalid height (must be 56-650)')

    const minResponse = handler?.({ height: 56 })
    expect(minResponse).toEqual({ height: 56 })
    expect(mocks.markExpanded).not.toHaveBeenCalled()

    mocks.isCollapsed = true
    const expandedResponse = handler?.({ height: 57 })
    expect(expandedResponse).toEqual({ height: 57 })
    expect(mocks.markExpanded).toHaveBeenCalledTimes(1)
  })
})
