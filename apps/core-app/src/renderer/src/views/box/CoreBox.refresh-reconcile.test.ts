// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import type * as VueUse from '@vueuse/core'
import type * as Vue from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoreBox from './CoreBox.vue'

/**
 * CoreBox on the real useSearch, with the search streams driven by hand. A refresh of the query on
 * screen (D4) must patch the rows it delivers again in place, keeping their DOM nodes, and remove
 * the others only when it completes. CoreBox.result-switch.test.ts stubs useSearch, so it cannot
 * see this.
 */

interface StreamOptions {
  onData: (payload: unknown) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

const state = vi.hoisted(() => ({
  boxOptions: undefined as unknown as IBoxOptions,
  indexCommits: null as StreamOptions | null,
  listeners: new Map<string, (payload?: unknown) => void>(),
  scrollActiveItemIntoView: vi.fn(),
  searchStreams: [] as Array<{ sessionId: string; options: StreamOptions }>
}))

vi.mock('@talex-touch/utils/transport', () => {
  const nameOf = (event: unknown): string =>
    typeof event === 'string'
      ? event
      : ((event as { toEventName?: () => string } | null)?.toEventName?.() ?? String(event))
  return {
    useTuffTransport: () => ({
      on: (event: unknown, callback: (payload?: unknown) => void) => {
        state.listeners.set(nameOf(event), callback)
        return () => {
          state.listeners.delete(nameOf(event))
        }
      },
      send: async (event: unknown) => (nameOf(event).includes('provider') ? [] : undefined),
      stream: async (event: unknown, _payload: unknown, options: StreamOptions) => {
        const name = nameOf(event)
        if (name === 'core-box:search:index-committed') state.indexCommits = options
        if (name === 'core-box:search:session') {
          const sessionId = `session-${state.searchStreams.length + 1}`
          state.searchStreams.push({ sessionId, options })
          options.onData({ type: 'session', sessionId })
        }
        return { cancel: () => {} }
      }
    })
  }
})

vi.mock('@talex-touch/utils/transport/sdk/domains/local-ai-cli', () => ({
  createLocalAiCliSdk: () => ({ getStatus: async () => ({ betaAvailable: false }) })
}))

vi.mock('~/components/render/addon/TuffItemAddon.vue', () => ({
  default: {
    name: 'TuffItemAddon',
    props: ['type', 'item'],
    template:
      '<aside class="item-addon-stub" :data-type="type ?? \'none\'" :data-item="item?.id ?? \'none\'" />'
  }
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const original = await importOriginal<typeof VueUse>()
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return {
    ...original,
    useElementSize: () => ({ width: ref(0) }),
    useDebounceFn: (fn: (...args: unknown[]) => unknown) =>
      Object.assign((...args: unknown[]) => fn(...args), { cancel: () => {} })
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: false })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    animation: { listItemStagger: false, resultTransition: false },
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    searchEngine: { logsEnabled: false },
    tools: { autoHide: false, autoPaste: { enable: true, time: 5 } }
  }
}))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { divisionBox: undefined }
}))

vi.mock('~/modules/hooks/useBatteryOptimizer', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  const lowBatteryMode = ref(false)
  return {
    useBatteryOptimizer: () => ({ lowBatteryMode }),
    useGlobalBatteryOptimizer: () => ({ lowBatteryMode })
  }
})

vi.mock('~/modules/style/sanitizeUserCss', () => ({
  sanitizeUserCss: (css: string) => css
}))

vi.mock('~/utils/dev-log', () => ({ devLog: () => {} }))

vi.mock('~/modules/box/item-sdk', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return { useBoxItems: () => ({ items: ref([]) }) }
})

vi.mock('../../modules/box/adapter/transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({ broadcast: () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useResize', () => ({ useResize: () => {} }))

vi.mock('../../modules/box/adapter/hooks/useClipboardChannel', () => ({
  getLatestClipboard: async () => null
}))

vi.mock('../../modules/box/adapter/hooks/useActionPanel', () => ({
  useActionPanel: () => ({ executeAction: async () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useChannel', () => ({
  useChannel: (boxOptions: IBoxOptions) => {
    state.boxOptions = boxOptions
  }
}))

vi.mock('../../modules/box/adapter/hooks/useClipboard', () => ({
  useClipboard: () => ({
    handlePaste: () => {},
    clearClipboard: () => {},
    resetAutoPasteState: () => {},
    cleanup: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useDetach', () => ({
  useDetach: () => ({
    flowVisible: false,
    flowSessionId: '',
    flowPayload: undefined,
    closeFlowSelector: () => {},
    dispatchFlow: () => {},
    openFlowSelector: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useFocus', () => ({
  useFocus: () => ({ focusInput: () => {}, focusWindowAndInput: async () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useKeyboard', () => ({
  useKeyboard: () => ({ scrollActiveItemIntoView: state.scrollActiveItemIntoView })
}))

vi.mock('../../modules/box/adapter/hooks/usePreviewHistory', () => ({
  usePreviewHistory: () => ({
    visible: false,
    loading: false,
    items: [],
    activeIndex: 0,
    handleContextMenu: () => {},
    apply: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useVisibility', () => ({
  useVisibility: () => ({ cleanup: () => {}, checkAutoClear: () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/flip-layout', () => ({
  captureFlipSnapshot: () => null,
  playFlip: () => 0
}))

vi.mock('./theme', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return {
    useCoreBoxTheme: () => ({
      themeConfig: ref({
        logo: { position: 'hidden' },
        input: { background: 'default', border: 'default' },
        results: { hoverStyle: 'default' },
        customCSS: ''
      }),
      themeCSSVars: ref({}),
      canvasConfig: ref({
        items: [],
        columns: 1,
        rowHeight: 1,
        gap: 0,
        colorVars: undefined,
        customCSS: ''
      }),
      canvasEnabled: ref(false)
    })
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})

const stubs = {
  BoxInput: { template: '<div class="box-input-stub" />' },
  BoxGrid: { template: '<section />' },
  CoreBoxFooter: { template: '<footer />' },
  CoreBoxRender: {
    props: ['item'],
    template: '<div class="normal-list-row" :data-id="item.id">{{ item.render.basic.title }}</div>'
  },
  DivisionBoxHeader: { template: '<div />' },
  FlowSelector: { template: '<div />' },
  PrefixPart: { template: '<div />' },
  PreviewHistoryPanel: { template: '<div />' },
  TagSection: { template: '<div />' },
  TuffIcon: { template: '<i />' },
  teleport: true
}

const QUERY = 'report'

/** A fresh object on every call, as each chunk arrives over IPC. */
function row(id: string): TuffItem {
  const isFile = id.startsWith('file')
  return {
    id,
    kind: isFile ? 'file' : 'app',
    source: isFile
      ? { id: 'file-provider', type: 'file' }
      : { id: 'app-provider', type: 'application' },
    render: { mode: 'default', basic: { title: id } },
    ...(isFile ? { meta: { file: { path: `/Users/demo/${id}.md` } } } : {})
  } as TuffItem
}

function snapshot(sessionId: string, itemIds: string[]): TuffSearchResult {
  return {
    items: itemIds.map(row),
    query: { text: QUERY, inputs: [] },
    duration: 1,
    sources: [],
    sessionId
  }
}

function emit(stream: { sessionId: string; options: StreamOptions }, chunk: object): void {
  stream.options.onData({ sessionId: stream.sessionId, ...chunk })
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.useFakeTimers()
  state.indexCommits = null
  state.listeners.clear()
  state.searchStreams.length = 0
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('CoreBox same-query refresh', () => {
  it('keeps the DOM node of every row the refresh delivers again, and drops the rest at completion', async () => {
    wrapper = mount(CoreBox, { global: { plugins: [router], stubs } })
    await flush()

    state.listeners.get('core-box:input:set-query')?.({ value: QUERY })
    await flush()
    const search = state.searchStreams.at(-1)!
    emit(search, {
      type: 'snapshot',
      result: snapshot(search.sessionId, ['app', 'file-a', 'file-b'])
    })
    emit(search, { type: 'complete' })
    await flush()

    const coreBox = wrapper
    const renderedIds = (): Array<string | undefined> =>
      coreBox.findAll('.normal-list-row').map((node) => node.attributes('data-id'))
    const nodeOf = (id: string): Element => coreBox.get(`[data-id="${id}"]`).element
    expect(renderedIds()).toEqual(['app', 'file-a', 'file-b'])

    // The user moves to the first file; its preview opens.
    state.boxOptions.focus = 1
    await flush()
    const nodes = { app: nodeOf('app'), fileA: nodeOf('file-a'), fileB: nodeOf('file-b') }

    state.indexCommits?.onData({ revision: 1, providerIds: ['file-provider'], committedAt: 1 })
    await vi.advanceTimersByTimeAsync(500)
    await flush()
    const refresh = state.searchStreams.at(-1)!
    expect(refresh).not.toBe(search)

    // The refresh's fast snapshot has neither file; both rows stay, on the same nodes.
    emit(refresh, { type: 'snapshot', result: snapshot(refresh.sessionId, ['app']) })
    await flush()
    expect(renderedIds()).toEqual(['app', 'file-a', 'file-b'])
    expect(nodeOf('app')).toBe(nodes.app)
    expect(nodeOf('file-a')).toBe(nodes.fileA)
    expect(nodeOf('file-b')).toBe(nodes.fileB)
    expect(wrapper.get('.item-addon-stub').attributes('data-item')).toBe('file-a')

    // The deferred layer delivers the first file again.
    emit(refresh, { type: 'update', items: [row('file-a')] })
    await flush()
    expect(nodeOf('file-a')).toBe(nodes.fileA)

    // Completion removes only the row the refresh never delivered again.
    emit(refresh, { type: 'complete' })
    await flush()
    expect(renderedIds()).toEqual(['app', 'file-a'])
    expect(nodeOf('app')).toBe(nodes.app)
    expect(nodeOf('file-a')).toBe(nodes.fileA)
    expect(nodes.fileB.isConnected).toBe(false)
    expect(state.boxOptions.focus).toBe(1)
    expect(wrapper.get('.item-addon-stub').attributes('data-item')).toBe('file-a')
  })

  it('moves the selection to row 0 and into view when completion removes the selected row', async () => {
    // Rows stack 48px apart in a 480px viewport, so every row is on screen.
    const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      if (this.classList.contains('scroll-area')) return new DOMRect(0, 0, 320, 480)
      if (!this.classList.contains('normal-list-row')) return new DOMRect()
      const index = Array.prototype.indexOf.call(this.parentElement?.children ?? [], this)
      return new DOMRect(0, index * 48, 320, 48)
    })
    try {
      wrapper = mount(CoreBox, { global: { plugins: [router], stubs } })
      await flush()
      state.listeners.get('core-box:input:set-query')?.({ value: QUERY })
      await flush()
      const search = state.searchStreams.at(-1)!
      emit(search, {
        type: 'snapshot',
        result: snapshot(search.sessionId, ['app', 'app-2', 'file-a'])
      })
      emit(search, { type: 'complete' })
      await flush()
      state.boxOptions.focus = 2
      await flush()
      state.scrollActiveItemIntoView.mockClear()

      state.indexCommits?.onData({ revision: 1, providerIds: ['file-provider'], committedAt: 1 })
      await vi.advanceTimersByTimeAsync(500)
      await flush()
      const refresh = state.searchStreams.at(-1)!
      emit(refresh, { type: 'snapshot', result: snapshot(refresh.sessionId, ['app', 'app-2']) })
      await flush()
      // Kept until completion, and still selected.
      expect(state.boxOptions.focus).toBe(2)
      expect(state.scrollActiveItemIntoView).not.toHaveBeenCalled()

      emit(refresh, { type: 'complete' })
      await flush()
      expect(state.boxOptions.focus).toBe(0)
      // The selection was on screen, so keyboard-jump's R4 rule brings row 0 into view.
      expect(state.scrollActiveItemIntoView).toHaveBeenCalledTimes(1)
    } finally {
      rects.mockRestore()
    }
  })
})
