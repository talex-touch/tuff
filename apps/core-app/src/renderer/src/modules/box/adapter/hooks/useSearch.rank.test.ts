import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { BoxMode } from '..'
import { useSearch } from './useSearch'

interface StreamOptions {
  onData: (payload: unknown) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  searchStreams: [] as Array<{ sessionId: string; options: StreamOptions }>,
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
  boxItemsRef: null as Ref<TuffItem[]> | null
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
      _payload: unknown,
      options: StreamOptions
    ) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      const controller = { cancel: vi.fn() }
      if (key !== 'core-box:search:session') return controller

      const sessionId = `rank-session-${state.searchStreams.length + 1}`
      state.searchStreams.push({ sessionId, options })
      options.onData({ type: 'session', sessionId })
      return controller
    },
    send: state.send
  })
}))

vi.mock('@talex-touch/utils/transport/event/builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/transport/event/builder')>()
  return {
    ...actual,
    defineRawEvent: (name: string) => ({
      toString: () => name,
      toEventName: () => name
    })
  }
})

vi.mock('@vueuse/core', () => ({
  useDebounceFn: (fn: (...args: unknown[]) => unknown) =>
    Object.assign((...args: unknown[]) => fn(...args), { cancel: vi.fn() })
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
  useBoxItems: () => ({ items: state.boxItemsRef ?? ref([]) })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting: state.appSetting }))
vi.mock('~/utils/dev-log', () => ({ devLog: vi.fn() }))
vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => state.windowState.type === 'division-box',
  windowState: state.windowState
}))
vi.mock('./detached-division', () => ({
  isDetachedDivisionItemMatch: () => false,
  parseDetachedDivisionConfig: () => null
}))
vi.mock('../transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({ broadcast: vi.fn() })
}))
vi.mock('./app-launch-item', () => ({ isBackgroundAppLaunchItem: () => false }))
vi.mock('./useResize', () => ({ useResize: vi.fn() }))
vi.mock('./useClipboardChannel', () => ({ getLatestClipboard: vi.fn(async () => null) }))

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

/** Mirrors the per-source floor useSearch reserves under the render cap. */
const MIN_SLOTS_PER_SOURCE = 6

function buildItem(
  id: string,
  sourceId: string,
  scoring: { final: number; pinned?: boolean }
): TuffItem {
  return {
    id,
    kind: sourceId === 'file-provider' ? 'file' : 'app',
    source: { id: sourceId, type: sourceId === 'file-provider' ? 'file' : 'application' },
    render: { mode: 'default', basic: { title: id } },
    scoring
  } as TuffItem
}

async function flushPromises(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function runFirstBatch(
  hook: ReturnType<typeof useSearch>,
  text: string,
  items: TuffItem[]
): Promise<{ sessionId: string; options: StreamOptions }> {
  hook.searchVal.value = text
  await nextTick()
  await flushPromises()

  const stream = state.searchStreams.at(-1)
  if (!stream) throw new Error('search stream was not opened')

  const result: TuffSearchResult = {
    items,
    query: { text, inputs: [] },
    duration: 1,
    sources: [],
    sessionId: stream.sessionId
  }
  stream.options.onData({ type: 'snapshot', sessionId: stream.sessionId, result })
  await flushPromises()
  return stream
}

async function pushDeferredBatch(
  stream: { sessionId: string; options: StreamOptions },
  items: TuffItem[]
): Promise<void> {
  stream.options.onData({ type: 'update', sessionId: stream.sessionId, items })
  await flushPromises()
}

describe('useSearch rendered ranking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.searchStreams.length = 0
    state.beforeUnmountCallbacks.length = 0
    state.boxItemsRef = ref([])
    state.windowState.type = 'corebox'
    state.windowState.divisionBox = null
    state.send.mockReset()
    state.send.mockImplementation(async (event: unknown) => {
      const eventName = typeof event === 'string' ? event : String(event)
      if (eventName.includes('provider')) return []
      return undefined
    })

    const windowEvents = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      value: {
        addEventListener: windowEvents.addEventListener.bind(windowEvents),
        removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
        dispatchEvent: (event: Event) => windowEvents.dispatchEvent(event),
        setTimeout,
        clearTimeout
      },
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

  it('ranks a high-scoring deferred item above the low-scoring fast batch', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'ranking', [
      buildItem('app-low', 'app-provider', { final: 10 })
    ])
    expect(hook.res.value.map((item) => item.id)).toEqual(['app-low'])

    await pushDeferredBatch(stream, [buildItem('file-high', 'file-provider', { final: 500 })])

    expect(hook.res.value.map((item) => item.id)).toEqual(['file-high', 'app-low'])
  })

  it('keeps pinned items on top regardless of score', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'pinned ranking', [
      buildItem('app-top', 'app-provider', { final: 900 }),
      buildItem('app-mid', 'app-provider', { final: 400 })
    ])

    await pushDeferredBatch(stream, [
      buildItem('file-pinned', 'file-provider', { final: 1, pinned: true })
    ])

    expect(hook.res.value.map((item) => item.id)).toEqual(['file-pinned', 'app-top', 'app-mid'])
  })

  it('reserves a per-source floor when the merged set exceeds the render cap', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const appItems = Array.from({ length: 80 }, (_, index) =>
      buildItem(`app-${index}`, 'app-provider', { final: 1_000 - index })
    )
    const fileItems = Array.from({ length: 10 }, (_, index) =>
      buildItem(`file-${index}`, 'file-provider', { final: 10 - index })
    )

    const stream = await runFirstBatch(hook, 'starved files', appItems)
    expect(hook.res.value).toHaveLength(80)

    await pushDeferredBatch(stream, fileItems)

    const rendered = hook.res.value
    const renderedIds = rendered.map((item) => item.id)
    expect(rendered).toHaveLength(80)
    expect(renderedIds.filter((id) => id.startsWith('file-'))).toEqual([
      'file-0',
      'file-1',
      'file-2',
      'file-3',
      'file-4',
      'file-5'
    ])
    // The rescued slots come off the tail of the app run, not off its head.
    expect(renderedIds.slice(0, 5)).toEqual(['app-0', 'app-1', 'app-2', 'app-3', 'app-4'])
    expect(renderedIds).not.toContain('app-79')
  })

  it('keeps a batch tail source alive when one batch exceeds the render cap', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'wide batch', [
      buildItem('app-only', 'app-provider', { final: 10_000 })
    ])

    // One batch, ranked backend-side: the tail source sits past the render cap.
    const batch = [
      ...Array.from({ length: 90 }, (_, index) =>
        buildItem(`file-${index}`, 'file-provider', { final: 900 - index })
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        buildItem(`link-${index}`, 'quicklinks-provider', { final: 10 - index })
      )
    ]
    await pushDeferredBatch(stream, batch)

    const renderedIds = hook.res.value.map((item) => item.id)
    expect(renderedIds).toHaveLength(80)
    expect(renderedIds.filter((id) => id.startsWith('link-'))).toHaveLength(MIN_SLOTS_PER_SOURCE)
    expect(renderedIds[0]).toBe('app-only')
  })

  it('keeps the selection on the same item across a re-rank', async () => {
    const boxOptions = createBoxOptions()
    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'selection ranking', [
      buildItem('app-a', 'app-provider', { final: 100 }),
      buildItem('app-b', 'app-provider', { final: 50 })
    ])
    boxOptions.focus = 1
    expect(hook.res.value[boxOptions.focus].id).toBe('app-b')

    await pushDeferredBatch(stream, [buildItem('file-c', 'file-provider', { final: 200 })])

    expect(hook.res.value.map((item) => item.id)).toEqual(['file-c', 'app-a', 'app-b'])
    expect(boxOptions.focus).toBe(2)
    expect(hook.res.value[boxOptions.focus].id).toBe('app-b')
  })
})
