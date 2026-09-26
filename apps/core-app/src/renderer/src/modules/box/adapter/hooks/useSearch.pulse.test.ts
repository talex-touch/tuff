// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type * as VueUse from '@vueuse/core'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import { BoxMode } from '..'
import { useSearch } from './useSearch'

/**
 * The searching cue says one thing: nothing of the current query is on screen yet
 * (09-26-corebox-pulse-semantics). A session completes only after its deferred layer (the files),
 * seconds after the apps land, so `loading` held the glow long after there was something to see.
 * The streams are driven by hand here, so each state can be read between two chunks.
 */

interface StreamOptions {
  onData: (payload: unknown) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

interface SearchStream {
  sessionId: string
  text: string
  options: StreamOptions
}

const state = vi.hoisted(() => ({
  streams: [] as SearchStream[],
  /** Holds `item.execute` open until released, so a test can look inside an execute. */
  executeGate: null as null | PromiseWithResolvers<unknown>
}))

vi.mock('@talex-touch/utils/transport', () => {
  const nameOf = (event: unknown): string =>
    typeof event === 'string'
      ? event
      : ((event as { toEventName?: () => string } | null)?.toEventName?.() ?? String(event))
  return {
    useTuffTransport: () => ({
      on: () => () => {},
      send: async (event: unknown) => {
        const name = nameOf(event)
        if (name === 'core-box:item:execute' && state.executeGate) return state.executeGate.promise
        return name.includes('provider') ? [] : undefined
      },
      stream: async (event: unknown, payload: unknown, options: StreamOptions) => {
        if (nameOf(event) !== 'core-box:search:session') return { cancel: () => {} }
        const text = (payload as { query?: { text?: string } }).query?.text ?? ''
        const sessionId = `session-${state.streams.length + 1}`
        state.streams.push({ sessionId, text, options })
        options.onData({ type: 'session', sessionId })
        return { cancel: () => {} }
      }
    })
  }
})

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof VueUse>()),
  useDebounceFn: (fn: (...args: unknown[]) => unknown) =>
    Object.assign((...args: unknown[]) => fn(...args), { cancel: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/box/item-sdk', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  return { useBoxItems: () => ({ items: ref([]) }) }
})

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    searchEngine: { logsEnabled: false },
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    tools: { autoHide: true, autoPaste: { enable: true, time: 5 } }
  }
}))

vi.mock('~/utils/dev-log', () => ({ devLog: () => {} }))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { type: 'corebox', divisionBox: null }
}))

vi.mock('../transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({ broadcast: () => {} })
}))

vi.mock('./useResize', () => ({ useResize: () => {} }))

vi.mock('./useClipboardChannel', () => ({ getLatestClipboard: async () => null }))

function row(id: string): TuffItem {
  return {
    id,
    kind: id.startsWith('file') ? 'file' : 'command',
    source: { id: id.startsWith('file') ? 'file-provider' : 'test-source', type: 'system' },
    render: { mode: 'default', basic: { title: id } }
  } as TuffItem
}

let hook: ReturnType<typeof useSearch>
let wrapper: ReturnType<typeof mount> | null = null

const Host = defineComponent({
  setup() {
    const boxOptions = reactive<IBoxOptions>({
      lastHidden: -1,
      mode: BoxMode.INPUT,
      focus: 0,
      file: { buffer: null, paths: [] },
      data: {},
      layout: undefined
    })
    const clipboardOptions = reactive<IClipboardOptions>({
      last: null,
      pendingAutoFillItem: null,
      detectedAt: null,
      lastClearedTimestamp: null,
      activeClipboardSource: null
    })
    hook = useSearch(boxOptions, clipboardOptions)
    return () => h('div')
  }
})

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function emit(stream: SearchStream, chunk: object): void {
  stream.options.onData({ sessionId: stream.sessionId, ...chunk })
}

function snapshot(stream: SearchStream, ids: string[]): void {
  const result: TuffSearchResult = {
    items: ids.map(row),
    query: { text: stream.text, inputs: [] },
    duration: 1,
    sources: [],
    sessionId: stream.sessionId
  }
  emit(stream, { type: 'snapshot', result })
}

/** The three flags together, so every step reads as one state. */
function cue(): { loading: boolean; awaiting: boolean; settling: boolean } {
  return {
    loading: hook.loading.value,
    awaiting: hook.awaitingFirstResults.value,
    settling: hook.searchSettling.value
  }
}

const WAITING = { loading: true, awaiting: true, settling: false }
const SETTLING = { loading: true, awaiting: false, settling: true }
const IDLE = { loading: false, awaiting: false, settling: false }

async function search(text: string): Promise<SearchStream> {
  hook.searchVal.value = text
  await settle()
  const stream = state.streams.at(-1)!
  expect(stream.text).toBe(text)
  return stream
}

beforeEach(async () => {
  state.streams.length = 0
  state.executeGate = null
  wrapper = mount(Host)
  await settle()
  // The recommendation grid the box opens on.
  const opening = state.streams.at(-1)!
  snapshot(opening, ['recommended'])
  emit(opening, { type: 'complete' })
  await settle()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('useSearch searching-cue state', () => {
  it('lets the cue go once the first rows land, and settles until the session completes', async () => {
    const stream = await search('wx')
    expect(cue()).toEqual(WAITING)

    snapshot(stream, ['wechat'])
    await settle()
    // The apps are up; the deferred layer is still gathering, so `loading` stays as it was.
    expect(cue()).toEqual(SETTLING)

    emit(stream, { type: 'update', items: [row('file-wx')] })
    await settle()
    expect(cue()).toEqual(SETTLING)

    emit(stream, { type: 'complete' })
    await settle()
    expect(cue()).toEqual(IDLE)
  })

  it('keeps waiting through an empty snapshot until the deferred layer brings rows', async () => {
    const stream = await search('report')

    snapshot(stream, [])
    await settle()
    expect(cue()).toEqual(WAITING)

    emit(stream, { type: 'update', items: [row('file-report')] })
    await settle()
    expect(cue()).toEqual(SETTLING)
  })

  it('waits again for a new query, even with the previous query’s rows still on screen', async () => {
    const first = await search('wx')
    snapshot(first, ['wechat'])
    emit(first, { type: 'complete' })
    await settle()
    expect(cue()).toEqual(IDLE)

    const next = await search('wxy')
    expect(hook.res.value.map((item) => item.id)).toEqual(['wechat'])
    expect(cue()).toEqual(WAITING)

    snapshot(next, ['wechat-work'])
    await settle()
    expect(cue()).toEqual(SETTLING)
  })

  it('treats a re-run of the query on screen as settling: its rows are already up', async () => {
    const first = await search('wx')
    snapshot(first, ['wechat'])
    emit(first, { type: 'complete' })
    await settle()

    // An index-commit refresh or the re-run on show. It resolves with its snapshot, so not awaited.
    const rerunning = hook.handleSearchImmediate({ force: true })
    await settle()
    const rerun = state.streams.at(-1)!
    expect(rerun).not.toBe(first)
    expect(rerun.text).toBe('wx')
    expect(cue()).toEqual(SETTLING)

    snapshot(rerun, ['wechat'])
    emit(rerun, { type: 'complete' })
    await rerunning
    await settle()
    expect(cue()).toEqual(IDLE)
  })

  it('lets the recommendation grid’s snapshot end the wait, over whatever was on screen', async () => {
    const text = await search('wx')
    snapshot(text, ['wechat'])
    emit(text, { type: 'complete' })
    await settle()

    hook.searchVal.value = ''
    await settle()
    const grid = state.streams.at(-1)!
    expect(grid.text).toBe('')
    expect(cue()).toEqual(WAITING)

    snapshot(grid, ['recommended'])
    await settle()
    expect(cue()).toEqual(IDLE)
  })

  it('never reports an execute in flight as still searching more', async () => {
    const stream = await search('wx')
    snapshot(stream, ['wechat'])
    await settle()
    expect(cue()).toEqual(SETTLING)

    state.executeGate = Promise.withResolvers<unknown>()
    const item = { ...row('open-settings'), meta: { keepCoreBoxOpen: true } } as TuffItem
    const executing = hook.handleExecute(item)
    await settle()
    expect(cue()).toEqual(WAITING)

    state.executeGate.resolve(null)
    await executing
    await settle()
  })
})
