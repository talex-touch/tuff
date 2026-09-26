// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import type * as VueUse from '@vueuse/core'
import type * as Vue from 'vue'
import type { Ref } from 'vue'
import { TxPrismGlow } from '@talex-touch/tuffex/prism-glow'
import { mount, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCoreBoxFooterFeedback,
  COREBOX_FOOTER_FEEDBACK_MS,
  showCoreBoxFooterFeedback
} from '../../modules/box/meta-actions/footer-feedback'
import CoreBox from './CoreBox.vue'

/**
 * The header's status slot, on the real useSearch with the search streams driven by hand:
 * - the searching glow means "nothing of this query is on screen yet", not "the session is still
 *   open" — the files keep a session open for seconds after the apps land
 *   (09-26-corebox-pulse-semantics); it is the header's first child and retracts as the wrapper
 *   grows;
 * - the search status is announced from one always-mounted live region on the wrapper; the quieter
 *   "still searching" status follows the glow's rule, and the texts drawn in the header are visual
 *   copies shown only when motion is degraded;
 * - an action's outcome shows here when there is no footer to show it (plugin UI mode).
 */

interface StreamOptions {
  onData: (payload: unknown) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

interface SearchStream {
  sessionId: string
  options: StreamOptions
}

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  lowBatteryMode: undefined as unknown as Ref<boolean>,
  searchStreams: [] as SearchStream[],
  /** CoreBox's window, or a DivisionBox with a config: reactive, as the real one is. */
  windowState: undefined as unknown as {
    type: 'corebox' | 'division-box'
    divisionBox?: { config?: { url?: string } }
  }
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
        if (nameOf(event) === 'core-box:search:session') {
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
  default: { name: 'TuffItemAddon', props: ['type', 'item'], template: '<aside />' }
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

vi.mock('~/modules/hooks/core-box', async () => {
  const { reactive } = await vi.importActual<typeof Vue>('vue')
  state.windowState = reactive({ type: 'corebox' })
  return {
    isDivisionBoxMode: () => state.windowState.type === 'division-box',
    windowState: state.windowState
  }
})

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

vi.mock('~/utils/dev-log', () => ({ devLog: () => {} }))

// For the tests that mount the real footer: no file index is building.
vi.mock('~/composables/useFileIndexMonitor', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return {
    useFileIndexMonitor: () => ({ onProgressUpdate: () => () => {}, indexProgress: ref(null) })
  }
})

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
  useChannel: (_boxOptions: IBoxOptions) => {}
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
  useKeyboard: () => ({ scrollActiveItemIntoView: () => {} })
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

/** Whether the stub footer says it is on screen, as the real one exposes it. */
const footerOnScreen = ref(true)

const stubs = {
  BoxInput: { template: '<div class="box-input-stub" />' },
  BoxGrid: { template: '<section />' },
  CoreBoxFooter: defineComponent({
    name: 'CoreBoxFooter',
    setup(_props, { expose }) {
      expose({ onScreen: computed(() => footerOnScreen.value) })
      return () => h('footer', { class: 'footer-stub' })
    }
  }),
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

/** The searching cue's anti-flicker delay (CoreBox.vue), and the settling status's. */
const CUE_DELAY_MS = 600
const SETTLING_DELAY_MS = 300
const MIN_SHOWN_MS = 400

function row(id: string): TuffItem {
  return {
    id,
    kind: 'command',
    source: { id: 'test-source', type: 'system' },
    render: { mode: 'default', basic: { title: id } }
  } as TuffItem
}

function emit(stream: SearchStream, chunk: object): void {
  stream.options.onData({ sessionId: stream.sessionId, ...chunk })
}

function snapshot(
  stream: SearchStream,
  text: string,
  ids: string[],
  extra: Partial<TuffSearchResult> = {}
): void {
  const result: TuffSearchResult = {
    items: ids.map(row),
    query: { text, inputs: [] },
    duration: 1,
    sources: [],
    sessionId: stream.sessionId,
    ...extra
  }
  emit(stream, { type: 'snapshot', result })
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

async function wait(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
}

let wrapper: VueWrapper | null = null

/** CoreBox with its opening recommendation grid landed and nothing in flight. */
async function openCoreBox({ realFooter = false } = {}): Promise<VueWrapper> {
  wrapper = mount(CoreBox, {
    global: { plugins: [router], stubs: realFooter ? { ...stubs, CoreBoxFooter: false } : stubs }
  })
  await flush()
  const opening = state.searchStreams.at(-1)!
  snapshot(opening, '', ['recommended'])
  emit(opening, { type: 'complete' })
  await flush()
  return wrapper
}

async function search(query: string): Promise<SearchStream> {
  state.listeners.get('core-box:input:set-query')?.({ value: query })
  await flush()
  return state.searchStreams.at(-1)!
}

function glowActive(coreBox: VueWrapper): boolean {
  return coreBox.getComponent(TxPrismGlow).props('active') === true
}

function settlingStatus(coreBox: VueWrapper) {
  return coreBox.find('.CoreBox-SearchStatus--settling')
}

function progressStatus(coreBox: VueWrapper) {
  return coreBox.find('.CoreBox-SearchStatus--progress')
}

/** The one live region the search status is announced from. */
function searchAnnouncer(coreBox: VueWrapper) {
  return coreBox.get('.CoreBox-Wrapper > .CoreBox-SearchStatus-Live')
}

beforeEach(() => {
  vi.useFakeTimers()
  state.listeners.clear()
  state.searchStreams.length = 0
  state.lowBatteryMode.value = false
  state.windowState.type = 'corebox'
  delete state.windowState.divisionBox
  footerOnScreen.value = true
  clearCoreBoxFooterFeedback()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  clearCoreBoxFooterFeedback()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('CoreBox searching cue', () => {
  it('lights the glow only while the query waits for its first rows', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('wx')

    await wait(CUE_DELAY_MS)
    expect(glowActive(coreBox)).toBe(true)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searching')

    snapshot(stream, 'wx', ['wechat'])
    await wait(MIN_SHOWN_MS)
    // The apps are up while the files keep the session open: no glow, and still busy.
    expect(glowActive(coreBox)).toBe(false)
    expect(coreBox.get('.CoreBoxRes').attributes('aria-busy')).toBe('true')
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searchingMore')

    emit(stream, { type: 'complete' })
    await wait(MIN_SHOWN_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('')
    expect(settlingStatus(coreBox).exists()).toBe(false)
    expect(progressStatus(coreBox).exists()).toBe(false)
  })

  it('never lights the glow when the first rows beat its delay, however long the files take', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('wx')

    await wait(CUE_DELAY_MS / 3)
    snapshot(stream, 'wx', ['wechat'])
    await flush()

    // Before this change the glow followed `loading`, which the file layer holds for seconds.
    for (let elapsed = 0; elapsed < 3_000; elapsed += 250) {
      await wait(250)
      expect(glowActive(coreBox), `${elapsed}ms after the apps landed`).toBe(false)
    }
    expect(coreBox.find('.CoreBox-SearchStatus--progress').exists()).toBe(false)
  })

  it('holds a glow that did light for its minimum, so rows landing right after it never blink it', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('wx')
    await wait(CUE_DELAY_MS)
    expect(glowActive(coreBox)).toBe(true)

    await wait(50)
    snapshot(stream, 'wx', ['wechat'])
    await flush()
    expect(glowActive(coreBox)).toBe(true)

    await wait(MIN_SHOWN_MS - 50 - 10)
    expect(glowActive(coreBox)).toBe(true)
    await wait(20)
    expect(glowActive(coreBox)).toBe(false)
  })

  it('only announces the settling status while the glow animates, drawing no text', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('wx')
    snapshot(stream, 'wx', ['wechat'])
    await wait(SETTLING_DELAY_MS)

    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searchingMore')
    expect(settlingStatus(coreBox).exists()).toBe(false)
  })

  it('shows the settling status on screen in low-battery mode, as a visual copy', async () => {
    state.lowBatteryMode.value = true
    const coreBox = await openCoreBox()
    const stream = await search('wx')
    snapshot(stream, 'wx', ['wechat'])
    await wait(SETTLING_DELAY_MS)

    expect(settlingStatus(coreBox).text()).toBe('corebox.searchingMore')
    expect(settlingStatus(coreBox).classes()).not.toContain('sr-only')
    expect(settlingStatus(coreBox).attributes('role')).toBeUndefined()
    expect(settlingStatus(coreBox).attributes('aria-hidden')).toBe('true')
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searchingMore')
  })

  it('shows both statuses on screen when the system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }))
    const coreBox = await openCoreBox()
    const stream = await search('wx')

    await wait(CUE_DELAY_MS)
    // No glow without motion: the searching text stands in for it.
    expect(glowActive(coreBox)).toBe(false)
    expect(progressStatus(coreBox).text()).toBe('corebox.searching')
    expect(progressStatus(coreBox).classes()).not.toContain('sr-only')
    expect(progressStatus(coreBox).attributes('aria-hidden')).toBe('true')

    snapshot(stream, 'wx', ['wechat'])
    await wait(MIN_SHOWN_MS)
    expect(settlingStatus(coreBox).text()).toBe('corebox.searchingMore')
    expect(settlingStatus(coreBox).classes()).not.toContain('sr-only')
  })
})

/**
 * The search status is announced from one live region, mounted with CoreBox and never replaced:
 * several screen readers (VoiceOver with Chromium in particular) do not announce a live region
 * that is inserted already filled, which is how the status texts used to arrive. The texts in the
 * header's status slot are a visual copy, drawn only when motion is degraded.
 */
describe('CoreBox search status announcer', () => {
  it('is mounted before any search, then says searching, still searching and nothing, in place', async () => {
    wrapper = mount(CoreBox, { global: { plugins: [router], stubs } })
    await flush()
    const coreBox = wrapper
    const region = searchAnnouncer(coreBox)
    expect(region.attributes('role')).toBe('status')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.classes()).toContain('sr-only')
    expect(region.text()).toBe('')

    const opening = state.searchStreams.at(-1)!
    snapshot(opening, '', ['recommended'])
    emit(opening, { type: 'complete' })
    const stream = await search('wx')
    await wait(CUE_DELAY_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searching')

    snapshot(stream, 'wx', ['wechat'])
    await wait(MIN_SHOWN_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searchingMore')

    emit(stream, { type: 'complete' })
    await wait(MIN_SHOWN_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('')
    // One node the whole time: only its text changed.
    expect(searchAnnouncer(coreBox).element).toBe(region.element)
  })

  it.each([
    { motion: 'animating', lowBattery: false },
    { motion: 'degraded', lowBattery: true }
  ])(
    'carries each status in exactly one live region with motion $motion',
    async ({ lowBattery }) => {
      state.lowBatteryMode.value = lowBattery
      const coreBox = await openCoreBox()
      const stream = await search('wx')

      const soleRegionSaying = (message: string): void => {
        const regions = announcing(coreBox, message)
        expect(regions, message).toHaveLength(1)
        expect(regions[0].element).toBe(searchAnnouncer(coreBox).element)
      }

      await wait(CUE_DELAY_MS)
      soleRegionSaying('corebox.searching')
      expect(progressStatus(coreBox).exists()).toBe(lowBattery)

      snapshot(stream, 'wx', ['wechat'])
      await wait(MIN_SHOWN_MS)
      soleRegionSaying('corebox.searchingMore')
      expect(settlingStatus(coreBox).exists()).toBe(lowBattery)
    }
  )

  it('does not announce a status again when motion degrades while it is up', async () => {
    const coreBox = await openCoreBox()
    await search('wx')
    await wait(CUE_DELAY_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searching')
    expect(progressStatus(coreBox).exists()).toBe(false)

    const changes: MutationRecord[] = []
    const observer = new MutationObserver((records) => changes.push(...records))
    observer.observe(searchAnnouncer(coreBox).element, {
      childList: true,
      characterData: true,
      subtree: true
    })

    // The battery runs low mid-search: the glow goes out and the visual copy takes its place.
    state.lowBatteryMode.value = true
    await flush()
    expect(glowActive(coreBox)).toBe(false)
    expect(progressStatus(coreBox).text()).toBe('corebox.searching')
    expect(progressStatus(coreBox).attributes('role')).toBeUndefined()
    expect(progressStatus(coreBox).attributes('aria-hidden')).toBe('true')

    changes.push(...observer.takeRecords())
    observer.disconnect()
    expect(changes).toEqual([])
    expect(announcing(coreBox, 'corebox.searching')).toHaveLength(1)
  })

  it('falls silent the moment a search fails, leaving the failure to its alert', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('wx')
    await wait(CUE_DELAY_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searching')

    stream.options.onError?.(new Error('search failed'))
    await flush()

    // The cue is held for its 400ms minimum; the status is not said over the failure meanwhile.
    expect(searchAnnouncer(coreBox).text()).toBe('')
    expect(announcing(coreBox, 'corebox.searchFailed')).toHaveLength(1)
    expect(coreBox.get('[role="alert"]').text()).toBe('corebox.searchFailed')
  })

  it('stays silent while a plugin view hides the input', async () => {
    const coreBox = await openCoreBox()
    const opening = await search('translate')
    const activate = [{ id: 'plugin-features', hideResults: true }]
    snapshot(opening, 'translate', ['translate-feature'], { activate })
    emit(opening, { type: 'complete', activate })
    await flush()
    expect(coreBox.find('.box-input-stub').exists()).toBe(false)

    // A query still runs under the plugin view, and waits past the cue's delay for its rows.
    await search('translate this')
    await wait(CUE_DELAY_MS)

    expect(coreBox.get('.CoreBoxRes').attributes('aria-busy')).toBe('true')
    expect(searchAnnouncer(coreBox).text()).toBe('')
  })

  it('stays silent in a detached DivisionBox, whose header is its own', async () => {
    // A detached DivisionBox runs its searches here, under the DivisionBox header.
    state.windowState.type = 'division-box'
    state.windowState.divisionBox = { config: { url: 'tuff://detached' } }
    const coreBox = await openCoreBox()

    await search('wx')
    await wait(CUE_DELAY_MS)

    expect(coreBox.get('.CoreBoxRes').attributes('aria-busy')).toBe('true')
    expect(coreBox.find('.CoreBox-SearchGlow').exists()).toBe(false)
    expect(searchAnnouncer(coreBox).text()).toBe('')
  })

  it('keeps the status and an action’s outcome apart when both change within a second', async () => {
    /** Whether `region`'s content changed since the last ask: a change is an announcement. */
    function watchRegion(region: Element) {
      const records: MutationRecord[] = []
      const observer = new MutationObserver((batch) => records.push(...batch))
      observer.observe(region, { childList: true, characterData: true, subtree: true })
      return {
        changed(): boolean {
          records.push(...observer.takeRecords())
          return records.splice(0).length > 0
        },
        stop: () => observer.disconnect()
      }
    }

    const coreBox = await openCoreBox()
    const stream = await search('wx')
    await wait(CUE_DELAY_MS)
    const status = watchRegion(searchAnnouncer(coreBox).element)
    const outcome = watchRegion(announcer(coreBox).element)

    // 600ms: an action's outcome lands while "searching" is up.
    showCoreBoxFooterFeedback('已复制')
    await flush()
    expect(outcome.changed()).toBe(true)
    expect(status.changed()).toBe(false)

    // 650ms the rows land, and at 1000ms the status moves on under the outcome.
    await wait(50)
    snapshot(stream, 'wx', ['wechat'])
    await wait(MIN_SHOWN_MS - 50)
    expect(searchAnnouncer(coreBox).text()).toBe('corebox.searchingMore')
    expect(status.changed()).toBe(true)
    expect(outcome.changed()).toBe(false)
    expect(announcer(coreBox).text()).toBe('已复制')

    // 1800ms: the outcome clears, and the status is not said again.
    await wait(COREBOX_FOOTER_FEEDBACK_MS - MIN_SHOWN_MS)
    expect(announcer(coreBox).text()).toBe('')
    expect(outcome.changed()).toBe(true)
    expect(status.changed()).toBe(false)

    // The session completes: the status clears, and the outcome's region is left alone.
    emit(stream, { type: 'complete' })
    await wait(MIN_SHOWN_MS)
    expect(searchAnnouncer(coreBox).text()).toBe('')
    expect(status.changed()).toBe(true)
    expect(outcome.changed()).toBe(false)
    status.stop()
    outcome.stop()
  })
})

describe('CoreBox searching glow mount', () => {
  it('mounts the glow first in the MainBox header, watching the wrapper grow', async () => {
    const coreBox = await openCoreBox()
    const glow = coreBox.getComponent(TxPrismGlow)

    // Under the header content: first in div.CoreBox, which is its own stacking context.
    expect(coreBox.get('div.CoreBox').element.firstElementChild).toBe(glow.element)
    expect(glow.classes()).toContain('CoreBox-SearchGlow')
    // The header never grows; the wrapper does when results land. Without this binding the glow
    // fades out instead of retracting the moment the box expands.
    expect(glow.props('growTarget')).toBe(coreBox.get('.CoreBox-Wrapper').element)
  })
})

function headerFeedback(coreBox: VueWrapper) {
  return coreBox.find('.CoreBox .CoreBox-ActionFeedback')
}

/** The one live region an action's outcome is announced from. */
function announcer(coreBox: VueWrapper) {
  return coreBox.get('.CoreBox-Wrapper > .CoreBox-ActionFeedback-Live')
}

/** Every live region saying `message`: an outcome is announced by exactly one. */
function announcing(coreBox: VueWrapper, message: string) {
  return coreBox
    .findAll('[aria-live], [role="status"], [role="alert"]')
    .filter((region) => region.text() === message)
}

/**
 * An action's outcome shows in the footer while the footer is on screen, and in the header's status
 * slot while it is not: not rendered (a plugin view over the results, no rows), or rendered but
 * parked below the results for an item that hides its hints. One live region announces it either way.
 */
describe('CoreBox action feedback', () => {
  /** A plugin view attached over the results: no result area, so no footer. */
  async function openPluginView(): Promise<VueWrapper> {
    const coreBox = await openCoreBox()
    const stream = await search('translate')
    // The session's end carries the activation state too, as main sends it.
    const activate = [{ id: 'plugin-features', hideResults: true }]
    snapshot(stream, 'translate', ['translate-feature'], { activate })
    emit(stream, { type: 'complete', activate })
    await flush()
    expect(coreBox.find('.footer-stub').exists()).toBe(false)
    return coreBox
  }

  /** A result list, whose footer is on screen or parked as `footerOnScreen` says. */
  async function openList(): Promise<VueWrapper> {
    const coreBox = await openCoreBox()
    const stream = await search('wx')
    snapshot(stream, 'wx', ['wechat'])
    emit(stream, { type: 'complete' })
    await flush()
    expect(coreBox.find('.footer-stub').exists()).toBe(true)
    return coreBox
  }

  it('shows and announces an action’s outcome in the header in plugin UI mode', async () => {
    const coreBox = await openPluginView()
    expect(announcer(coreBox).attributes('role')).toBe('status')
    expect(announcer(coreBox).text()).toBe('')

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(headerFeedback(coreBox).text()).toBe('已复制')
    expect(headerFeedback(coreBox).classes()).toContain('is-success')
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
    expect(announcer(coreBox).text()).toBe('已复制')

    await wait(COREBOX_FOOTER_FEEDBACK_MS)
    expect(headerFeedback(coreBox).exists()).toBe(false)
    // Still mounted, so the next outcome is announced too.
    expect(announcer(coreBox).text()).toBe('')
  })

  it('shows a failure the same way, marked as one', async () => {
    const coreBox = await openPluginView()

    showCoreBoxFooterFeedback('操作失败', 'error')
    await flush()

    expect(headerFeedback(coreBox).classes()).toContain('is-error')
    expect(headerFeedback(coreBox).get('.CoreBox-ActionFeedback-Icon').classes()).toContain(
      'i-ri-error-warning-line'
    )
    expect(announcer(coreBox).text()).toBe('操作失败')
  })

  it('leaves the outcome to the footer while the footer is on screen, announced once', async () => {
    const coreBox = await openList()

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(headerFeedback(coreBox).exists()).toBe(false)
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
    expect(announcer(coreBox).text()).toBe('已复制')
  })

  it('shows it in the header while the footer is rendered but parked out of view', async () => {
    footerOnScreen.value = false
    const coreBox = await openList()

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(headerFeedback(coreBox).text()).toBe('已复制')
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
  })

  it('shows it in the header when there are no rows, which also leaves no footer', async () => {
    const coreBox = await openCoreBox()
    const stream = await search('nothing-matches')
    snapshot(stream, 'nothing-matches', [])
    emit(stream, { type: 'complete' })
    await flush()
    expect(coreBox.find('.footer-stub').exists()).toBe(false)

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(headerFeedback(coreBox).text()).toBe('已复制')
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
  })

  it('moves it between the footer and the header without announcing it again', async () => {
    footerOnScreen.value = false
    const coreBox = await openList()
    showCoreBoxFooterFeedback('已复制')
    await flush()
    expect(headerFeedback(coreBox).text()).toBe('已复制')

    const changes: MutationRecord[] = []
    const observer = new MutationObserver((records) => changes.push(...records))
    observer.observe(announcer(coreBox).element, {
      childList: true,
      characterData: true,
      subtree: true
    })

    // The footer slides in and out again while the outcome is up.
    footerOnScreen.value = true
    await flush()
    expect(headerFeedback(coreBox).exists()).toBe(false)
    footerOnScreen.value = false
    await flush()
    expect(headerFeedback(coreBox).text()).toBe('已复制')

    changes.push(...observer.takeRecords())
    observer.disconnect()
    expect(changes).toEqual([])
  })

  it('announces from outside the header, which a DivisionBox can hide', async () => {
    const coreBox = await openList()

    expect(coreBox.findAll('.CoreBox-ActionFeedback-Live')).toHaveLength(1)
    expect(announcer(coreBox).element.closest('.CoreBox')).toBeNull()
  })
})

describe('CoreBox action feedback with the real footer', () => {
  /** A plugin result hiding every hint: the footer parks below the results for it. */
  const hintless = {
    id: 'translate-feature',
    kind: 'feature',
    source: { id: 'plugin-features', type: 'plugin' },
    render: { mode: 'default', basic: { title: 'Translate' } },
    meta: {
      pluginName: 'touch-translation',
      footerHints: {
        primary: { visible: false },
        secondary: { visible: false },
        quickSelect: { visible: false }
      }
    }
  } as unknown as TuffItem

  async function openListWith(items: TuffItem[]): Promise<VueWrapper> {
    const coreBox = await openCoreBox({ realFooter: true })
    const stream = await search('wx')
    snapshot(stream, 'wx', [], { items })
    emit(stream, { type: 'complete' })
    // The footer came up with the recommendation grid; it follows the new item after its
    // 100ms debounce.
    await wait(100)
    expect(coreBox.find('.CoreBoxFooter').exists()).toBe(true)
    return coreBox
  }

  it('leaves an outcome to a footer showing its item, and announces it once', async () => {
    const coreBox = await openListWith([row('wechat')])
    expect(coreBox.get('.CoreBoxFooter').classes()).toContain('display')

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(coreBox.get('.CoreBoxFooter .FooterFeedback').text()).toBe('已复制')
    expect(headerFeedback(coreBox).exists()).toBe(false)
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
  })

  it('takes an outcome over from a footer parked for an item hiding every hint', async () => {
    const coreBox = await openListWith([hintless])
    expect(coreBox.get('.CoreBoxFooter').classes()).not.toContain('display')

    showCoreBoxFooterFeedback('已复制')
    await flush()

    expect(headerFeedback(coreBox).text()).toBe('已复制')
    expect(coreBox.find('.CoreBoxFooter .FooterFeedback').exists()).toBe(false)
    expect(announcing(coreBox, '已复制')).toHaveLength(1)
  })
})
