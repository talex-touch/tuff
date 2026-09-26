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

  it('appends a deferred batch below the rows on screen, whatever its score', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'ranking', [
      buildItem('app-low', 'app-provider', { final: 10 })
    ])
    expect(hook.res.value.map((item) => item.id)).toEqual(['app-low'])

    await pushDeferredBatch(stream, [buildItem('file-high', 'file-provider', { final: 500 })])

    expect(hook.res.value.map((item) => item.id)).toEqual(['app-low', 'file-high'])
  })

  it('orders the rows of one arriving batch by score before appending them', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'batch order', [
      buildItem('app-top', 'app-provider', { final: 900 })
    ])
    await pushDeferredBatch(stream, [
      buildItem('file-low', 'file-provider', { final: 10 }),
      buildItem('file-high', 'file-provider', { final: 300 }),
      buildItem('file-mid', 'file-provider', { final: 100 })
    ])

    expect(hook.res.value.map((item) => item.id)).toEqual([
      'app-top',
      'file-high',
      'file-mid',
      'file-low'
    ])
  })

  it('appends each later batch after the previous one', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'two batches', [
      buildItem('app-a', 'app-provider', { final: 10 })
    ])
    await pushDeferredBatch(stream, [buildItem('file-first', 'file-provider', { final: 100 })])
    await pushDeferredBatch(stream, [
      buildItem('link-second', 'quicklinks-provider', { final: 1_000 })
    ])

    expect(hook.res.value.map((item) => item.id)).toEqual(['app-a', 'file-first', 'link-second'])
  })

  /**
   * #348 asked whether a later batch could re-send an item with a higher score to move it. It
   * cannot: what is on screen stays where it is, and a re-send only refreshes the row's data, so
   * a semantic re-score can never reshuffle a list the user is already reading.
   */
  it('keeps an already rendered row in place when a later batch re-sends it with a higher score', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'rescore', [
      buildItem('app-top', 'app-provider', { final: 900 }),
      buildItem('file-buried', 'file-provider', { final: 10 })
    ])
    expect(hook.res.value.map((item) => item.id)).toEqual(['app-top', 'file-buried'])

    // The same id, not a new one -- this is what a semantic re-score would look like on the wire.
    await pushDeferredBatch(stream, [buildItem('file-buried', 'file-provider', { final: 950 })])

    expect(hook.res.value.map((item) => item.id)).toEqual(['app-top', 'file-buried'])
    expect(hook.res.value[1]?.scoring?.final).toBe(950)
  })

  /** And the item is replaced, not duplicated, when the same id arrives twice. */
  it('does not duplicate an item that is re-sent', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'no duplicate', [
      buildItem('file-once', 'file-provider', { final: 10 })
    ])
    await pushDeferredBatch(stream, [buildItem('file-once', 'file-provider', { final: 20 })])

    expect(hook.res.value.filter((item) => item.id === 'file-once')).toHaveLength(1)
  })

  it('does not duplicate an item that arrives twice in one batch', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'batch duplicate', [
      buildItem('app-a', 'app-provider', { final: 10 })
    ])
    await pushDeferredBatch(stream, [
      buildItem('file-twice', 'file-provider', { final: 10 }),
      buildItem('file-twice', 'file-provider', { final: 20 })
    ])

    const rows = hook.res.value.filter((item) => item.id === 'file-twice')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scoring?.final).toBe(20)
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

  it('places a pinned arrival after the pinned rows already on screen', async () => {
    const hook = useSearch(createBoxOptions(), createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'pinned block', [
      buildItem('app-pinned', 'app-provider', { final: 5, pinned: true }),
      buildItem('app-top', 'app-provider', { final: 900 })
    ])

    await pushDeferredBatch(stream, [
      buildItem('file-plain', 'file-provider', { final: 950 }),
      buildItem('file-pinned', 'file-provider', { final: 1, pinned: true })
    ])

    expect(hook.res.value.map((item) => item.id)).toEqual([
      'app-pinned',
      'file-pinned',
      'app-top',
      'file-plain'
    ])
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

  it('keeps the selection on its row when a higher-scoring batch arrives', async () => {
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

    expect(hook.res.value.map((item) => item.id)).toEqual(['app-a', 'app-b', 'file-c'])
    expect(boxOptions.focus).toBe(1)
    expect(hook.res.value[boxOptions.focus].id).toBe('app-b')
  })

  /**
   * An extension query ("pdf") gives every file the same match score, so recency alone orders
   * them, and the file index carries none while Spotlight does. The later Spotlight batch would
   * outscore the row the index put on top; it lands below it instead, and the untouched selection
   * stays on the row the user has been looking at.
   */
  it('keeps the top row and an untouched selection when a later batch would outscore it', async () => {
    const boxOptions = createBoxOptions()
    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'pdf', [
      buildItem('/index/a.pdf', 'file-provider', { final: 100 }),
      buildItem('/index/b.pdf', 'file-provider', { final: 100 })
    ])
    expect(boxOptions.focus).toBe(0)

    await pushDeferredBatch(stream, [
      buildItem('/spotlight/c.pdf', 'macos-spotlight-provider', { final: 140 }),
      buildItem('/spotlight/d.pdf', 'macos-spotlight-provider', { final: 120 })
    ])

    expect(hook.res.value.map((item) => item.id)).toEqual([
      '/index/a.pdf',
      '/index/b.pdf',
      '/spotlight/c.pdf',
      '/spotlight/d.pdf'
    ])
    expect(boxOptions.focus).toBe(0)
    expect(hook.activeItem.value?.id).toBe('/index/a.pdf')
  })

  /**
   * A file query's only fast-layer hit is often a weak keyword match. The file batches that land
   * afterwards go below it rather than pushing it to the last row, so pressing Enter still runs
   * the row that was highlighted when the user looked.
   */
  it('appends a wide file batch below a weak fast hit and leaves the selection on row 0', async () => {
    const boxOptions = createBoxOptions()
    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()

    const stream = await runFirstBatch(hook, 'pdf', [
      buildItem('feature-pdf-tools', 'plugin-features', { final: 10 })
    ])
    await pushDeferredBatch(
      stream,
      Array.from({ length: 30 }, (_, index) =>
        buildItem(`/index/${index}.pdf`, 'file-provider', { final: 100 })
      )
    )

    expect(hook.res.value).toHaveLength(31)
    expect(hook.res.value[0]?.id).toBe('feature-pdf-tools')
    expect(hook.res.value.at(-1)?.id).toBe('/index/29.pdf')
    expect(boxOptions.focus).toBe(0)
    expect(hook.activeItem.value?.id).toBe('feature-pdf-tools')
  })

  it('never evicts the selected row when a later batch claims its floor past the render cap', async () => {
    const boxOptions = createBoxOptions()
    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()

    const appItems = Array.from({ length: 80 }, (_, index) =>
      buildItem(`app-${index}`, 'app-provider', { final: 1_000 - index })
    )
    const stream = await runFirstBatch(hook, 'selected near the cap', appItems)
    boxOptions.focus = 78
    expect(hook.res.value[boxOptions.focus].id).toBe('app-78')

    await pushDeferredBatch(
      stream,
      Array.from({ length: 10 }, (_, index) =>
        buildItem(`file-${index}`, 'file-provider', { final: 10 - index })
      )
    )

    const renderedIds = hook.res.value.map((item) => item.id)
    expect(renderedIds).toHaveLength(80)
    expect(renderedIds.filter((id) => id.startsWith('file-'))).toHaveLength(MIN_SLOTS_PER_SOURCE)
    expect(renderedIds).toContain('app-78')
    expect(renderedIds).not.toContain('app-79')
    expect(renderedIds).not.toContain('app-77')
    expect(hook.res.value[boxOptions.focus].id).toBe('app-78')
  })

  /**
   * The contract the tests above spell out, run over a hundred random streamed sessions: a fast
   * snapshot, a row the user moved to, then a few batches that mix new rows with re-sent ones.
   * Whatever the scores, the rows already on screen keep their order and the highlight keeps its
   * row and its item. Sessions stay under the render cap so the quota does not take part.
   */
  it('holds the rendered order and the selection through 100 random streamed sessions', async () => {
    const boxOptions = createBoxOptions()
    const hook = useSearch(boxOptions, createClipboardOptions())
    await flushPromises()

    // mulberry32: deterministic, so a failing session number reproduces.
    let seed = 0x5eed_2026
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const randomInt = (maxExclusive: number): number => Math.floor(random() * maxExclusive)
    const sources = [
      'app-provider',
      'plugin-features',
      'file-provider',
      'macos-spotlight-provider',
      'quicklinks-provider'
    ]
    const ids = (): string[] => hook.res.value.map((item) => item.id)

    for (let session = 0; session < 100; session += 1) {
      const fastCount = 1 + randomInt(20)
      const fastItems = Array.from({ length: fastCount }, (_, index) =>
        buildItem(`s${session}-fast-${index}`, sources[randomInt(sources.length)], {
          final: randomInt(1_000)
        })
      )
      const stream = await runFirstBatch(hook, `session ${session}`, fastItems)
      expect(ids(), `session ${session} snapshot`).toEqual(fastItems.map((item) => item.id))

      boxOptions.focus = randomInt(fastCount)
      const focusedId = hook.res.value[boxOptions.focus].id
      const focusedIndex = boxOptions.focus

      const batchCount = 1 + randomInt(3)
      for (let batch = 0; batch < batchCount; batch += 1) {
        const before = ids()
        const batchSize = 1 + randomInt(20)
        const batchItems = Array.from({ length: batchSize }, (_, index) => {
          const resend = before.length > 0 && random() < 0.2
          const id = resend ? before[randomInt(before.length)] : `s${session}-b${batch}-${index}`
          return buildItem(id, sources[randomInt(sources.length)], { final: randomInt(1_000) })
        })
        await pushDeferredBatch(stream, batchItems)

        const after = ids()
        const label = `session ${session} batch ${batch}`
        expect(after.slice(0, before.length), label).toEqual(before)
        expect(new Set(after).size, label).toBe(after.length)
        expect(boxOptions.focus, label).toBe(focusedIndex)
        expect(hook.res.value[boxOptions.focus].id, label).toBe(focusedId)
        for (const item of hook.res.value) {
          expect(item.scoring?.final, `${label} data of ${item.id}`).toBe(
            batchItems.findLast((sent) => sent.id === item.id)?.scoring?.final ??
              item.scoring?.final
          )
        }
      }
    }
  })
})
