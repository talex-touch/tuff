import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardItem, IClipboardOptions } from './types'
import { createCoreBoxContextActionsOpenRequest, TuffInputType } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { BoxMode } from '..'
import { useSearch } from './useSearch'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  streams: new Map<
    string,
    {
      onData: (payload: unknown) => void
      onError?: (error: unknown) => void
      onEnd?: () => void
    }
  >(),
  searchRequests: [] as Array<{
    payload: unknown
    options: {
      onData: (payload: unknown) => void
      onError?: (error: unknown) => void
      onEnd?: () => void
    }
  }>,
  searchResultForRequest: null as
    | null
    | ((payload: unknown, requestIndex: number) => TuffSearchResult | Promise<TuffSearchResult>),
  streamCancel: vi.fn(),
  beforeUnmountCallbacks: [] as Array<() => void>,
  send: vi.fn(),
  appSetting: {
    searchEngine: { logsEnabled: false },
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    tools: {
      autoHide: true,
      autoPaste: { enable: true, time: 5 }
    }
  },
  windowState: {
    type: 'corebox' as 'corebox' | 'division-box',
    divisionBox: null
  },
  backgroundAppLaunch: false,
  boxItems: [] as TuffItem[],
  boxItemsRef: null as Ref<TuffItem[]> | null,
  latestClipboard: null as IClipboardItem | null,
  latestClipboardRequests: [] as unknown[],
  dispatchEvent: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName?: () => string } | string, callback: (payload?: unknown) => void) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      state.listeners.set(key, callback)
      return () => {
        state.listeners.delete(key)
      }
    },
    stream: async (
      event: { toEventName?: () => string } | string,
      payload: unknown,
      options: {
        onData: (payload: unknown) => void
        onError?: (error: unknown) => void
        onEnd?: () => void
      }
    ) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      const controller = {
        cancel: vi.fn(() => {
          state.streamCancel()
          options.onEnd?.()
        })
      }
      state.streams.set(key, options)
      if (key !== 'core-box:search:session') return controller

      const requestIndex = state.searchRequests.length + 1
      const sessionId = `stream-session-${requestIndex}`
      state.searchRequests.push({ payload, options })
      options.onData({ type: 'session', sessionId })
      const result =
        state.searchResultForRequest?.(payload, requestIndex) ??
        createSearchResult(getSearchQueryText(payload), requestIndex)
      void Promise.resolve(result).then((snapshot) => {
        options.onData({
          type: 'snapshot',
          sessionId,
          result: { ...snapshot, sessionId }
        })
        options.onData({ type: 'complete', sessionId, sources: snapshot.sources })
        options.onEnd?.()
      })
      return controller
    },
    send: state.send
  })
}))

function createEvent(name: string) {
  return {
    toString: () => name,
    toEventName: () => name
  }
}

vi.mock('@talex-touch/utils/transport/event/builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/transport/event/builder')>()
  return {
    ...actual,
    defineRawEvent: (name: string) => createEvent(name)
  }
})

vi.mock('@vueuse/core', () => ({
  useDebounceFn: (fn: (...args: unknown[]) => unknown) => {
    const debounced = Object.assign((...args: unknown[]) => fn(...args), {
      cancel: vi.fn()
    })
    return debounced
  }
}))

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onMounted: (callback: () => void) => callback(),
    onBeforeUnmount: (callback: () => void) => {
      state.beforeUnmountCallbacks.push(callback)
    }
  }
})

vi.mock('~/modules/box/item-sdk', () => ({
  useBoxItems: () => ({
    items: state.boxItemsRef ?? ref(state.boxItems)
  })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: state.appSetting
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
}))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => state.windowState.type === 'division-box',
  windowState: state.windowState
}))

vi.mock('./detached-division', () => ({
  isDetachedDivisionItemMatch: () => false,
  parseDetachedDivisionConfig: () => null
}))

vi.mock('../transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({
    broadcast: vi.fn()
  })
}))

vi.mock('./app-launch-item', () => ({
  isBackgroundAppLaunchItem: () => state.backgroundAppLaunch
}))

vi.mock('./useResize', () => ({
  useResize: vi.fn()
}))

vi.mock('./useClipboardChannel', () => ({
  getLatestClipboard: vi.fn(async (request?: unknown) => {
    state.latestClipboardRequests.push(request)
    return state.latestClipboard
  })
}))

function createBoxOptions(): IBoxOptions {
  return {
    lastHidden: -1,
    mode: BoxMode.INPUT,
    focus: 0,
    file: { buffer: null, paths: [] },
    data: {},
    layout: undefined
  }
}

function createClipboardOptions(): IClipboardOptions {
  return {
    last: null,
    pendingAutoFillItem: null,
    detectedAt: null,
    lastClearedTimestamp: null,
    activeClipboardSource: null,
    lastTextAttachmentIdentity: null,
    lastTextAttachmentSource: null
  }
}

function createSearchResult(query: string, index = 1): TuffSearchResult {
  return {
    items: [
      {
        id: `item-${index}`,
        kind: 'app',
        source: { id: 'test-source', type: 'system' },
        render: { mode: 'default', basic: { title: `${query}-${index}` } }
      } as TuffItem
    ],
    query: { text: query, inputs: [] },
    duration: 1,
    sources: [],
    sessionId: `session-${index}`
  }
}

function getSearchQueryText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const query = (payload as { query?: unknown }).query
  if (!query || typeof query !== 'object') return ''
  const text = (query as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

async function flushPromises(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useSearch CoreBox reopen behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.streams.clear()
    state.searchRequests.length = 0
    state.searchResultForRequest = null
    state.streamCancel.mockClear()
    state.beforeUnmountCallbacks.length = 0
    state.boxItems = []
    state.boxItemsRef = ref(state.boxItems)
    state.windowState.type = 'corebox'
    state.windowState.divisionBox = null
    state.backgroundAppLaunch = false
    state.latestClipboard = null
    state.latestClipboardRequests = []
    state.appSetting.recommendation.enabled = true
    state.send.mockReset()
    state.send.mockImplementation(async (event: unknown, _payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName.includes('provider')) return []
      return undefined
    })

    const windowEvents = new EventTarget()
    const mockWindow = {
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
      dispatchEvent: vi.fn((event: Event) => {
        state.dispatchEvent(event)
        return windowEvents.dispatchEvent(event)
      }),
      setTimeout,
      clearTimeout
    }
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true
    })

    if (typeof globalThis.CustomEvent === 'undefined') {
      Object.defineProperty(globalThis, 'CustomEvent', {
        value: class CustomEvent<T = unknown> extends Event {
          detail: T

          constructor(type: string, eventInitDict?: CustomEventInit<T>) {
            super(type, eventInitDict)
            this.detail = eventInitDict?.detail as T
          }
        },
        configurable: true
      })
    }
  })

  it('runs a typed Context Actions query without re-reading clipboard state', async () => {
    useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    state.send.mockClear()
    state.latestClipboardRequests = []
    const contextEventName = Array.from(state.listeners.keys()).find((name) =>
      name.includes('context-actions')
    )
    expect(contextEventName).toBeTruthy()

    const request = createCoreBoxContextActionsOpenRequest('context-session', {
      type: 'image',
      source: 'clipboard-image',
      content: 'data:image/png;base64,aW1hZ2U=',
      mimeType: 'image/png',
      capturedAt: 1_752_486_400_000,
      available: true,
      diagnostic: { supportLevel: 'supported' }
    })
    await state.listeners.get(contextEventName!)?.(request)
    await flushPromises()

    expect(state.searchRequests.at(-1)?.payload).toMatchObject({
      query: {
        text: '',
        inputs: [{ type: TuffInputType.Image, content: 'data:image/png;base64,aW1hZ2U=' }],
        context: {
          session: 'context-session',
          contextAction: {
            mode: 'context-actions',
            sessionId: 'context-session',
            inputType: 'image',
            source: 'clipboard-image',
            available: true
          }
        }
      }
    })
    expect(state.latestClipboardRequests).toEqual([])
  })

  it('collapses on a matching no-results stream chunk while ignoring a stale session', async () => {
    let resolveSnapshot!: (result: TuffSearchResult) => void
    state.searchResultForRequest = () =>
      new Promise<TuffSearchResult>((resolve) => {
        resolveSnapshot = resolve
      })

    useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const searchStream = state.searchRequests.at(-1)
    const sessionId = `stream-session-${state.searchRequests.length}`
    expect(searchStream).toBeDefined()

    state.send.mockClear()
    searchStream?.options.onData({
      type: 'no-results',
      sessionId: 'stale-session',
      shouldShrink: true
    })
    await flushPromises()
    expect(state.send).not.toHaveBeenCalled()

    searchStream?.options.onData({ type: 'no-results', sessionId, shouldShrink: true })
    await flushPromises()

    expect(state.send).toHaveBeenCalledTimes(1)
    expect(String(state.send.mock.calls[0][0])).toBe('core-box:ui:expand')
    expect(state.send.mock.calls[0][1]).toEqual({ mode: 'collapse' })

    resolveSnapshot?.({ ...createSearchResult('', 1), items: [] })
    await flushPromises()
  })

  it('refreshes results when CoreBox is shown with an existing query', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    state.send.mockClear()
    hook.searchVal.value = 'aaa'
    await nextTick()
    await flushPromises()

    expect(state.searchRequests.at(-1)?.payload).toMatchObject({
      query: { text: 'aaa', inputs: [] }
    })
    expect(hook.res.value).toHaveLength(1)

    state.send.mockClear()
    window.dispatchEvent(new CustomEvent('corebox:shown'))
    await flushPromises()

    expect(state.searchRequests.at(-1)?.payload).toMatchObject({
      query: { text: 'aaa', inputs: [] }
    })
  })

  it('coalesces committed index refreshes and preserves the selected item', async () => {
    vi.useFakeTimers()
    const boxOptions = createBoxOptions()
    let progressiveQueryCount = 0
    state.searchResultForRequest = (payload) => {
      const query = getSearchQueryText(payload)
      if (query !== 'keep-selected') return createSearchResult(query)
      progressiveQueryCount += 1
      const itemIds = progressiveQueryCount === 1 ? ['first', 'selected'] : ['selected', 'new']
      return {
        ...createSearchResult(query, progressiveQueryCount),
        items: itemIds.map(
          (id) =>
            ({
              id,
              kind: 'app',
              source: { id: 'test-source', type: 'system' },
              render: { mode: 'default', basic: { title: id } }
            }) as TuffItem
        )
      }
    }

    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()
    hook.searchVal.value = 'keep-selected'
    await nextTick()
    await flushPromises()

    boxOptions.focus = 1
    const clipboardRequestsBeforeRefresh = state.latestClipboardRequests.length
    const requestsBeforeRefresh = state.searchRequests.length

    const commitStream = Array.from(state.streams.entries()).find(([name]) =>
      name.includes('index-committed')
    )?.[1]
    expect(commitStream).toBeDefined()
    commitStream?.onData({ revision: 1, providerIds: ['app-provider'], committedAt: 1 })
    commitStream?.onData({ revision: 2, providerIds: ['file-provider'], committedAt: 2 })

    await vi.advanceTimersByTimeAsync(499)
    expect(state.searchRequests).toHaveLength(requestsBeforeRefresh)

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(state.searchRequests).toHaveLength(requestsBeforeRefresh + 1)
    expect(hook.res.value.map((item) => item.id)).toEqual(['selected', 'new'])
    expect(boxOptions.focus).toBe(0)
    expect(state.latestClipboardRequests).toHaveLength(clipboardRequestsBeforeRefresh)

    for (const callback of state.beforeUnmountCallbacks) callback()
    expect(state.streamCancel).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('runs one trailing committed index refresh after an in-flight search ends', async () => {
    vi.useFakeTimers()
    const queryText = 'progressive-refresh'
    let holdNextQuery = false
    let progressiveResponseCount = 0
    const firstRefresh = {
      resolve: null as ((value: TuffSearchResult) => void) | null
    }
    let firstRefreshResolved = false
    state.searchResultForRequest = (payload) => {
      const query = getSearchQueryText(payload)
      if (query !== queryText) return createSearchResult(query)

      progressiveResponseCount += 1
      if (holdNextQuery) {
        holdNextQuery = false
        return new Promise<TuffSearchResult>((resolve) => {
          firstRefresh.resolve = resolve
        })
      }
      return createSearchResult(query, progressiveResponseCount)
    }

    try {
      const hook = useSearch(createBoxOptions(), createClipboardOptions())
      await flushPromises()
      hook.searchVal.value = queryText
      await nextTick()
      await flushPromises()

      const requestsBeforeRefresh = state.searchRequests.length
      holdNextQuery = true

      const commitStream = Array.from(state.streams.entries()).find(([name]) =>
        name.includes('index-committed')
      )?.[1]
      expect(commitStream).toBeDefined()
      commitStream?.onData({ revision: 1, providerIds: ['app-provider'], committedAt: 1 })

      await vi.advanceTimersByTimeAsync(500)
      expect(state.searchRequests).toHaveLength(requestsBeforeRefresh + 1)
      expect(firstRefresh.resolve).not.toBeNull()

      commitStream?.onData({ revision: 2, providerIds: ['file-provider'], committedAt: 2 })
      await vi.advanceTimersByTimeAsync(499)
      expect(state.searchRequests).toHaveLength(requestsBeforeRefresh + 1)

      firstRefresh.resolve?.(createSearchResult(queryText, 2))
      firstRefreshResolved = true
      await flushPromises()

      await vi.advanceTimersByTimeAsync(1)
      await flushPromises()
      expect(state.searchRequests).toHaveLength(requestsBeforeRefresh + 2)

      await vi.advanceTimersByTimeAsync(500)
      expect(state.searchRequests).toHaveLength(requestsBeforeRefresh + 2)
    } finally {
      if (!firstRefreshResolved && firstRefresh.resolve) {
        firstRefresh.resolve(createSearchResult(queryText, 2))
      }
      for (const callback of state.beforeUnmountCallbacks) callback()
      vi.useRealTimers()
    }
  })

  it('does not activate expired clipboard input during implicit search refresh', async () => {
    state.latestClipboard = {
      id: 92,
      type: 'image',
      content: 'tfile:///tmp/tuff/clipboard/images/original.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date().toISOString(),
      captureSource: 'native-watch',
      freshnessBaseAt: Date.now() - 6000,
      autoPasteEligible: true
    }
    const clipboardOptions = createClipboardOptions()
    const hook = useSearch(createBoxOptions(), clipboardOptions)
    await flushPromises()

    state.send.mockClear()
    hook.searchVal.value = 'calculator'
    await nextTick()
    await flushPromises()

    const queryPayload = state.searchRequests.at(-1)?.payload as {
      query?: { text?: string; inputs?: unknown[] }
    }

    expect(queryPayload?.query?.text).toBe('calculator')
    expect(queryPayload?.query?.inputs).toEqual([])
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.activeClipboardSource).toBeNull()

    state.latestClipboard = {
      ...state.latestClipboard,
      id: 94,
      freshnessBaseAt: Date.now()
    }
    await hook.handleSearchImmediate({ force: true })
    await flushPromises()

    expect(clipboardOptions.last?.id).toBe(94)
    expect(clipboardOptions.activeClipboardSource).toBe('auto')
  })

  it('does not restore a dismissed clipboard image during search refresh', async () => {
    const timestamp = new Date().toISOString()
    state.latestClipboard = {
      id: 93,
      type: 'image',
      content: 'tfile:///tmp/tuff/clipboard/images/original.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp,
      captureSource: 'native-watch',
      autoPasteEligible: true
    }
    const clipboardOptions = createClipboardOptions()
    clipboardOptions.lastClearedTimestamp = timestamp
    const hook = useSearch(createBoxOptions(), clipboardOptions)
    await flushPromises()

    state.send.mockClear()
    hook.searchVal.value = ''
    await hook.handleSearchImmediate({ force: true })
    await flushPromises()

    expect(state.latestClipboardRequests).toContainEqual({ refresh: true })
    expect(clipboardOptions.last).toBeNull()
  })

  it('runs a forced search when the main process sets the query', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()
    const requestsBeforeSetQuery = state.searchRequests.length

    state.send.mockClear()
    state.listeners.get('core-box:input:set-query')?.({
      value: 'screenshot',
      context: {
        entrypoint: {
          id: 'assistant.voice',
          source: 'voice',
          execution: {
            mode: 'new',
            owner: 'assistant',
            scope: 'light',
            isolated: true
          }
        }
      }
    })
    await flushPromises()

    expect(hook.searchVal.value).toBe('screenshot')
    expect(state.searchRequests.at(-1)?.payload).toMatchObject({
      query: {
        text: 'screenshot',
        inputs: [],
        context: {
          entrypoint: {
            id: 'assistant.voice',
            source: 'voice',
            execution: { mode: 'new', owner: 'assistant', scope: 'light', isolated: true }
          }
        }
      }
    })
    expect(state.searchRequests).toHaveLength(requestsBeforeSetQuery + 1)
    state.send.mockClear()
    state.searchResultForRequest = (payload) => createSearchResult(getSearchQueryText(payload), 1)
    hook.searchVal.value = 'next query'
    await hook.handleSearchImmediate({ force: true })
    await flushPromises()
    expect(state.searchRequests.at(-1)?.payload).toMatchObject({
      query: { text: 'next query', inputs: [] }
    })

    expect(hook.res.value).toHaveLength(1)
    expect(hook.res.value[0].render.basic?.title).toBe('next query-1')
    expect(state.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'corebox:layout-refresh' })
    )

    state.send.mockClear()
    state.listeners.get('core-box:input:set-query')?.({
      value: 'ai isolated request',
      context: {
        entrypoint: {
          id: 'assistant.voice',
          source: 'voice',
          execution: {
            mode: 'new',
            owner: 'assistant',
            scope: 'light',
            isolated: true
          }
        }
      }
    })
    await flushPromises()

    await hook.handleExecute({
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: 'AI Ask' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    } as TuffItem)

    const executeCall = state.send.mock.calls.find(
      ([event]) => String(event) === 'core-box:item:execute'
    )
    const executePayload = executeCall?.[1] as { searchResult?: TuffSearchResult } | undefined
    expect(executePayload?.searchResult?.query.context).toMatchObject({
      entrypoint: {
        id: 'assistant.voice',
        execution: { mode: 'new', owner: 'assistant', scope: 'light', isolated: true }
      }
    })
  })

  it('hides CoreBox immediately before dispatching background app launch', async () => {
    state.backgroundAppLaunch = true
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    state.send.mockClear()
    const appItem = {
      id: 'app-1',
      kind: 'app',
      source: { id: 'app-provider', type: 'application' },
      render: { mode: 'default', basic: { title: 'Slow App' } },
      meta: { app: { path: '/Applications/Slow.app' } }
    } as TuffItem

    await hook.handleExecute(appItem)
    await flushPromises()

    expect(state.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ toEventName: expect.any(Function) }),
      { immediate: true, reason: 'execute' }
    )
    expect(String(state.send.mock.calls[0][0])).toBe('core-box:ui:hide')
    expect(String(state.send.mock.calls[1][0])).toBe('core-box:item:execute')
  })

  it('keeps the query visible when entering a plugin feature input session', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    hook.searchVal.value = 'translate hello'
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    state.send.mockImplementation(async (event: unknown, _payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-translation'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const featureItem = {
      id: 'touch-translation/translate',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: 'Translate' } },
      meta: {
        pluginName: 'touch-translation',
        featureId: 'translate',
        interaction: { type: 'widget', allowInput: true },
        extension: {
          acceptedInputTypes: ['text']
        }
      }
    } as TuffItem

    await hook.handleExecute(featureItem)
    await flushPromises()

    const executeCall = state.send.mock.calls.find(
      ([event]) => String(event) === 'core-box:item:execute'
    )
    const executePayload = executeCall?.[1] as { searchResult?: TuffSearchResult } | undefined

    expect(executePayload?.searchResult?.query.text).toBe('translate hello')
    expect(hook.searchVal.value).toBe('translate hello')

    expect(hook.activeActivations.value?.[0]?.meta).toMatchObject({
      pluginName: 'touch-translation',
      featureId: 'translate',
      feature: expect.objectContaining({ id: 'touch-translation/translate' })
    })
    expect(hook.res.value[0]).toMatchObject({
      id: 'touch-translation/translate/widget-fallback',
      render: {
        mode: 'custom',
        custom: {
          type: 'vue',
          content: 'touch-translation::translate',
          data: {
            prompt: 'translate hello',
            status: 'chat-pending'
          }
        }
      }
    })

    window.dispatchEvent(new CustomEvent('corebox:shown'))
    await flushPromises()
  })

  it('refreshes latest clipboard before executing a plugin feature with image input', async () => {
    state.latestClipboard = {
      id: 91,
      type: 'image',
      content: 'tfile:///tmp/tuff/clipboard/images/original.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date().toISOString(),
      captureSource: 'corebox-show-baseline',
      autoPasteEligible: false
    }
    const clipboardOptions = createClipboardOptions()
    const hook = useSearch(createBoxOptions(), clipboardOptions)
    await flushPromises()

    hook.searchVal.value = 'describe the image'
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    state.send.mockImplementation(async (event: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-intelligence'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const featureItem = {
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: '智能问答' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text', 'image'] }
      }
    } as TuffItem

    await hook.handleExecute(featureItem)
    await flushPromises()

    const executeCall = state.send.mock.calls.find(
      ([event]) => String(event) === 'core-box:item:execute'
    )
    const executePayload = executeCall?.[1] as { searchResult?: TuffSearchResult } | undefined
    const input = executePayload?.searchResult?.query.inputs?.[0]

    expect(state.latestClipboardRequests).toContainEqual({ refresh: true })
    expect(input).toMatchObject({
      type: TuffInputType.Image,
      content: 'data:image/png;base64,thumb',
      metadata: expect.objectContaining({
        clipboardId: 91,
        canResolveOriginal: true,
        contentKind: 'preview'
      })
    })
  })

  it('executes a plugin feature with repeated long text inline without duplicate text input', async () => {
    const content = 'repeated long clipboard prompt '.repeat(5)
    const clipboardOptions = createClipboardOptions()
    clipboardOptions.pendingAutoFillItem = {
      id: 94,
      type: 'text',
      content,
      timestamp: new Date().toISOString(),
      captureSource: 'native-watch',
      autoPasteEligible: false
    }
    clipboardOptions.lastClearedTimestamp = clipboardOptions.pendingAutoFillItem.timestamp
    state.latestClipboard = null

    const hook = useSearch(createBoxOptions(), clipboardOptions)
    await flushPromises()

    hook.searchVal.value = content
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    state.send.mockImplementation(async (event: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-intelligence'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const featureItem = {
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: '智能问答' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    } as TuffItem

    await hook.handleExecute(featureItem)
    await flushPromises()

    const executeCall = state.send.mock.calls.find(
      ([event]) => String(event) === 'core-box:item:execute'
    )
    const executePayload = executeCall?.[1] as { searchResult?: TuffSearchResult } | undefined

    expect(executePayload?.searchResult?.query.text).toBe(content)
    expect(executePayload?.searchResult?.query.inputs).toEqual([])
  })

  it('keeps widget feature metadata when search end returns compressed activation', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    hook.searchVal.value = 'ai hello'
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    const featureItem = {
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: '智能问答' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    } as TuffItem

    state.send.mockImplementation(async (event: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-intelligence'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    await hook.handleExecute(featureItem)
    await flushPromises()

    const searchStream = state.searchRequests.at(-1)
    searchStream?.options.onData({
      type: 'complete',
      sessionId: `stream-session-${state.searchRequests.length}`,
      activate: [{ id: 'plugin-features', meta: { pluginName: 'touch-intelligence' } }],
      sources: []
    })
    await flushPromises()

    expect(hook.activeActivations.value?.[0]?.meta).toMatchObject({
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask',
      feature: expect.objectContaining({ id: 'touch-intelligence/intelligence-ask' })
    })
    expect(hook.res.value[0]).toMatchObject({
      render: {
        mode: 'custom',
        custom: {
          content: 'touch-intelligence::intelligence-ask',
          data: { prompt: 'ai hello', status: 'chat-pending' }
        }
      },
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'send',
        payload: {
          prompt: 'ai hello',
          inputKinds: ['text']
        }
      }
    })
  })

  it('refreshes active widget feature from search updates with custom render data', async () => {
    state.send.mockImplementation(async (event: unknown, _payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-intelligence'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    hook.searchVal.value = 'ai hello'
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    const featureItem = {
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: '智能问答' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    } as TuffItem

    await hook.handleExecute(featureItem)
    await flushPromises()

    const updatedWidgetItem = {
      id: 'intelligence-widget',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: {
        mode: 'custom',
        custom: {
          type: 'vue',
          content: 'touch-intelligence::intelligence-ask',
          data: {
            prompt: 'ai hello',
            answer: 'hello',
            status: 'ready',
            copyStatus: 'failed',
            copyError: '复制失败：缺少 clipboard.write 权限'
          }
        }
      },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        status: 'ready',
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        payload: { prompt: 'ai hello', answer: 'hello' }
      }
    } as TuffItem

    state.searchRequests.at(-1)?.options.onData({
      type: 'update',
      sessionId: `stream-session-${state.searchRequests.length}`,
      items: [updatedWidgetItem]
    })
    await flushPromises()

    expect(hook.activeActivations.value?.[0]?.meta).toMatchObject({
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask',
      feature: expect.objectContaining({
        id: 'intelligence-widget',
        render: {
          mode: 'custom',
          custom: expect.objectContaining({
            data: expect.objectContaining({
              copyStatus: 'failed',
              copyError: '复制失败：缺少 clipboard.write 权限'
            })
          })
        }
      })
    })
    expect(hook.activeActivations.value?.[0]?.meta?.activationFeature).toMatchObject({
      meta: {
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    })

    const requestsBeforeFollowUp = state.searchRequests.length
    state.send.mockClear()
    hook.searchVal.value = 'follow-up draft'
    await nextTick()
    await flushPromises()

    expect(state.searchRequests).toHaveLength(requestsBeforeFollowUp)
  })
  it('renders custom widget data pushed by the BoxItem SDK', async () => {
    state.send.mockImplementation(async (event: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return { activeProviders: ['plugin-features:touch-intelligence'] }
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const featureItem = {
      id: 'touch-intelligence/intelligence-ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: '智能问答' } },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        interaction: { type: 'widget', allowInput: true, sendMode: true },
        extension: { acceptedInputTypes: ['text'] }
      }
    } as TuffItem

    await hook.handleExecute(featureItem)
    await flushPromises()

    const pushedWidgetItem = {
      id: 'intelligence-widget',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: {
        mode: 'custom',
        custom: {
          type: 'vue',
          content: 'touch-intelligence::intelligence-ask',
          data: {
            prompt: 'ai hello',
            answer: 'hello',
            status: 'ready',
            copyStatus: 'failed',
            copyError: '复制失败：缺少 clipboard.write 权限',
            copyRecovery: '请在插件权限中允许 clipboard.write 后重试。'
          }
        }
      },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        status: 'ready',
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        payload: { prompt: 'ai hello', answer: 'hello' }
      }
    } as TuffItem

    state.boxItemsRef!.value = [pushedWidgetItem]
    await nextTick()
    await flushPromises()

    expect(hook.res.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'intelligence-widget',
          render: {
            mode: 'custom',
            custom: expect.objectContaining({
              data: expect.objectContaining({
                copyStatus: 'failed',
                copyError: '复制失败：缺少 clipboard.write 权限',
                copyRecovery: '请在插件权限中允许 clipboard.write 后重试。'
              })
            })
          }
        })
      ])
    )
  })

  it('suppresses regular search while a send-mode feature is active', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    state.send.mockClear()
    const featureItem = {
      id: 'touch-assistant/ask',
      kind: 'feature',
      source: { id: 'plugin-features', type: 'plugin' },
      render: { mode: 'default', basic: { title: 'Ask' } },
      meta: {
        pluginName: 'touch-assistant',
        featureId: 'ask',
        interaction: { type: 'webcontent', showInput: true, allowInput: true, sendMode: true },
        extension: {
          acceptedInputTypes: ['text']
        }
      }
    } as TuffItem

    state.send.mockImplementation(async (event: unknown, _payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:item:execute') {
        return [
          {
            id: 'plugin-features',
            meta: {
              pluginName: 'touch-assistant',
              featureId: 'ask',
              feature: featureItem
            },
            hideResults: false,
            showInput: true
          }
        ]
      }
      if (eventName.includes('provider')) return []
      return undefined
    })

    const requestsBeforeFeature = state.searchRequests.length
    await hook.handleExecute(featureItem)
    await flushPromises()
    state.send.mockClear()

    hook.searchVal.value = 'ask something'
    await nextTick()
    await flushPromises()
    expect(state.searchRequests).toHaveLength(requestsBeforeFeature)
  })

  it('does not invalidate an in-flight search when duplicate query is skipped', async () => {
    const firstSearch = {
      resolve: null as ((result: TuffSearchResult) => void) | null
    }
    state.searchResultForRequest = (payload) => {
      const query = getSearchQueryText(payload)
      if (query === 'aaa') {
        return new Promise<TuffSearchResult>((resolve) => {
          firstSearch.resolve = resolve
        })
      }
      return createSearchResult(query)
    }

    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    hook.searchVal.value = 'aaa'
    await nextTick()
    await Promise.resolve()
    hook.handleSearchImmediate()
    await Promise.resolve()

    expect(firstSearch.resolve).toBeTypeOf('function')
    firstSearch.resolve?.(createSearchResult('aaa', 100))
    await flushPromises()

    expect(hook.res.value.map((item) => item.id)).toEqual(['item-100'])
  })
})
