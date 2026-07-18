import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => unknown>(),
  streamHandlers: new Map<string, (payload: unknown, context: unknown) => unknown>(),
  on: vi.fn(
    (event: { toEventName?: () => string } | string, handler: (payload?: unknown) => unknown) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      mocks.handlers.set(eventName, handler)
      return () => {
        mocks.handlers.delete(eventName)
      }
    }
  ),
  onStream: vi.fn(
    (
      event: { toEventName?: () => string } | string,
      handler: (payload: unknown, context: unknown) => unknown
    ) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      mocks.streamHandlers.set(eventName, handler)
      return () => {
        mocks.streamHandlers.delete(eventName)
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
  currentWindow: null as null | {
    isDestroyed: () => boolean
    isVisible: () => boolean
  },
  searchEngineCore: {
    getActivationState: vi.fn(() => []),
    startSearch: vi.fn(),
    cancelSearchFromSender: vi.fn(),
    deactivateProvider: vi.fn(),
    deactivateProviders: vi.fn(),
    getProvidersByIds: vi.fn(() => []),
    registerIndexCommitStream: vi.fn()
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
    onStream: mocks.onStream,
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
    get current() {
      return mocks.currentWindow ? { window: mocks.currentWindow } : null
    },
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

import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { ipcManager } from './ipc'

describe('CoreBox IPC hide transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.streamHandlers.clear()
    mocks.isPinned.mockReturnValue(false)
    mocks.isCollapsed = false
    mocks.currentWindow = null
    ipcManager.unregister()
    ipcManager.register()
  })

  it('registers the search-index commit stream with SearchEngineCore', () => {
    const handler = mocks.streamHandlers.get(CoreBoxEvents.search.indexCommitted.toEventName())
    const context = { streamId: 'index-commit-stream' }

    expect(handler).toBeTypeOf('function')
    handler?.(undefined, context)

    expect(mocks.searchEngineCore.registerIndexCommitStream).toHaveBeenCalledWith(context)
  })

  it('keeps search session streams and raw cancellation scoped to their sender', async () => {
    type SearchStreamContext = {
      sender: { id: number }
      signal: AbortSignal
      emit: ReturnType<typeof vi.fn>
      end: ReturnType<typeof vi.fn>
      error: ReturnType<typeof vi.fn>
    }
    type StartSearchContext = {
      caller: { senderId: number }
      sink: {
        start: (sessionId: string) => void
        snapshot: (result: unknown) => void
        update: (payload: unknown) => void
        complete: (payload: unknown) => void
      }
    }
    const streamHandler = mocks.streamHandlers.get(
      CoreBoxEvents.search.session.toEventName()
    ) as unknown as ((payload: unknown, context: SearchStreamContext) => Promise<void>) | undefined
    const createContext = (senderId: number): SearchStreamContext => {
      const controller = new AbortController()
      return {
        sender: { id: senderId },
        signal: controller.signal,
        emit: vi.fn(),
        end: vi.fn(),
        error: vi.fn()
      }
    }
    const firstContext = createContext(11)
    const secondContext = createContext(22)

    mocks.searchEngineCore.startSearch.mockImplementation(
      (_query: unknown, context: StartSearchContext) => {
        const sessionId = `session-${context.caller.senderId}`
        const result = {
          sessionId,
          query: { text: 'sender scoped', inputs: [] },
          items: [],
          duration: 0,
          sources: []
        }
        context.sink.start(sessionId)
        context.sink.snapshot(result)
        context.sink.update({ searchId: sessionId, items: [] })
        context.sink.complete({ searchId: sessionId, sources: [] })
        return {
          sessionId,
          result: Promise.resolve(result),
          completed: Promise.resolve(),
          cancel: vi.fn()
        }
      }
    )

    expect(streamHandler).toBeTypeOf('function')
    await streamHandler?.(
      { query: { text: 'sender scoped', inputs: [] }, surface: 'core-box' },
      firstContext
    )
    await streamHandler?.(
      { query: { text: 'sender scoped', inputs: [] }, surface: 'application-index' },
      secondContext
    )

    expect(firstContext.emit.mock.calls.map((call) => call[0])).toEqual([
      { type: 'session', sessionId: 'session-11' },
      expect.objectContaining({ type: 'snapshot', sessionId: 'session-11' }),
      { type: 'update', sessionId: 'session-11', items: [] },
      expect.objectContaining({ type: 'complete', sessionId: 'session-11' })
    ])
    expect(secondContext.emit.mock.calls.map((call) => call[0])).toEqual([
      { type: 'session', sessionId: 'session-22' },
      expect.objectContaining({ type: 'snapshot', sessionId: 'session-22' }),
      { type: 'update', sessionId: 'session-22', items: [] },
      expect.objectContaining({ type: 'complete', sessionId: 'session-22' })
    ])
    expect(firstContext.end).toHaveBeenCalledTimes(1)
    const queryHandler = mocks.handlers.get(CoreBoxEvents.search.query.toEventName()) as unknown as
      | ((payload: unknown, context: { sender: { id: number } }) => Promise<unknown>)
      | undefined
    mocks.search.mockImplementation(
      async (
        _query: unknown,
        options: {
          sink: {
            update: (payload: { searchId: string; items: unknown[] }) => Promise<void>
            complete: (payload: { searchId: string; sources: unknown[] }) => Promise<void>
          }
        }
      ) => {
        await options.sink.update({ searchId: 'compatibility-session', items: [] })
        await options.sink.complete({ searchId: 'compatibility-session', sources: [] })
        return { items: [], query: { text: 'sender scoped', inputs: [] }, duration: 0, sources: [] }
      }
    )

    await queryHandler?.(
      { query: { text: 'sender scoped', inputs: [] }, surface: 'core-box' },
      { sender: firstContext.sender }
    )
    await queryHandler?.(
      { query: { text: 'sender scoped', inputs: [] }, surface: 'core-box' },
      { sender: secondContext.sender }
    )

    expect(mocks.sendTo).toHaveBeenNthCalledWith(
      1,
      firstContext.sender,
      CoreBoxEvents.search.update,
      expect.objectContaining({ searchId: 'compatibility-session' })
    )
    expect(mocks.sendTo).toHaveBeenNthCalledWith(
      2,
      firstContext.sender,
      CoreBoxEvents.search.end,
      expect.objectContaining({ searchId: 'compatibility-session' })
    )
    expect(mocks.sendTo).toHaveBeenNthCalledWith(
      3,
      secondContext.sender,
      CoreBoxEvents.search.update,
      expect.objectContaining({ searchId: 'compatibility-session' })
    )
    expect(mocks.sendTo).toHaveBeenNthCalledWith(
      4,
      secondContext.sender,
      CoreBoxEvents.search.end,
      expect.objectContaining({ searchId: 'compatibility-session' })
    )
    expect(secondContext.end).toHaveBeenCalledTimes(1)

    mocks.searchEngineCore.cancelSearchFromSender.mockImplementation(
      (sessionId: string, senderId: number) => sessionId === 'session-11' && senderId === 11
    )
    const cancelHandler = mocks.handlers.get(CoreBoxEvents.search.cancel.toEventName()) as
      | ((
          payload: { searchId: string },
          context: { sender: { id: number } }
        ) => { cancelled: boolean })
      | undefined

    expect(cancelHandler?.({ searchId: 'session-11' }, { sender: { id: 22 } })).toEqual({
      cancelled: false
    })
    expect(cancelHandler?.({ searchId: 'session-11' }, { sender: { id: 11 } })).toEqual({
      cancelled: true
    })
    expect(mocks.searchEngineCore.cancelSearchFromSender).toHaveBeenNthCalledWith(
      1,
      'session-11',
      22
    )
    expect(mocks.searchEngineCore.cancelSearchFromSender).toHaveBeenNthCalledWith(
      2,
      'session-11',
      11
    )
  })

  it('maps canonical hide payload into an immediate manager trigger', () => {
    const handler = mocks.handlers.get(CoreBoxEvents.ui.hide.toEventName())

    expect(handler).toBeTypeOf('function')
    handler?.({ immediate: true, reason: 'execute' })

    expect(mocks.trigger).toHaveBeenCalledWith(false, { immediate: true })
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

  it('maps forceMax expand payloads to maximum CoreBox expansion', () => {
    mocks.currentWindow = {
      isDestroyed: () => false,
      isVisible: () => true
    }
    const handler = mocks.handlers.get(CoreBoxEvents.ui.expand.toEventName())

    expect(handler).toBeTypeOf('function')
    handler?.({ forceMax: true })

    expect(mocks.expand).toHaveBeenCalledWith({ forceMax: true })
    expect(mocks.shrink).not.toHaveBeenCalled()
  })
})
