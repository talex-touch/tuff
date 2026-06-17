import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { BoxMode } from '..'
import { useSearch } from './useSearch'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  send: vi.fn(),
  appSetting: {
    searchEngine: { logsEnabled: false },
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    tools: {
      autoHide: true,
      autoPaste: { time: 5 }
    }
  },
  windowState: {
    type: 'corebox' as 'corebox' | 'division-box',
    divisionBox: null
  },
  backgroundAppLaunch: false,
  boxItems: [] as TuffItem[],
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
    onBeforeUnmount: vi.fn()
  }
})

vi.mock('~/modules/box/item-sdk', () => ({
  useBoxItems: () => ({
    items: { value: state.boxItems }
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
    lastClearedTimestamp: null
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
    state.boxItems = []
    state.windowState.type = 'corebox'
    state.windowState.divisionBox = null
    state.backgroundAppLaunch = false
    state.appSetting.recommendation.enabled = true
    state.send.mockReset()
    state.send.mockImplementation(async (event: unknown, payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName.includes('provider')) return []
      if (eventName === 'core-box:query') {
        const query = getSearchQueryText(payload)
        return createSearchResult(query, state.send.mock.calls.length)
      }
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

  it('refreshes results when CoreBox is shown with an existing query', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    state.send.mockClear()
    hook.searchVal.value = 'aaa'
    await nextTick()
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ toEventName: expect.any(Function) }),
      {
        query: { text: 'aaa', inputs: [] }
      }
    )
    expect(hook.res.value).toHaveLength(1)

    state.send.mockClear()
    window.dispatchEvent(new CustomEvent('corebox:shown'))
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({ toEventName: expect.any(Function) }),
      {
        query: { text: 'aaa', inputs: [] }
      }
    )
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
    expect(String(state.send.mock.calls[1][0])).toBe('core-box:execute')
  })

  it('keeps the query visible when entering a plugin feature input session', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    hook.searchVal.value = 'translate hello'
    await nextTick()
    await flushPromises()

    state.send.mockClear()
    state.send.mockImplementation(async (event: unknown, payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:execute') {
        return { activeProviders: ['plugin-features:touch-translation'] }
      }
      if (eventName.includes('provider')) return []
      if (eventName === 'core-box:query') {
        const query = getSearchQueryText(payload)
        return createSearchResult(query)
      }
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
      ([event]) => String(event) === 'core-box:execute'
    )
    const executePayload = executeCall?.[1] as { searchResult?: TuffSearchResult } | undefined

    expect(executePayload?.searchResult?.query.text).toBe('translate hello')
    expect(hook.searchVal.value).toBe('translate hello')
    expect(state.send.mock.calls.some(([event]) => String(event) === 'core-box:query')).toBe(false)

    window.dispatchEvent(new CustomEvent('corebox:shown'))
    await flushPromises()

    expect(state.send.mock.calls.some(([event]) => String(event) === 'core-box:query')).toBe(false)
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

    state.send.mockImplementation(async (event: unknown, payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName === 'core-box:execute') {
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
      if (eventName === 'core-box:query') return createSearchResult(getSearchQueryText(payload))
      return undefined
    })

    await hook.handleExecute(featureItem)
    await flushPromises()
    state.send.mockClear()

    hook.searchVal.value = 'ask something'
    await nextTick()
    await flushPromises()

    expect(state.send.mock.calls.some(([event]) => String(event) === 'core-box:query')).toBe(false)
  })

  it('does not invalidate an in-flight search when duplicate query is skipped', async () => {
    const firstSearch = {
      resolve: null as ((result: TuffSearchResult) => void) | null
    }
    state.send.mockImplementation(async (event: unknown, payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName.includes('provider')) return []
      if (eventName !== 'core-box:query') return undefined
      const query = getSearchQueryText(payload)
      if (query === 'aaa') {
        return await new Promise<TuffSearchResult>((resolve) => {
          firstSearch.resolve = resolve
        })
      }
      return createSearchResult(query)
    })

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
