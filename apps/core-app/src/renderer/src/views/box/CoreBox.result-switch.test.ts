// @vitest-environment jsdom
import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import type * as VueUse from '@vueuse/core'
import type * as Vue from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount, type VueWrapper } from '@vue/test-utils'
import * as sass from 'sass'
import { nextTick, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { appSetting } from '~/modules/storage/app-storage'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoreBox from './CoreBox.vue'

const state = vi.hoisted(() => ({
  activeActivations: undefined as unknown as Ref<unknown>,
  /** How many times the preview pane went from closed to open: each one plays its slide-in. */
  addonOpens: 0,
  boxOptions: undefined as unknown as IBoxOptions,
  captureFlipSnapshot: vi.fn<(root?: unknown) => unknown>(() => null),
  handleExecute: vi.fn<(item?: TuffItem) => Promise<void>>(async () => {}),
  layout: undefined as unknown as TuffContainerLayout | undefined,
  loading: undefined as unknown as Ref<boolean>,
  lowBatteryMode: undefined as unknown as Ref<boolean>,
  playFlip: vi.fn<(root?: unknown, snapshot?: unknown) => number>(() => 0),
  results: undefined as unknown as Ref<TuffItem[]>,
  scrollActiveItemIntoView: vi.fn(),
  scrollTo: vi.fn(),
  searchVal: undefined as unknown as Ref<string>
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: () => () => {},
    send: async () => undefined
  })
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/local-ai-cli', () => ({
  createLocalAiCliSdk: () => ({ getStatus: async () => ({ betaAvailable: false }) })
}))

vi.mock('~/components/render/addon/TuffItemAddon.vue', async () => {
  const { watch } = await vi.importActual<typeof Vue>('vue')
  return {
    default: {
      name: 'TuffItemAddon',
      props: ['type', 'item'],
      emits: ['openItem'],
      setup(props: { type?: string }) {
        watch(
          () => props.type,
          (type, previous) => {
            if (type && !previous) state.addonOpens += 1
          },
          { flush: 'sync', immediate: true }
        )
      },
      template:
        '<aside class="item-addon-stub" :data-type="type ?? \'none\'" :data-item="item?.id ?? \'none\'" />'
    }
  }
})

vi.mock('@vueuse/core', async (importOriginal) => {
  const original = await importOriginal<typeof VueUse>()
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return { ...original, useElementSize: () => ({ width: ref(0) }) }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: false })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    animation: { listItemStagger: false, resultTransition: true },
    diagnostics: { verboseLogs: false },
    tools: { autoHide: false }
  }
}))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { divisionBox: undefined }
}))

vi.mock('~/modules/hooks/useBatteryOptimizer', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  state.lowBatteryMode = ref(false)
  return {
    useBatteryOptimizer: () => ({ lowBatteryMode: state.lowBatteryMode }),
    useGlobalBatteryOptimizer: () => ({ lowBatteryMode: state.lowBatteryMode })
  }
})

vi.mock('~/modules/style/sanitizeUserCss', () => ({
  sanitizeUserCss: (css: string) => css
}))

/** The real hook's return, which the fake below must match key for key. */
type SearchHook = ReturnType<typeof import('../../modules/box/adapter/hooks/useSearch').useSearch>

vi.mock('../../modules/box/adapter/hooks/useSearch', async () => {
  const { computed, ref } = await vi.importActual<typeof Vue>('vue')
  state.results = ref<TuffItem[]>([])
  state.searchVal = ref('')
  state.loading = ref(false)
  state.activeActivations = ref<unknown>(null)

  return {
    // `satisfies` keeps the fake from drifting: a field the real hook gains and CoreBox reads would
    // otherwise be undefined here, and a harmless reordering in CoreBox would crash every test.
    useSearch: (boxOptions: IBoxOptions) =>
      ({
        searchVal: state.searchVal,
        select: ref(0),
        res: state.results,
        loading: state.loading,
        awaitingFirstResults: computed(() => false),
        searchSettling: computed(() => false),
        searchError: ref(false),
        recommendationPending: ref(false),
        activeItem: computed(() => state.results.value[boxOptions.focus] ?? null),
        activeActivations: state.activeActivations,
        replaceSearchResults: (items: TuffItem[]) => {
          state.results.value = items
        },
        handleExecute: state.handleExecute,
        handleExit: async () => {},
        handleSearchImmediate: async () => {},
        deactivateProvider: async () => true,
        deactivateAllProviders: async () => {}
      }) satisfies Record<keyof SearchHook, unknown>
  }
})

vi.mock('../../modules/box/adapter/hooks/useActionPanel', () => ({
  useActionPanel: () => ({ executeAction: async () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useChannel', () => ({
  useChannel: (boxOptions: IBoxOptions) => {
    state.boxOptions = boxOptions
    boxOptions.layout = state.layout as TuffContainerLayout | undefined
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
  captureFlipSnapshot: state.captureFlipSnapshot,
  playFlip: state.playFlip
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

function item(id: string, title: string): TuffItem {
  return {
    id,
    kind: 'feature',
    source: { id: 'corebox-test', type: 'plugin', name: 'CoreBox test' },
    render: { mode: 'default', basic: { title } }
  } as unknown as TuffItem
}

function fileItem(id: string): TuffItem {
  return {
    id,
    kind: 'file',
    source: { id: 'file-provider', type: 'file', name: 'Files' },
    render: { mode: 'default', basic: { title: `${id}.pdf` } },
    meta: { file: { path: `/Users/demo/${id}.pdf` } }
  } as unknown as TuffItem
}

const sectionedRecommendationLayout = {
  mode: 'grid',
  sections: [
    {
      id: 'recommendations',
      itemIds: ['recommended-result'],
      layout: 'grid',
      meta: { intelligence: true }
    }
  ]
} as TuffContainerLayout

const stubs = {
  BoxInput: { template: '<div class="box-input-stub" />' },
  BoxGrid: {
    props: ['items', 'layout'],
    template:
      '<section class="recommendation-grid" :data-layout-mode="layout?.mode ?? \'none\'"><div v-for="item in items" :key="item.id" class="recommendation-grid-row">{{ item.render.basic.title }}</div></section>'
  },
  CoreBoxFooter: {
    props: ['display', 'item', 'resultCount'],
    template:
      '<footer v-if="display" aria-label="selected-result">{{ item?.render?.basic?.title }} · {{ resultCount }}</footer>'
  },
  CoreBoxRender: {
    props: ['item'],
    template: '<div class="normal-list-row">{{ item.render.basic.title }}</div>'
  },
  DivisionBoxHeader: { template: '<div />' },
  FlowSelector: { template: '<div />' },
  PrefixPart: { template: '<div />' },
  PreviewHistoryPanel: { template: '<div />' },
  TagSection: { template: '<div />' },
  TuffIcon: { template: '<i />' },
  teleport: true
}

const pendingAnimationFrames = new Map<number, FrameRequestCallback>()

let wrapper: VueWrapper | null = null

function mountCoreBox({ realTransition = false } = {}) {
  const mounted = mount(CoreBox, {
    global: {
      plugins: [router],
      stubs: realTransition ? { ...stubs, transition: false } : stubs
    }
  })
  wrapper = mounted
  return mounted
}

function holdAnimationFrames(): void {
  let nextFrameId = 1
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++
      pendingAnimationFrames.set(frameId, callback)
      return frameId
    })
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((frameId: number) => {
      pendingAnimationFrames.delete(frameId)
    })
  )
}

beforeEach(() => {
  state.layout = undefined
  state.results.value = []
  state.searchVal.value = ''
  state.loading.value = false
  state.activeActivations.value = null
  state.lowBatteryMode.value = false
  state.addonOpens = 0
  state.captureFlipSnapshot.mockReset()
  state.handleExecute.mockClear()
  state.playFlip.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  pendingAnimationFrames.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('CoreBox result switching', () => {
  it('keeps a ready wx list result and its selected footer visible when the recommendation grid exit receives no frame', async () => {
    state.layout = sectionedRecommendationLayout
    state.results.value = [item('recommended-result', 'Recommended app')]

    const coreBox = mountCoreBox({ realTransition: true })
    await nextTick()

    expect(coreBox.get('.recommendation-grid-row').text()).toBe('Recommended app')

    holdAnimationFrames()
    ;(state.boxOptions as IBoxOptions).layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'wx'
    state.results.value = [item('wechat', '微信')]
    await nextTick()

    expect(coreBox.findAll('.normal-list-row').map((row) => row.text())).toEqual(['微信'])
    expect(coreBox.get('footer[aria-label="selected-result"]').text()).toBe('微信 · 1')
    expect(coreBox.find('.recommendation-grid').exists()).toBe(false)
  })

  it('shows only the latest normal-search replacement while the prior grid transition has no frame', async () => {
    state.layout = sectionedRecommendationLayout
    state.results.value = [item('recommended-result', 'Recommended app')]

    const coreBox = mountCoreBox({ realTransition: true })
    await nextTick()

    holdAnimationFrames()
    ;(state.boxOptions as IBoxOptions).layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'wx'
    state.results.value = [item('wechat', '微信')]
    await nextTick()

    state.searchVal.value = 'wechat'
    state.results.value = [item('wechat-desktop', 'WeChat')]
    await nextTick()

    expect(coreBox.findAll('.normal-list-row').map((row) => row.text())).toEqual(['WeChat'])
    expect(coreBox.get('footer[aria-label="selected-result"]').text()).toBe('WeChat · 1')
  })

  it('keeps a replacement recommendation grid and footer visible when a normal list exit has no frame', async () => {
    state.layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'wechat'
    state.results.value = [item('wechat-desktop', 'WeChat')]

    const coreBox = mountCoreBox({ realTransition: true })
    await nextTick()

    expect(coreBox.get('.normal-list-row').text()).toBe('WeChat')

    holdAnimationFrames()
    ;(state.boxOptions as IBoxOptions).layout = sectionedRecommendationLayout
    state.searchVal.value = ''
    state.results.value = [item('recommended-result', 'Recommended app')]
    await nextTick()

    expect(coreBox.findAll('.recommendation-grid-row').map((row) => row.text())).toEqual([
      'Recommended app'
    ])
    expect(coreBox.get('footer[aria-label="selected-result"]').text()).toBe('Recommended app · 1')
    expect(coreBox.find('.normal-list-row').exists()).toBe(false)
  })

  it('replaces a sectioned recommendation grid with the next list result immediately when low power disables result transitions', async () => {
    const results = state.results
    state.lowBatteryMode.value = true
    state.layout = sectionedRecommendationLayout
    results.value = [item('recommended-result', 'Recommended app')]

    const coreBox = mountCoreBox()
    await nextTick()

    expect(coreBox.get('.recommendation-grid-row').text()).toBe('Recommended app')
    ;(state.boxOptions as IBoxOptions).layout = { mode: 'list' } as TuffContainerLayout
    results.value = [item('search-result', 'Search result')]
    await nextTick()

    expect(coreBox.get('.normal-list-row').text()).toBe('Search result')
    expect(coreBox.find('.recommendation-grid').exists()).toBe(false)
  })
})

describe('CoreBox selection visibility', () => {
  const ROW_HEIGHT = 48
  const VIEWPORT_HEIGHT = 240
  /** How far the list is scrolled: row N sits at N × ROW_HEIGHT − listScrollTop. */
  let listScrollTop = 0
  let rectSpy: { mockRestore: () => void } | null = null

  const scrollStub = {
    name: 'TxScroll',
    template: '<div class="tx-scroll"><slot /></div>',
    methods: {
      scrollTo(x: number, y: number) {
        state.scrollTo(x, y)
      }
    }
  }

  function rows(prefix: string, count: number): TuffItem[] {
    return Array.from({ length: count }, (_, index) =>
      item(`${prefix}-${index}`, `${prefix} ${index}`)
    )
  }

  /** Mounts a list of results and moves the selection the way a key press would. */
  async function mountList(query: string, results: TuffItem[], focus: number): Promise<void> {
    state.layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = query
    state.results.value = results
    wrapper = mount(CoreBox, {
      global: { plugins: [router], stubs: { ...stubs, TxScroll: scrollStub } }
    })
    await nextTick()
    state.boxOptions.focus = focus
    await nextTick()
    state.scrollTo.mockClear()
    state.scrollActiveItemIntoView.mockClear()
  }

  beforeEach(() => {
    listScrollTop = 0
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      if (this.classList.contains('tx-scroll')) return new DOMRect(0, 0, 320, VIEWPORT_HEIGHT)
      if (!this.classList.contains('normal-list-row')) return new DOMRect()
      const index = Array.prototype.indexOf.call(this.parentElement?.children ?? [], this)
      return new DOMRect(0, index * ROW_HEIGHT - listScrollTop, 320, ROW_HEIGHT)
    })
  })

  afterEach(() => {
    rectSpy?.mockRestore()
    rectSpy = null
    state.scrollTo.mockClear()
    state.scrollActiveItemIntoView.mockClear()
  })

  it('scrolls back to the top when a new query replaces the results', async () => {
    await mountList('pd', rows('pd', 12), 7)

    // useSearch resets the focus when the new query starts, while the old rows are still shown.
    // Like a key press, a focus-only change is not CoreBox's to scroll.
    state.searchVal.value = 'pdf'
    state.boxOptions.focus = 0
    await nextTick()
    expect(state.scrollTo).not.toHaveBeenCalled()

    state.results.value = rows('pdf', 12)
    await nextTick()

    expect(state.scrollTo).toHaveBeenCalledTimes(1)
    expect(state.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(state.scrollActiveItemIntoView).not.toHaveBeenCalled()
  })

  it('scrolls back to the top when CoreBox is shown again and its query re-runs', async () => {
    await mountList('pdf', rows('pdf', 12), 7)

    // Showing the box again forces a re-run of the same text: focus goes back to row 0 while the
    // rows from before the box was hidden are still up, scrolled to wherever they were left.
    window.dispatchEvent(new CustomEvent('corebox:shown'))
    state.boxOptions.focus = 0
    await nextTick()
    expect(state.scrollTo).not.toHaveBeenCalled()

    state.results.value = rows('pdf', 12)
    await nextTick()

    expect(state.scrollTo).toHaveBeenCalledTimes(1)
    expect(state.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(state.scrollActiveItemIntoView).not.toHaveBeenCalled()

    // Only the re-run's first results: a later batch of the same run leaves the list alone.
    state.scrollTo.mockClear()
    state.results.value = [...rows('pdf', 12), ...rows('batch', 3)]
    await nextTick()
    expect(state.scrollTo).not.toHaveBeenCalled()
  })

  it('brings a visible selected row back into view when a re-rank moves it', async () => {
    const results = rows('file', 12)
    await mountList('pdf', results, 2)

    // A later batch lands six rows above the selection, which follows its item to row 8.
    state.results.value = [...rows('batch', 6), ...results]
    state.boxOptions.focus = 8
    await nextTick()

    expect(state.scrollActiveItemIntoView).toHaveBeenCalledTimes(1)
    expect(state.scrollTo).not.toHaveBeenCalled()
  })

  it('brings the selection into view when a later batch hands it back to the row the user picked', async () => {
    // An index-commit refresh keeps the row the user picked, but its fast snapshot often lacks
    // that file, so focus falls back to row 0. The deferred batch that returns the file moves the
    // selection back onto it, further down the list.
    const results = rows('file', 12)
    await mountList('pdf', results, 0)

    state.results.value = [...rows('batch', 6), ...results]
    state.boxOptions.focus = 8
    await nextTick()

    expect(state.scrollActiveItemIntoView).toHaveBeenCalledTimes(1)
    expect(state.scrollTo).not.toHaveBeenCalled()
  })

  it('leaves the list alone when the user had scrolled the selected row out of view', async () => {
    const results = rows('file', 12)
    await mountList('pdf', results, 2)
    listScrollTop = 6 * ROW_HEIGHT

    state.results.value = [...rows('batch', 6), ...results]
    state.boxOptions.focus = 8
    await nextTick()

    expect(state.scrollActiveItemIntoView).not.toHaveBeenCalled()
    expect(state.scrollTo).not.toHaveBeenCalled()
  })
})

describe('CoreBox preview pane', () => {
  /** A list with the selection on row 0; the pane opens at once if that row is a file. */
  async function mountMixedList(results: TuffItem[]): Promise<VueWrapper> {
    state.layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'report'
    state.results.value = results
    const coreBox = mountCoreBox()
    await nextTick()
    return coreBox
  }

  function paneState(coreBox: VueWrapper): { compressed: boolean; type?: string; item?: string } {
    const pane = coreBox.get('.item-addon-stub')
    return {
      compressed: coreBox.get('.CoreBoxRes-Main').classes('compressed'),
      type: pane.attributes('data-type'),
      item: pane.attributes('data-item')
    }
  }

  async function select(index: number): Promise<void> {
    state.boxOptions.focus = index
    await nextTick()
  }

  const closed = { compressed: false, type: 'none', item: 'none' }

  it('stays open across a mixed list and closes once the selection rests off files', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([
      item('app-0', 'App 0'),
      fileItem('file-1'),
      item('app-2', 'App 2'),
      fileItem('file-3')
    ])
    expect(paneState(coreBox)).toEqual(closed)

    // Arrowing app → file → app → file → app, one row every 50ms.
    await select(1)
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-1' })
    vi.advanceTimersByTime(50)
    await select(2)
    // Off the file, the pane keeps showing it instead of the app row now selected.
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-1' })
    vi.advanceTimersByTime(50)
    await select(3)
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-3' })
    vi.advanceTimersByTime(50)
    await select(2)
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-3' })

    vi.advanceTimersByTime(150)
    await nextTick()
    expect(paneState(coreBox).compressed).toBe(true)

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)
    // One slide-in for the whole walk: the pane never closed between the two files.
    expect(state.addonOpens).toBe(1)
  })

  it('restarts the wait on every row off files, so a sweep past several apps stays open', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([
      fileItem('file-0'),
      item('app-1', 'App 1'),
      item('app-2', 'App 2'),
      item('app-3', 'App 3'),
      item('app-4', 'App 4')
    ])

    for (const index of [1, 2, 3, 4]) {
      vi.advanceTimersByTime(150)
      await select(index)
      expect(paneState(coreBox)).toMatchObject({ compressed: true, item: 'file-0' })
    }

    vi.advanceTimersByTime(250)
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)
  })

  it('closes at once when new results no longer hold the file it shows', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([fileItem('file-0'), item('app-1', 'App 1')])
    expect(paneState(coreBox)).toMatchObject({ compressed: true, item: 'file-0' })

    // A new query: row 0 is now an app, and the file is not among the results any more.
    state.searchVal.value = 'reporter'
    state.results.value = [item('app-a', 'App A'), item('app-b', 'App B')]
    await nextTick()

    expect(paneState(coreBox)).toEqual(closed)
  })

  /**
   * useSearch starts a new query by moving the selection to row 0 while the previous query's rows
   * are still up, and a cleared query keeps them up until the grid lands. A file there belongs to
   * the query the user just left.
   */
  it('does not preview a file of the rows a cleared query left up while the grid loads', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([
      fileItem('file-0'),
      item('app-1', 'App 1'),
      item('app-2', 'App 2')
    ])
    await select(2)
    vi.advanceTimersByTime(250)
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)
    state.addonOpens = 0

    state.searchVal.value = ''
    state.loading.value = true
    state.boxOptions.focus = 0
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)

    state.results.value = [item('app-x', 'App X'), item('app-y', 'App Y')]
    state.loading.value = false
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)
    expect(state.addonOpens).toBe(0)
  })

  it('keeps the file the user picked while a refined query loads, and closes as its rows land', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([
      fileItem('file-0'),
      fileItem('file-1'),
      fileItem('file-2')
    ])
    await select(2)
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-2' })

    state.searchVal.value = 'reports'
    state.loading.value = true
    state.boxOptions.focus = 0
    await nextTick()
    // Not the previous query's row 0, which the selection only landed on while the query loads.
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-2' })

    // The refined query's rows land with an app on top, while the rest of the search streams on.
    state.results.value = [item('app-a', 'App A'), item('app-b', 'App B')]
    await nextTick()
    expect(paneState(coreBox)).toEqual(closed)
  })

  it('rides out a same-query refresh whose fast snapshot drops the file for a moment', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([item('app-0', 'App 0'), fileItem('file-1')])
    await select(1)

    // An index-commit refresh of the same text: its fast snapshot lacks the file, so focus falls
    // back to row 0, and the deferred batch hands the file back a moment later.
    state.results.value = [item('app-0', 'App 0')]
    state.boxOptions.focus = 0
    await nextTick()
    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-1' })

    vi.advanceTimersByTime(120)
    state.results.value = [item('app-0', 'App 0'), fileItem('file-1')]
    state.boxOptions.focus = 1
    await nextTick()

    expect(paneState(coreBox)).toEqual({ compressed: true, type: 'preview', item: 'file-1' })
    expect(state.addonOpens).toBe(1)
  })

  it('opens the file the pane shows, not the row selected while it waits to close', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([fileItem('file-0'), item('app-1', 'App 1')])
    await select(1)

    coreBox.getComponent({ name: 'TuffItemAddon' }).vm.$emit('openItem')

    expect(state.handleExecute).toHaveBeenCalledTimes(1)
    expect(state.handleExecute.mock.calls[0]?.[0]?.id).toBe('file-0')
  })

  it('drops a pending close when CoreBox unmounts', async () => {
    vi.useFakeTimers()
    const coreBox = await mountMixedList([fileItem('file-0'), item('app-1', 'App 1')])
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    await select(1)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
    const closeTimer = setTimeoutSpy.mock.results[0]?.value

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    coreBox.unmount()
    wrapper = null

    expect(clearTimeoutSpy).toHaveBeenCalledWith(closeTimer)
    setTimeoutSpy.mockRestore()
    clearTimeoutSpy.mockRestore()
  })
})

describe('CoreBox motion gate', () => {
  const snapshot = { rects: new Map() }

  beforeEach(() => {
    state.captureFlipSnapshot.mockReturnValue(snapshot)
  })

  /** Opens the preview pane from a grid, which re-wraps the grid under a FLIP when motion is on. */
  async function openPaneInGrid(): Promise<VueWrapper> {
    vi.useFakeTimers()
    state.layout = { mode: 'grid' } as TuffContainerLayout
    state.results.value = [item('app-0', 'App 0'), fileItem('file-1')]
    const coreBox = mountCoreBox()
    await nextTick()
    state.boxOptions.focus = 1
    await nextTick()
    await nextTick()
    return coreBox
  }

  it('plays the grid FLIP from the layout before the pane opened to the one after', async () => {
    const isCompressed = (root: unknown): boolean | undefined =>
      root instanceof HTMLElement
        ? root.closest('.CoreBoxRes-Main')?.classList.contains('compressed')
        : undefined
    const compressedAt: { capture?: boolean; play?: boolean } = {}
    state.captureFlipSnapshot.mockImplementation((root) => {
      compressedAt.capture = isCompressed(root)
      return snapshot
    })
    state.playFlip.mockImplementation((root) => {
      compressedAt.play = isCompressed(root)
      return 1
    })

    await openPaneInGrid()

    expect(state.captureFlipSnapshot).toHaveBeenCalledTimes(1)
    expect(state.playFlip).toHaveBeenCalledTimes(1)
    expect(state.playFlip).toHaveBeenCalledWith(expect.any(HTMLElement), snapshot)
    // Rects are read before the DOM switches to the compressed column, and played after it did.
    expect(compressedAt).toEqual({ capture: false, play: true })
  })

  it('lands the re-wrapped grid without a FLIP in low-battery mode', async () => {
    state.lowBatteryMode.value = true
    const coreBox = await openPaneInGrid()

    expect(coreBox.get('.CoreBoxRes-Main').classes()).toContain('compressed')
    expect(state.captureFlipSnapshot).not.toHaveBeenCalled()
    expect(state.playFlip).not.toHaveBeenCalled()
  })

  /**
   * A file previewed from a list, then the query cleared: the recommendation grid lands and the
   * pane closes in the same update. What is on screen when the grid FLIP would read is the list,
   * whose rows carry the same item ids as the tiles (list motion keys them), so a tile would morph
   * out of a full-width row.
   */
  it('does not play the grid FLIP from the list a grid replaces as the pane closes', async () => {
    vi.useFakeTimers()
    state.layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'report'
    state.results.value = [fileItem('file-0'), item('app-1', 'App 1')]
    const coreBox = mountCoreBox()
    await nextTick()
    expect(coreBox.get('.CoreBoxRes-Main').classes()).toContain('compressed')

    state.boxOptions.layout = { mode: 'grid' } as TuffContainerLayout
    state.searchVal.value = ''
    state.results.value = [item('app-1', 'App 1'), item('app-2', 'App 2')]
    await nextTick()
    await nextTick()

    expect(coreBox.find('.recommendation-grid').exists()).toBe(true)
    expect(coreBox.get('.CoreBoxRes-Main').classes()).not.toContain('compressed')
    expect(state.captureFlipSnapshot).not.toHaveBeenCalled()
    expect(state.playFlip).not.toHaveBeenCalled()
  })

  it('lands the re-wrapped grid without a FLIP when the system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }))
    const coreBox = await openPaneInGrid()

    expect(coreBox.get('.CoreBoxRes-Main').classes()).toContain('compressed')
    expect(state.captureFlipSnapshot).not.toHaveBeenCalled()
    expect(state.playFlip).not.toHaveBeenCalled()
  })
})

/**
 * The list FLIP and the browser's scroll anchoring must not both act on a row. Rows landing above a
 * scrolled list are held still by anchoring, which adjusts the scroll; the FLIP measures against the
 * list and would then slide them in from a place they were never drawn at. So while the FLIP can
 * play, the list opts out of anchoring; with it off, anchoring keeps rows where they are, as before.
 * The class is asserted on a mounted CoreBox and the rule it switches on in the compiled stylesheet:
 * vitest leaves SFC styles uncompiled, and jsdom does no scroll anchoring.
 */
describe('CoreBox list scroll anchoring', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const sfcPath = resolve(here, 'CoreBox.vue')
  const animation = appSetting.animation as { resultTransition?: boolean }

  afterEach(() => {
    animation.resultTransition = true
  })

  async function mountList(): Promise<VueWrapper> {
    state.layout = { mode: 'list' } as TuffContainerLayout
    state.searchVal.value = 'wx'
    state.results.value = [item('wechat', '微信'), item('wecom', '企业微信')]
    const coreBox = mountCoreBox()
    await nextTick()
    return coreBox
  }

  function optsOut(coreBox: VueWrapper): boolean {
    return coreBox.get('.item-list').classes().includes('item-list--flip')
  }

  it('opts the list out of scroll anchoring while its FLIP can play', async () => {
    const coreBox = await mountList()
    expect(optsOut(coreBox)).toBe(true)

    // Low battery stops the FLIP, and gives the rows back to anchoring as it does.
    state.lowBatteryMode.value = true
    await nextTick()
    expect(optsOut(coreBox)).toBe(false)
  })

  it('keeps default anchoring with the result transition setting off', async () => {
    animation.resultTransition = false
    const coreBox = await mountList()

    expect(optsOut(coreBox)).toBe(false)
  })

  it('keeps default anchoring when the system asks for reduced motion, where no FLIP plays', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }))
    const coreBox = await mountList()

    expect(optsOut(coreBox)).toBe(false)
  })

  it('switches anchoring off for that list alone, and nothing else in CoreBox', () => {
    const blocks = [...readFileSync(sfcPath, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    const css = blocks
      .map(
        ([, block]) =>
          sass.compileString(block ?? '', { url: pathToFileURL(sfcPath), syntax: 'scss' }).css
      )
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const anchoring = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /overflow-anchor\s*:/.test(body ?? ''))
      .map(([, selector, body]) => ({
        selector: (selector ?? '').trim(),
        value: /overflow-anchor\s*:\s*([^;]+)/.exec(body ?? '')?.[1]?.trim()
      }))

    expect(anchoring).toEqual([
      { selector: '.CoreBoxRes-Main > .scroll-area .item-list.item-list--flip', value: 'none' }
    ])
  })
})
