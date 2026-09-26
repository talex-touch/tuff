import {
  CONTEXT_ACTIONS_PROVIDER_ID,
  TuffInputType,
  normalizeCoreBoxContextActionsOpenRequest,
  toContextActionQuery,
  type CoreBoxContextActionsOpenRequest,
  type IProviderActivate,
  type TuffContext,
  type TuffItem,
  type TuffQuery,
  type TuffQueryInput,
  type TuffSearchResult
} from '@talex-touch/utils'
import type {
  ActivationState,
  CoreBoxSearchSessionChunk
} from '@talex-touch/utils/transport/events/types'
import type { IBoxOptions } from '..'
import type { IUseSearch } from '../types'
import type { DetachedDivisionConfig } from './detached-division'
import type { IClipboardOptions } from './types'
import { useTuffTransport, type StreamController } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  CoreBoxEvents,
  ClipboardEvents,
  DivisionBoxEvents
} from '@talex-touch/utils/transport/events'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { provideDuplicateFileFolderLabels } from '~/components/render/duplicate-file-names'
import { useBoxItems } from '~/modules/box/item-sdk'
import { appSetting } from '~/modules/storage/app-storage'
import { subscribeRendererActivity } from '~/modules/telemetry/renderer-activity'
import { devLog } from '~/utils/dev-log'
import { isDivisionBoxMode, windowState } from '~/modules/hooks/core-box'
import { BoxMode } from '..'
import { isDetachedDivisionItemMatch, parseDetachedDivisionConfig } from './detached-division'
import { createCoreBoxInputTransport } from '../transport/input-transport'
import {
  CLIPBOARD_HISTORY_SOURCE_ID,
  resolveClipboardHistoryRecordId
} from './clipboard-history-item'
import { isBackgroundAppLaunchItem } from './app-launch-item'
import { buildClipboardQueryInputs } from './clipboard-query-inputs'
import {
  clearImplicitClipboardState,
  isClipboardFreshForAutoPaste,
  normalizeClipboardTimestamp
} from './clipboard-autopaste'
import { alignItemsToSections } from './section-order'
import { getLatestClipboard } from './useClipboardChannel'
import { useResize } from './useResize'

interface SearchEndData {
  searchId: string
  cancelled?: boolean
  activate?: TuffSearchResult['activate']
  sources?: TuffSearchResult['sources']
}

interface ExecuteSearchOptions {
  force?: boolean
  preserveSelection?: boolean
  refreshClipboard?: boolean
}

/** A same-query refresh waiting for its search to complete; see `applySearchSnapshot`. */
interface RefreshReconcile {
  /** What the run delivered, merged the way a plain run would have shown it. */
  items: TuffItem[]
  /**
   * Every id the run delivered, before the render cap: the rows on screen that stay. `items` went
   * through the cap in delivery order, and the deferred providers answer in either order, so past
   * the cap it can lack a row the run did send again.
   */
  deliveredIds: Set<string>
  timer: ReturnType<typeof setTimeout>
}

type BoxData = {
  feature?: TuffItem
  pushedItemIds?: Set<string>
  plugin?: string
}

function ensureBoxData(boxOptions: IBoxOptions): BoxData {
  if (!boxOptions.data || typeof boxOptions.data !== 'object') {
    boxOptions.data = {}
  }
  return boxOptions.data as BoxData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function createTuffQuery(text: string, inputs: TuffQueryInput[], context?: TuffContext): TuffQuery {
  return context ? { text, inputs, context } : { text, inputs }
}

interface DetachedDivisionPayload {
  item: TuffItem
  query?: string
}

type PluginFeatureItem = TuffItem & {
  interaction?: { type?: string; sendMode?: boolean }
  meta?: TuffItem['meta'] & {
    featureId?: string
    interaction?: { type?: string; sendMode?: boolean }
    pluginName?: string
  }
}

function getPluginFeatureInteraction(feature: PluginFeatureItem | null | undefined) {
  return feature?.meta?.interaction || feature?.interaction
}

function isWidgetFeatureItem(feature: PluginFeatureItem | null | undefined): boolean {
  return getPluginFeatureInteraction(feature)?.type === 'widget'
}

function getActivationFeature(
  activation: IProviderActivate | null | undefined
): PluginFeatureItem | null {
  const meta = isRecord(activation?.meta) ? activation?.meta : null
  const feature = meta?.feature
  return isRecord(feature) ? (feature as unknown as PluginFeatureItem) : null
}

function getActivationSubmitFeature(
  activation: IProviderActivate | null | undefined
): PluginFeatureItem | null {
  const meta = isRecord(activation?.meta) ? activation.meta : null
  const activationFeature = meta?.activationFeature
  if (isRecord(activationFeature)) {
    return activationFeature as unknown as PluginFeatureItem
  }
  return getActivationFeature(activation)
}

function findWidgetActivationFeature(
  activations: IProviderActivate[] | null
): PluginFeatureItem | null {
  if (!activations?.length) return null
  for (const activation of activations) {
    if (activation.id !== 'plugin-features') continue
    const feature = getActivationFeature(activation)
    if (isWidgetFeatureItem(feature)) return feature
  }
  return null
}

function getPluginFeatureMeta(
  feature: PluginFeatureItem
): { pluginName: string; featureId: string } | null {
  const pluginName = typeof feature.meta?.pluginName === 'string' ? feature.meta.pluginName : ''
  const featureId = typeof feature.meta?.featureId === 'string' ? feature.meta.featureId : ''
  if (!pluginName || !featureId) return null
  return { pluginName, featureId }
}

function createWidgetFallbackItem(feature: PluginFeatureItem, queryText: string): TuffItem | null {
  const meta = getPluginFeatureMeta(feature)
  if (!meta) return null

  const prompt = queryText.trim()
  const rendererId = `${meta.pluginName}::${meta.featureId}`
  const messages = prompt
    ? [
        {
          id: `${meta.featureId}-fallback-user`,
          role: 'user',
          content: prompt,
          status: 'complete'
        },
        {
          id: `${meta.featureId}-fallback-assistant-pending`,
          role: 'assistant',
          content: '',
          status: 'streaming'
        }
      ]
    : []

  return {
    ...feature,
    id: `${meta.pluginName}/${meta.featureId}/widget-fallback`,
    kind: feature.kind || 'feature',
    render: {
      mode: 'custom',
      custom: {
        type: 'vue',
        content: rendererId,
        data: {
          prompt,
          status: prompt ? 'chat-pending' : 'idle',
          stage: 'chat',
          capabilityId: 'text.chat',
          inputKinds: prompt ? ['text'] : [],
          messages
        }
      },
      basic: feature.render?.basic
    },
    meta: {
      ...feature.meta,
      status: prompt ? 'chat-pending' : 'idle',
      keepCoreBoxOpen: true,
      widgetFallback: true,
      ...(prompt
        ? {
            defaultAction: 'intelligence-action',
            actionId: 'send',
            payload: {
              prompt,
              inputKinds: ['text']
            }
          }
        : {})
    }
  } as TuffItem
}

function hasPluginWidgetRenderItem(items: TuffItem[]): boolean {
  return items.some((item) => {
    const custom = item.render?.mode === 'custom' ? item.render.custom : null
    return Boolean(
      custom &&
      ['vue', 'webcomponent', 'arrow'].includes(custom.type) &&
      custom.content &&
      !String(custom.content).startsWith('core-')
    )
  })
}

function getPluginFeatureIdentity(
  item: TuffItem
): { pluginName: string; featureId: string } | null {
  const meta = isRecord(item.meta) ? item.meta : null
  const pluginName = typeof meta?.pluginName === 'string' ? meta.pluginName : ''
  const featureId = typeof meta?.featureId === 'string' ? meta.featureId : ''
  if (!pluginName || !featureId) return null
  return { pluginName, featureId }
}

function refreshActiveWidgetFeature(
  activations: IProviderActivate[] | null,
  items: TuffItem[]
): IProviderActivate[] | null {
  if (!activations?.length || !items.length) return activations

  const widgetItemsByKey = new Map<string, PluginFeatureItem>()
  for (const item of items) {
    const custom = item.render?.mode === 'custom' ? item.render.custom : null
    if (!custom || !['vue', 'webcomponent', 'arrow'].includes(custom.type)) continue
    const identity = getPluginFeatureIdentity(item)
    if (!identity) continue
    widgetItemsByKey.set(`${identity.pluginName}:${identity.featureId}`, item as PluginFeatureItem)
  }
  if (!widgetItemsByKey.size) return activations

  let changed = false
  const nextActivations = activations.map((activation) => {
    if (activation.id !== 'plugin-features') return activation
    const meta = isRecord(activation.meta) ? activation.meta : {}
    const pluginName = typeof meta.pluginName === 'string' ? meta.pluginName : ''
    const featureId = typeof meta.featureId === 'string' ? meta.featureId : ''
    const nextFeature = widgetItemsByKey.get(`${pluginName}:${featureId}`)
    if (!nextFeature || meta.feature === nextFeature) return activation
    const activationFeature = getActivationSubmitFeature(activation)
    changed = true
    return {
      ...activation,
      meta: {
        ...meta,
        ...(activationFeature ? { activationFeature } : {}),
        feature: nextFeature
      }
    }
  })

  return changed ? nextActivations : activations
}

function mergePluginFeatureActivationState(
  next: IProviderActivate[] | null,
  previous: IProviderActivate[] | null,
  feature?: TuffItem
): IProviderActivate[] | null {
  if (!next?.length) return next
  const fallbackFeature = isRecord(feature) ? (feature as unknown as PluginFeatureItem) : null

  return next.map((activation) => {
    if (activation.id !== 'plugin-features') return activation
    const nextMeta = isRecord(activation.meta) ? activation.meta : {}
    const pluginName = typeof nextMeta.pluginName === 'string' ? nextMeta.pluginName : undefined
    const previousActivation = previous?.find((item) => {
      if (item.id !== 'plugin-features') return false
      const previousMeta = isRecord(item.meta) ? item.meta : {}
      if (!pluginName) return true
      return previousMeta.pluginName === pluginName
    })
    const previousMeta = isRecord(previousActivation?.meta) ? previousActivation.meta : {}
    const preservedFeature = nextMeta.feature || previousMeta.feature || fallbackFeature

    return {
      ...previousActivation,
      ...activation,
      hideResults: activation.hideResults ?? previousActivation?.hideResults ?? false,
      showInput: activation.showInput ?? previousActivation?.showInput,
      forceMax: activation.forceMax ?? previousActivation?.forceMax,
      meta: {
        ...previousMeta,
        ...nextMeta,
        ...(preservedFeature ? { feature: preservedFeature } : {})
      }
    }
  })
}

export function useSearch(
  boxOptions: IBoxOptions,
  clipboardOptions?: IClipboardOptions
): IUseSearch {
  const shouldLog = () =>
    appSetting.searchEngine?.logsEnabled || appSetting.diagnostics?.verboseLogs
  const logDebug = (...args: unknown[]) => {
    if (!shouldLog()) return
    devLog(...args)
  }

  const getDetachedDivisionConfig = (): DetachedDivisionConfig | null =>
    parseDetachedDivisionConfig(windowState.divisionBox?.config?.url)

  const isDetachedDivisionMode = (): boolean => isDivisionBoxMode() && !!getDetachedDivisionConfig()

  const isDetachedItemMatch = (item: TuffItem): boolean => {
    return isDetachedDivisionItemMatch(item, getDetachedDivisionConfig())
  }

  const filterDetachedItems = (items: TuffItem[]): TuffItem[] => {
    if (!isDetachedDivisionMode()) return items
    return items.filter(isDetachedItemMatch)
  }

  const applyDetachedPayload = (payload: DetachedDivisionPayload): void => {
    searchResults.value = [payload.item]
    searchResult.value = {
      items: [payload.item],
      query: { text: payload.query ?? '', inputs: [] },
      duration: 0,
      sources: []
    }
    currentSearchId.value = null
    activeActivations.value = null
    loading.value = false
    recommendationPending.value = false
    boxOptions.layout = undefined
    boxOptions.focus = 0
    window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
  }

  const tryLoadDetachedPayload = async (sessionId: string): Promise<boolean> => {
    const response = await transport.send(DivisionBoxEvents.getState, {
      sessionId,
      key: 'detachedPayload'
    })

    if (!response?.success || !response.data || typeof response.data !== 'object') {
      return false
    }

    const payload = response.data as Partial<DetachedDivisionPayload>
    if (!payload.item || typeof payload.item !== 'object') {
      return false
    }

    applyDetachedPayload({
      item: payload.item as TuffItem,
      query: typeof payload.query === 'string' ? payload.query : undefined
    })
    return true
  }

  const hydrateDetachedPayload = async (sessionId: string): Promise<boolean> => {
    const maxAttempts = 6
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const loaded = await tryLoadDetachedPayload(sessionId)
        if (loaded) {
          return true
        }
      } catch {
        // ignore and retry
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 80)
      })
    }
    return false
  }

  const searchVal = ref('')
  const select = ref(-1)

  const { items: boxItems } = useBoxItems()

  const searchResults = shallowRef<Array<TuffItem>>([])

  // Hard cap on items handed to the UI. CoreBox renders every result as a
  // component without windowing, and the backend already returns them in
  // relevance order, so anything past this only adds render/patch cost for
  // items a launcher user never scrolls to. Tune here if more are needed.
  const MAX_RENDERED_RESULTS = 80

  const res = computed<Array<TuffItem>>(() => {
    const itemsMap = new Map<string, TuffItem>()

    boxItems.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    searchResults.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    const result = Array.from(itemsMap.values())
    const widgetFeature = findWidgetActivationFeature(activeActivations.value)
    if (widgetFeature && !hasPluginWidgetRenderItem(result)) {
      const fallback = createWidgetFallbackItem(widgetFeature, searchVal.value)
      if (fallback) {
        result.unshift(fallback)
      }
    }

    return filterDetachedItems(result).slice(0, MAX_RENDERED_RESULTS)
  })

  // Rows that share a file name show enough of their folder to tell them apart (ItemSubtitle).
  provideDuplicateFileFolderLabels(res)

  watch(boxItems, (items) => {
    activeActivations.value = refreshActiveWidgetFeature(activeActivations.value, [...items])
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const contextActionRequest = shallowRef<CoreBoxContextActionsOpenRequest | null>(null)
  const loading = ref(false)
  /**
   * The current query has at least one row of its own on screen. `loading` alone cannot tell a
   * query still waiting for its first rows from one whose rows are up while the deferred layer
   * (the files) keeps gathering: the session completes only after that layer, up to a few seconds
   * after the apps landed, and a searching cue held that long read as a slow search.
   */
  const hasFreshResults = ref(false)
  /** Loading with nothing of the current query on screen yet: the searching cue belongs here. */
  const awaitingFirstResults = computed(() => loading.value && !hasFreshResults.value)
  /** Loading with the current query's rows on screen: the session is still gathering. */
  const searchSettling = computed(() => loading.value && hasFreshResults.value)
  const searchError = ref(false)
  const recommendationPending = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)
  const transport = useTuffTransport()
  const triggerFeatureExitEvent = defineRawEvent<{ plugin: string }, void>(
    'trigger-plugin-feature-exit'
  )

  // Search-trigger debounce. Each "major" result change re-mounts the entire
  // result list through <Transition mode="out-in"> in CoreBox.vue, so a higher
  // value directly cuts the number of full list re-renders while typing. 80ms
  // stays under the ~100ms perception threshold (still feels instant) while
  // reducing worst-case search/render churn ~2.6x versus the previous 30ms.
  // Tune here if it feels sluggish; backend search time is tracked separately
  // via firstResultMs in the search-trace metrics.
  const SEARCH_DEBOUNCE_MS = 80
  const INPUT_CHANGE_DEBOUNCE_MS = 25
  const inputTransport = createCoreBoxInputTransport(transport, INPUT_CHANGE_DEBOUNCE_MS)

  // Deferred providers (the file index) answer after the fast layer, so a plain
  // top-N cut structurally starves them on short queries no matter how well they
  // score. Every source present in the merged set keeps this many slots.
  const MIN_SLOTS_PER_SOURCE = 6

  // Mirrors the backend's per-update safety cap. An arriving batch is appended to
  // and quota'd together with what is already on screen, so cutting it to the
  // render cap here would drop a batch's low-ranked source before it can claim
  // its floor — exactly the starvation the backend stopped doing.
  const MAX_INCOMING_BATCH_ITEMS = 200

  function limitRenderedItems(items: TuffItem[]): TuffItem[] {
    return items.length > MAX_RENDERED_RESULTS ? items.slice(0, MAX_RENDERED_RESULTS) : items
  }

  function limitIncomingBatchItems(items: TuffItem[]): TuffItem[] {
    return items.length > MAX_INCOMING_BATCH_ITEMS
      ? items.slice(0, MAX_INCOMING_BATCH_ITEMS)
      : items
  }

  function getSourceId(item: TuffItem): string {
    return item.source?.id ?? ''
  }

  /**
   * Cut a ranked list down to the render cap while guaranteeing each source a
   * floor of slots. The overflow is taken from the tail of the cut, and only
   * from sources that are still above their own floor, so the result stays a
   * deterministic function of the ranked input. `keepItemId` (the selected row)
   * is never evicted: a batch claiming its floor must not pull the highlight
   * out from under the user.
   */
  function applyRenderedItemQuota(
    rankedItems: TuffItem[],
    keepItemId: string | null = null
  ): TuffItem[] {
    if (rankedItems.length <= MAX_RENDERED_RESULTS) return rankedItems

    const selectedIds = new Set<string>()
    for (let index = 0; index < MAX_RENDERED_RESULTS; index++) {
      selectedIds.add(rankedItems[index].id)
    }

    const sourceTotals = new Map<string, number>()
    const sourceSelected = new Map<string, number>()
    for (const item of rankedItems) {
      const sourceId = getSourceId(item)
      sourceTotals.set(sourceId, (sourceTotals.get(sourceId) ?? 0) + 1)
      if (selectedIds.has(item.id)) {
        sourceSelected.set(sourceId, (sourceSelected.get(sourceId) ?? 0) + 1)
      }
    }

    let evictCursor = MAX_RENDERED_RESULTS - 1
    const evictLowestSpareSlot = (): boolean => {
      while (evictCursor >= 0) {
        const candidate = rankedItems[evictCursor]
        evictCursor -= 1
        if (!candidate || !selectedIds.has(candidate.id)) continue
        if (candidate.scoring?.pinned === true || candidate.id === keepItemId) continue
        const sourceId = getSourceId(candidate)
        const selected = sourceSelected.get(sourceId) ?? 0
        if (selected <= Math.min(MIN_SLOTS_PER_SOURCE, sourceTotals.get(sourceId) ?? 0)) continue
        selectedIds.delete(candidate.id)
        sourceSelected.set(sourceId, selected - 1)
        return true
      }
      return false
    }

    for (const [sourceId, total] of sourceTotals) {
      let deficit = Math.min(MIN_SLOTS_PER_SOURCE, total) - (sourceSelected.get(sourceId) ?? 0)
      if (deficit <= 0) continue

      for (const item of rankedItems) {
        if (deficit <= 0) break
        if (getSourceId(item) !== sourceId || selectedIds.has(item.id)) continue
        if (!evictLowestSpareSlot()) break
        selectedIds.add(item.id)
        sourceSelected.set(sourceId, (sourceSelected.get(sourceId) ?? 0) + 1)
        deficit -= 1
      }
    }

    return rankedItems.filter((item) => selectedIds.has(item.id))
  }

  function replaceSearchResults(items: TuffItem[]): void {
    searchResults.value = applyRenderedItemQuota(filterDetachedItems(items))
  }

  /**
   * Order the rows of one batch that are new to the screen: pinned first, then
   * by the score the backend ranker wrote onto the item, then arrival order.
   */
  function rankArrivals(items: TuffItem[]): TuffItem[] {
    return items
      .map((item, index) => ({
        item,
        index,
        pinned: item.scoring?.pinned === true,
        score: typeof item.scoring?.final === 'number' ? item.scoring.final : 0
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (b.score !== a.score) return b.score - a.score
        return a.index - b.index
      })
      .map((entry) => entry.item)
  }

  /**
   * Merge a later batch into what is on screen without moving a row the user is
   * already looking at. A row that is on screen keeps its position and takes the
   * newer item data; rows new to the screen are ranked among themselves and
   * appended below everything, so the deferred layer (the files) never
   * reshuffles the fast results or the selection. Pinned arrivals are the one
   * exception: they join the pinned block at the top, after the pinned rows
   * already there.
   */
  function mergeRenderedItems(
    current: TuffItem[],
    incoming: TuffItem[],
    keepItemId: string | null = null
  ): TuffItem[] {
    const renderedIndexById = new Map<string, number>()
    current.forEach((item, index) => {
      renderedIndexById.set(item.id, index)
    })

    const merged = [...current]
    const arrivals: TuffItem[] = []
    const arrivalIndexById = new Map<string, number>()
    for (const item of incoming) {
      const renderedIndex = renderedIndexById.get(item.id)
      if (renderedIndex !== undefined) {
        merged[renderedIndex] = item
        continue
      }
      const arrivalIndex = arrivalIndexById.get(item.id)
      if (arrivalIndex !== undefined) {
        arrivals[arrivalIndex] = item
        continue
      }
      arrivalIndexById.set(item.id, arrivals.length)
      arrivals.push(item)
    }
    if (arrivals.length === 0) return applyRenderedItemQuota(merged, keepItemId)

    const ranked = rankArrivals(arrivals)
    const firstUnpinned = ranked.findIndex((item) => item.scoring?.pinned !== true)
    const pinnedArrivals = firstUnpinned === -1 ? ranked : ranked.slice(0, firstUnpinned)
    const unpinnedArrivals = firstUnpinned === -1 ? [] : ranked.slice(firstUnpinned)
    if (pinnedArrivals.length > 0) {
      let pinnedEnd = 0
      while (pinnedEnd < merged.length && merged[pinnedEnd].scoring?.pinned === true) {
        pinnedEnd += 1
      }
      merged.splice(pinnedEnd, 0, ...pinnedArrivals)
    }
    merged.push(...unpinnedArrivals)

    return applyRenderedItemQuota(merged, keepItemId)
  }

  /**
   * Selection follows the item, not the row: a pinned arrival above it or a
   * quota eviction can still move or drop it.
   */
  function restoreFocusedItem(itemId: string | null): void {
    if (boxOptions.focus < 0 || !itemId) return
    const nextIndex = res.value.findIndex((item) => item.id === itemId)
    if (nextIndex >= 0) {
      boxOptions.focus = nextIndex
      return
    }
    boxOptions.focus = res.value.length > 0 ? 0 : -1
  }

  let searchSequence = 0
  let searchDisposed = false
  let activeSearchStreamController: StreamController | null = null
  let activeSearchAbortController: AbortController | null = null
  let cancelPendingSearchSnapshot: (() => void) | null = null
  const searchStreamSupersededError = new Error('Search stream superseded')
  let recommendationTimeoutId: ReturnType<typeof setTimeout> | null = null
  let recommendationTimeoutSequence: number | null = null
  let inFlightQuery: { key: string; sequence: number } | null = null
  let lastQueryKey = ''
  let lastQueryAt = 0
  let oneShotQueryContext: TuffContext | undefined
  let programmaticQueryValue: string | null = null
  let indexCommitRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let indexCommitRefreshPending = false
  /** Latched across the debounce window so a plain commit cannot cancel a grid-relevant one. */
  let indexCommitRefreshForRecommendations = false
  /** The INDEX_COMMIT_REFRESH_STEPS_MS entry the next refresh waits; see noteIndexCommit. */
  let indexCommitRefreshStep = 0
  let lastIndexCommitAt: number | null = null
  /**
   * Whether the CoreBox window is on screen. useVisibility publishes the native show/hide signal
   * (document visibility until the first one arrives) as renderer activity.
   */
  let coreBoxWindowVisible = true
  let indexCommitStreamDisposed = false
  let indexCommitStreamGeneration = 0
  let indexCommitStreamStartPending = false
  let indexCommitStreamController: { cancel: () => void } | null = null
  let indexCommitStreamRetryTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * The text query whose results are on screen, with the array it put there. A later run of that
   * query reconciles into those rows instead of replacing them. Anything else that replaces
   * `searchResults` (another query, the recommendation grid, a reset) assigns a different array,
   * which ends the match, so a run never merges into rows another query left behind.
   */
  let renderedTextQuery: { key: string; items: TuffItem[] } | null = null
  let pendingRefreshReconcile: RefreshReconcile | null = null

  const DUPLICATE_QUERY_WINDOW_MS = 200
  /**
   * How long an index-commit refresh waits, stepping up while commits keep arriving (D-a,
   * 2026-09-26). Every refresh is a whole new search, and while an index builds the commits do not
   * stop: with a flat 500ms CoreBox re-searched back to back for as long as the build ran. A lone
   * commit still shows within a second; a steady run settles at one refresh every 5s.
   */
  const INDEX_COMMIT_REFRESH_STEPS_MS = [500, 2_000, 5_000] as const
  /** A commit main marks `bulk` (a full scan, or a dense run it coalesced) starts at the 2s step. */
  const INDEX_COMMIT_BULK_STEP = 1
  /** A commit arriving this long after the previous one starts again from the first step. */
  const INDEX_COMMIT_QUIET_MS = 5_000
  /**
   * How long a same-query refresh waits for its search to complete before reconciling anyway,
   * counted from its snapshot. It covers the main process's search budget
   * (`defaultTuffGatherOptions` in search-gather.ts): the deferred layer starts
   * `deferredLayerDelayMs` (50ms) after the fast snapshot and gives each provider `taskTimeoutMs`
   * (3000ms), and the search completes once they have answered or timed out. The rest leaves room
   * for ranking and IPC. Reconciling before a late answer lands would remove its rows, then append
   * them again below everything.
   */
  const REFRESH_RECONCILE_TIMEOUT_MS = 3_500
  function toActivations(
    state: ActivationState | IProviderActivate[] | null | undefined
  ): IProviderActivate[] | null {
    if (!state) return null
    if (Array.isArray(state)) {
      return state.length > 0 ? state : null
    }
    const ids = state?.activeProviders
    if (!ids || ids.length === 0) {
      return null
    }
    const result: IProviderActivate[] = []
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) continue
      if (id.startsWith('plugin-features:')) {
        const pluginName = id.substring('plugin-features:'.length)
        result.push({
          id: 'plugin-features',
          meta: pluginName ? { pluginName } : undefined
        })
      } else {
        result.push({ id })
      }
    }
    return result.length > 0 ? result : null
  }

  function buildStringSignature(value?: string | null): string {
    if (!value) return '0'
    const length = value.length
    const head = value.charCodeAt(0)
    const tail = value.charCodeAt(length - 1)
    return `${length}:${head}:${tail}`
  }

  function getActivationKey(activation: IProviderActivate): string {
    if (activation.id === 'plugin-features' && activation.meta?.pluginName) {
      return `${activation.id}:${activation.meta.pluginName}`
    }
    return activation.id
  }

  function buildInputsKey(inputs: TuffQueryInput[]): string {
    if (inputs.length === 0) return ''
    return inputs
      .map((input) => {
        const contentSig = buildStringSignature(input.content)
        const rawSig = buildStringSignature(input.rawContent)
        const meta = input.metadata as { clipboardId?: unknown } | undefined
        const clipboardId = typeof meta?.clipboardId === 'number' ? meta.clipboardId : ''
        const metaSig = clipboardId ? `:cb:${clipboardId}` : ''
        return `${input.type}:${contentSig}:${rawSig}${metaSig}`
      })
      .join('|')
  }

  function buildQueryKey(
    text: string,
    inputs: TuffQueryInput[],
    activations: IProviderActivate[] | null
  ): string {
    const activationKey = activations?.length
      ? activations.map(getActivationKey).sort().join('|')
      : ''
    const inputsKey = buildInputsKey(inputs)
    const contextSessionId = contextActionRequest.value?.context.sessionId ?? ''
    return `${text}::${activationKey}::${inputsKey}::${contextSessionId}`
  }

  function hasPluginFeatureActivation(activations: IProviderActivate[] | null): boolean {
    return activations?.some((activation) => activation.id === 'plugin-features') ?? false
  }

  function hasSendModePluginFeatureActivation(activations: IProviderActivate[] | null): boolean {
    return (
      activations?.some((activation) => {
        if (activation.id !== 'plugin-features') return false
        const feature = getActivationSubmitFeature(activation)
        const interaction = getPluginFeatureInteraction(feature)
        if (!interaction) return false
        if (interaction.sendMode === false) return false
        return interaction.sendMode === true || interaction.type === 'widget'
      }) ?? false
    )
  }

  function buildCurrentQuery(
    text: string,
    inputs: TuffQueryInput[],
    context?: TuffContext
  ): TuffQuery {
    const request = contextActionRequest.value
    if (!request) return createTuffQuery(text, inputs, context)

    const contextQuery = toContextActionQuery(request)
    return {
      ...contextQuery,
      text,
      inputs: inputs.length === 1 ? [inputs[0]] : contextQuery.inputs,
      context: {
        ...(context ?? {}),
        ...contextQuery.context
      }
    }
  }

  function buildQueryInputs(options?: {
    queryText?: string
    allowPendingTextClipboard?: boolean
    includeClipboardImage?: boolean
  }): TuffQueryInput[] {
    const contextRequest = contextActionRequest.value
    if (contextRequest) {
      return [...toContextActionQuery(contextRequest).inputs]
    }

    const queryText = options?.queryText ?? searchVal.value
    const inputs = buildClipboardQueryInputs({
      clipboardItem: clipboardOptions?.last,
      pendingTextClipboardItem: clipboardOptions?.pendingAutoFillItem,
      queryText,
      allowPendingTextClipboard: options?.allowPendingTextClipboard ?? false,
      includeClipboardImage:
        options?.includeClipboardImage ??
        (!queryText.trim() || hasPluginFeatureActivation(activeActivations.value)),
      filePaths: boxOptions.file?.paths,
      useFileMode: boxOptions.mode === BoxMode.FILE
    })
    if (hasWindow()) {
      window.__coreboxQueryInputDebug = {
        builtAt: new Date().toISOString(),
        queryTextLength: queryText.length,
        clipboardLastType: clipboardOptions?.last?.type ?? null,
        pendingTextClipboardType: clipboardOptions?.pendingAutoFillItem?.type ?? null,
        filePathCount: boxOptions.file?.paths?.length ?? 0,
        useFileMode: boxOptions.mode === BoxMode.FILE,
        inputTypes: inputs.map((input) => input.type),
        inputCount: inputs.length,
        hasImageInput: inputs.some((input) => input.type === TuffInputType.Image),
        hasTextInput: inputs.some(
          (input) => input.type === TuffInputType.Text || input.type === TuffInputType.Html
        ),
        hasFileInput: inputs.some((input) => input.type === TuffInputType.Files)
      }
    }
    return inputs
  }

  async function refreshClipboardBeforeInputBuild(
    intent: 'implicit' | 'explicit' = 'implicit'
  ): Promise<void> {
    if (contextActionRequest.value || !clipboardOptions) return
    if (
      clipboardOptions.activeClipboardSource &&
      (clipboardOptions.last || clipboardOptions.pendingAutoFillItem)
    ) {
      return
    }
    try {
      const latest = await getLatestClipboard({ refresh: true })
      if (!latest) {
        clearImplicitClipboardState(clipboardOptions)
        return
      }

      const latestTimestamp = normalizeClipboardTimestamp(latest.timestamp)
      const dismissedTimestamp = normalizeClipboardTimestamp(clipboardOptions.lastClearedTimestamp)
      if (
        latestTimestamp !== null &&
        dismissedTimestamp !== null &&
        latestTimestamp === dismissedTimestamp
      ) {
        clearImplicitClipboardState(clipboardOptions)
        return
      }

      if (
        intent === 'implicit' &&
        !isClipboardFreshForAutoPaste(latest, appSetting.tools.autoPaste)
      ) {
        clearImplicitClipboardState(clipboardOptions)
        return
      }

      clipboardOptions.last = latest
      clipboardOptions.pendingAutoFillItem = null
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.activeClipboardSource = intent === 'explicit' ? 'manual' : 'auto'
    } catch {
      // Keep existing clipboard state when the typed transport is unavailable.
    }
  }

  function cancelActiveSearchStream(): void {
    activeSearchAbortController?.abort()
    activeSearchAbortController = null
    activeSearchStreamController?.cancel()
    activeSearchStreamController = null
    cancelPendingSearchSnapshot?.()
    cancelPendingSearchSnapshot = null
    // A superseded or reset run no longer speaks for what is on screen.
    discardRefreshReconcile()
  }

  function clearRecommendationTimeout(sequence?: number): void {
    if (sequence !== undefined && recommendationTimeoutSequence !== sequence) return
    clearTimeout(recommendationTimeoutId ?? undefined)
    recommendationTimeoutId = null
    recommendationTimeoutSequence = null
  }

  function beginSearchSequence(inputs: TuffQueryInput[], options: ExecuteSearchOptions): number {
    cancelActiveSearchStream()
    const currentSequence = ++searchSequence
    clearRecommendationTimeout()
    recommendationPending.value = false
    searchError.value = false

    logDebug('[useSearch] executeSearch start:', {
      sequence: currentSequence,
      text: searchVal.value,
      inputs: inputs.length,
      activations: activeActivations.value?.length || 0,
      force: options.force === true
    })

    return currentSequence
  }
  function markInFlightQuery(queryKey: string, sequence: number): void {
    inFlightQuery = { key: queryKey, sequence }
  }

  function clearInFlightQuery(queryKey: string, sequence: number): void {
    if (inFlightQuery?.key === queryKey && inFlightQuery.sequence === sequence) {
      inFlightQuery = null
    }
  }

  function shouldSkipDuplicateQuery(
    queryKey: string,
    inputs: TuffQueryInput[],
    force: boolean
  ): boolean {
    if (force) return false

    const now = Date.now()
    if (inFlightQuery?.key === queryKey) {
      logDebug('[useSearch] Skipping duplicate in-flight query:', {
        text: searchVal.value,
        inputs: inputs.length
      })
      return true
    }

    if (queryKey === lastQueryKey && now - lastQueryAt < DUPLICATE_QUERY_WINDOW_MS) {
      logDebug('[useSearch] Skipping duplicate query (window):', {
        text: searchVal.value,
        inputs: inputs.length
      })
      return true
    }

    lastQueryKey = queryKey
    lastQueryAt = now
    return false
  }

  const resetSearchState = (): void => {
    cancelActiveSearchStream()
    searchResults.value = []
    searchResult.value = null
    currentSearchId.value = null
    activeActivations.value = null
    boxOptions.layout = undefined
    loading.value = false
    searchError.value = false
    recommendationPending.value = false
    window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
  }

  const broadcastDivisionBoxInput = (query: TuffQuery): void => {
    inputTransport.broadcast({
      input: query.text,
      query,
      source: 'renderer'
    })

    if (windowState.divisionBox?.sessionId) {
      transport
        .send(DivisionBoxEvents.inputChange, {
          sessionId: windowState.divisionBox.sessionId,
          input: searchVal.value,
          query
        })
        .catch(() => {})
    }
  }

  /**
   * Reports the recommendation ids we just rendered so the main process can
   * join them against executes for local hit-rate@k. Ids and order only, never
   * content, and failures are ignored — this must never affect rendering.
   */
  const reportRecommendationExposure = (items: TuffItem[]): void => {
    const itemKeys = items
      .filter((item) => !item.meta?.pinned?.isPinned)
      .map((item) => {
        const meta = item.meta as Record<string, unknown> | undefined
        const sourceId =
          typeof meta?._originalSourceId === 'string' ? meta._originalSourceId : item.source.id
        const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : item.id
        return `${sourceId}:${itemId}`
      })
    if (itemKeys.length === 0) return

    transport
      .send(CoreBoxEvents.recommendation.reportExposure, {
        itemKeys,
        surface: isDetachedDivisionMode() ? 'division-box' : 'core-box'
      })
      .catch(() => {})
  }

  /**
   * Replaces what is rendered. While `renderedTextQuery` owns the rows on screen it follows them, so
   * a later run of that query can still tell they are its own.
   */
  function setSearchResults(items: TuffItem[]): void {
    if (renderedTextQuery?.items === searchResults.value) renderedTextQuery.items = items
    searchResults.value = items
  }

  function isRenderedTextQuery(queryKey: string): boolean {
    return renderedTextQuery?.key === queryKey && renderedTextQuery.items === searchResults.value
  }

  function discardRefreshReconcile(): void {
    if (!pendingRefreshReconcile) return
    clearTimeout(pendingRefreshReconcile.timer)
    pendingRefreshReconcile = null
  }

  /**
   * Ends a same-query refresh: the rows it did not deliver again go, and the rest keep their order
   * on screen. As with a streamed batch, a row the user moved to stays selected if it survives and
   * falls back to row 0 if it does not, and an untouched selection stays on row 0.
   */
  function settleRefreshReconcile(): void {
    const reconcile = pendingRefreshReconcile
    if (!reconcile) return
    discardRefreshReconcile()
    // Something else replaced the rows since (a widget activation, an execute): not this query's.
    if (renderedTextQuery?.items !== searchResults.value) return

    const focusedItemId = boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
    const current = searchResults.value
    const next = mergeRenderedItems(
      current.filter((item) => reconcile.deliveredIds.has(item.id)),
      reconcile.items,
      focusedItemId
    )
    // While an index builds, most refreshes change nothing; those should not re-render the list.
    if (next.length === current.length && next.every((item, index) => item === current[index])) {
      return
    }
    setSearchResults(next)
    restoreFocusedItem(focusedItemId)
  }

  function applySearchSnapshot(
    initialResult: TuffSearchResult,
    options: ExecuteSearchOptions,
    selectedItemId: string | null,
    queryKey: string
  ): void {
    const sameQuery = isRenderedTextQuery(queryKey)
    // Read before anything below changes `res`: only a row the user moved to follows its item.
    const focusedItemId = boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
    // Only when the snapshot actually carries an id. `sessionId` is optional on
    // TuffSearchResult, and the unconditional `|| null` threw away the identity the `session`
    // chunk had already established - after which every later update/no-results/complete chunk
    // failed its session guard, applySearchEnd never ran, and the spinner stayed up forever
    // (#830). The snapshot handler has already proven the ids match, so this is at most a
    // no-op reassignment and never a downgrade.
    if (initialResult.sessionId) currentSearchId.value = initialResult.sessionId
    // The snapshot arrives ranked, so the quota only decides which of the
    // overflow survives — a cache hit (which carries the whole accumulated
    // set) then shows what the live run ended with instead of a plain top cut.
    const snapshotItems = filterDetachedItems(initialResult.items)
    const filteredItems = applyRenderedItemQuota(snapshotItems)
    searchResult.value = isDetachedDivisionMode()
      ? { ...initialResult, items: filteredItems }
      : initialResult

    activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

    if (sameQuery) {
      // A run of the query already on screen: an index-commit refresh, or the re-run when CoreBox
      // is shown again. Its snapshot carries only the fast layer, so replacing the list with it
      // dropped every deferred row (the files) until the deferred layer sent them again, then
      // inserted and re-ranked them back, once per refresh while an index builds. Since D4
      // (2026-09-26) the snapshot and later updates merge into the rows on screen, which keeps
      // their DOM nodes, and the rows this run does not deliver again are removed when it
      // completes, or after REFRESH_RECONCILE_TIMEOUT_MS if it never does. A cancelled run still
      // resets, and a failed one leaves what is on screen.
      discardRefreshReconcile()
      setSearchResults(mergeRenderedItems(searchResults.value, filteredItems, focusedItemId))
      restoreFocusedItem(focusedItemId)
      pendingRefreshReconcile = {
        items: filteredItems,
        deliveredIds: new Set(snapshotItems.map((item) => item.id)),
        timer: setTimeout(settleRefreshReconcile, REFRESH_RECONCILE_TIMEOUT_MS)
      }
    } else {
      searchResults.value = filteredItems
      if (options.preserveSelection) {
        const preservedIndex = selectedItemId
          ? res.value.findIndex((item) => item.id === selectedItemId)
          : -1
        boxOptions.focus = preservedIndex >= 0 ? preservedIndex : res.value.length > 0 ? 0 : -1
      }
    }
    renderedTextQuery = { key: queryKey, items: searchResults.value }
    hasFreshResults.value = searchResults.value.length > 0
    logDebug('[useSearch] searchResults updated:', searchResults.value.length, 'items')

    boxOptions.layout = undefined
    nextTick(() => {
      window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
    })
  }

  const applyRecommendationResult = (initialResult: TuffSearchResult): void => {
    // A sectioned grid numbers focus by section order, so the list must follow the sections or
    // `res[focus]` (preview pane, footer, ⌘-digits) resolves to a different item than the
    // highlighted tile.
    const { items: filteredItems, layout } = alignItemsToSections(
      limitRenderedItems(filterDetachedItems(initialResult.items)),
      initialResult.containerLayout
    )
    if (initialResult.sessionId) currentSearchId.value = initialResult.sessionId
    searchResult.value = isDetachedDivisionMode()
      ? { ...initialResult, items: filteredItems }
      : initialResult
    searchResults.value = filteredItems
    hasFreshResults.value = searchResults.value.length > 0
    // Items and layout land in one update: executeSearch left the previous pair on screen, and
    // swapping only one of them renders a grid's items as a list for a frame.
    boxOptions.layout = layout

    activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

    reportRecommendationExposure(filteredItems)

    nextTick(() => {
      window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
    })
  }
  async function requestSearchSnapshot(
    query: TuffQuery,
    currentSequence: number,
    applySnapshot: (result: TuffSearchResult) => void,
    preferredItemId: string | null = null
  ): Promise<TuffSearchResult> {
    let snapshotSettled = false
    let streamEnded = false
    let pendingPreferredItemId = preferredItemId
    let preferredFallbackItemId: string | null = null
    let resolveSnapshot!: (result: TuffSearchResult) => void
    let rejectSnapshot!: (error: unknown) => void
    const snapshotPromise = new Promise<TuffSearchResult>((resolve, reject) => {
      resolveSnapshot = resolve
      rejectSnapshot = reject
    })
    const abortController = new AbortController()
    activeSearchAbortController = abortController
    const rejectBeforeSnapshot = (error: unknown): void => {
      if (snapshotSettled) return
      snapshotSettled = true
      rejectSnapshot(error)
    }
    const supersede = (): void => {
      rejectBeforeSnapshot(searchStreamSupersededError)
      abortController.abort()
    }
    cancelPendingSearchSnapshot = supersede

    let controller: StreamController | null = null
    const finishStream = (): void => {
      streamEnded = true
      if (activeSearchStreamController === controller) {
        activeSearchStreamController = null
      }
      if (activeSearchAbortController === abortController) {
        activeSearchAbortController = null
      }
    }
    const failStream = (error: unknown): void => {
      if (streamEnded) return
      finishStream()
      if (currentSequence !== searchSequence || abortController.signal.aborted) {
        rejectBeforeSnapshot(searchStreamSupersededError)
        return
      }
      if (!snapshotSettled) {
        rejectBeforeSnapshot(error)
        return
      }
      // A failed refresh cannot say which rows are stale, so what is on screen stays.
      discardRefreshReconcile()
      loading.value = false
      recommendationPending.value = false
      searchError.value = true
      devLog('Search stream failed:', error)
    }

    try {
      void transport
        .stream(
          CoreBoxEvents.search.session,
          {
            query,
            activations: activeActivations.value,
            surface: isDetachedDivisionMode() ? 'division-box' : 'core-box'
          },
          {
            signal: abortController.signal,
            onData: (chunk: CoreBoxSearchSessionChunk) => {
              if (
                streamEnded ||
                currentSequence !== searchSequence ||
                abortController.signal.aborted
              )
                return

              switch (chunk.type) {
                case 'session':
                  currentSearchId.value = chunk.sessionId
                  return
                case 'snapshot':
                  if (currentSearchId.value !== chunk.sessionId) {
                    rejectBeforeSnapshot(
                      new Error('Search snapshot arrived before session identity')
                    )
                    abortController.abort()
                    return
                  }
                  if (!snapshotSettled) {
                    try {
                      // Port chunks can precede the start ACK. Apply the snapshot before the next
                      // update/complete callback, rather than overwriting those chunks after await.
                      applySnapshot(chunk.result)
                      if (pendingPreferredItemId) {
                        if (res.value.some((item) => item.id === pendingPreferredItemId)) {
                          pendingPreferredItemId = null
                        } else {
                          preferredFallbackItemId = res.value[boxOptions.focus]?.id ?? null
                        }
                      }
                      snapshotSettled = true
                      cancelPendingSearchSnapshot = null
                      resolveSnapshot(chunk.result)
                    } catch (error) {
                      rejectBeforeSnapshot(error)
                      abortController.abort()
                    }
                  }
                  return
                case 'update': {
                  if (currentSearchId.value !== chunk.sessionId) return
                  const items = limitIncomingBatchItems(filterDetachedItems(chunk.items))
                  if (items.length === 0) return
                  // Arrivals append below the rows on screen, so a row keeps its index unless a
                  // pinned arrival lands above it or the quota drops it. Only a row the user
                  // moved to (focus > 0) follows its item; the untouched default stays on row 0.
                  const focusedItemId =
                    boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
                  if (
                    pendingPreferredItemId &&
                    preferredFallbackItemId &&
                    focusedItemId &&
                    focusedItemId !== preferredFallbackItemId
                  ) {
                    // The user moved focus after the refresh snapshot; their newer intent wins.
                    pendingPreferredItemId = null
                  }
                  setSearchResults(mergeRenderedItems(searchResults.value, items, focusedItemId))
                  // An empty snapshot keeps the query waiting; the deferred layer's first rows end it.
                  hasFreshResults.value = searchResults.value.length > 0
                  if (pendingRefreshReconcile) {
                    pendingRefreshReconcile.items = mergeRenderedItems(
                      pendingRefreshReconcile.items,
                      items
                    )
                    for (const item of items) pendingRefreshReconcile.deliveredIds.add(item.id)
                  }
                  if (
                    pendingPreferredItemId &&
                    res.value.some((item) => item.id === pendingPreferredItemId)
                  ) {
                    restoreFocusedItem(pendingPreferredItemId)
                    pendingPreferredItemId = null
                    preferredFallbackItemId = null
                  } else {
                    restoreFocusedItem(focusedItemId)
                    if (pendingPreferredItemId) {
                      preferredFallbackItemId = res.value[boxOptions.focus]?.id ?? null
                    }
                  }
                  activeActivations.value = refreshActiveWidgetFeature(
                    activeActivations.value,
                    items
                  )
                  return
                }
                case 'no-results':
                  if (currentSearchId.value === chunk.sessionId && chunk.shouldShrink) {
                    applyNoResults()
                  }
                  return
                case 'complete':
                  if (currentSearchId.value === chunk.sessionId) {
                    applySearchEnd({
                      searchId: chunk.sessionId,
                      cancelled: chunk.cancelled,
                      activate: chunk.activate,
                      sources: chunk.sources
                    })
                  }
              }
            },
            onError: failStream,
            onEnd: () => {
              if (streamEnded) return
              finishStream()
              if (currentSequence !== searchSequence || abortController.signal.aborted) return
              if (!snapshotSettled) {
                rejectBeforeSnapshot(new Error('Search stream ended before its snapshot'))
                return
              }
              loading.value = false
              recommendationPending.value = false
            }
          }
        )
        .then((nextController) => {
          controller = nextController
          if (currentSequence !== searchSequence || abortController.signal.aborted) {
            controller.cancel()
          } else if (!streamEnded) {
            activeSearchStreamController = controller
          }
        }, failStream)
    } catch (error) {
      failStream(error)
    }

    try {
      return await snapshotPromise
    } finally {
      if (cancelPendingSearchSnapshot === supersede) {
        cancelPendingSearchSnapshot = null
      }
    }
  }

  async function executeSearch(options: ExecuteSearchOptions = {}): Promise<void> {
    if (searchDisposed) return
    if (options.force) searchError.value = false
    if (options.refreshClipboard !== false) {
      await refreshClipboardBeforeInputBuild()
    }
    if (searchDisposed) return
    const inputs = buildQueryInputs()
    const queryContext = oneShotQueryContext
    const queryKey = buildQueryKey(searchVal.value, inputs, activeActivations.value)
    // Same rule as a streamed batch: an index-commit refresh keeps a row the user moved to, and
    // leaves the untouched default on row 0 instead of chasing the item that used to sit there.
    const selectedItemId =
      options.preserveSelection && boxOptions.focus > 0
        ? (res.value[boxOptions.focus]?.id ?? null)
        : null

    if (isDivisionBoxMode() && !isDetachedDivisionMode()) {
      beginSearchSequence(inputs, options)
      const query = buildCurrentQuery(searchVal.value, inputs, queryContext)
      broadcastDivisionBoxInput(query)
      return
    }

    if (!searchVal.value && !activeActivations.value?.length) {
      const hasInputs = inputs.length > 0

      if (!hasInputs && appSetting.recommendation?.enabled === false) {
        beginSearchSequence(inputs, options)
        boxOptions.focus = 0
        resetSearchState()
        return
      }

      if (shouldSkipDuplicateQuery(queryKey, inputs, options.force === true)) {
        return
      }

      const currentSequence = beginSearchSequence(inputs, options)
      boxOptions.focus = 0
      // What is on screen stays, with its layout, until the recommendation snapshot replaces both
      // in one update (applyRecommendationResult). Clearing them here would unmount the results
      // area and leave the window's old height blank until the snapshot lands, on every open and
      // every cleared query. The timeout and failure paths below still clear.
      currentSearchId.value = null
      loading.value = true
      // The grid still on screen is an earlier one; the searching cue waits for this snapshot.
      hasFreshResults.value = false
      recommendationPending.value = true
      // Don't collapse immediately - wait for recommendation to load
      // This prevents the jarring collapse-then-expand animation

      const RECOMMENDATION_TIMEOUT_MS = 400
      recommendationTimeoutSequence = currentSequence
      recommendationTimeoutId = setTimeout(() => {
        if (recommendationTimeoutSequence !== currentSequence) return
        if (recommendationPending.value) {
          // Past the budget, what is still on screen belongs to an earlier query or a stale grid.
          searchResults.value = []
          searchResult.value = null
          boxOptions.layout = undefined
          recommendationPending.value = false
          window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
        }
        recommendationTimeoutId = null
        recommendationTimeoutSequence = null
      }, RECOMMENDATION_TIMEOUT_MS)

      try {
        markInFlightQuery(queryKey, currentSequence)
        const query = buildCurrentQuery('', inputs, queryContext)
        inputTransport.broadcast({ input: query.text, query, source: 'renderer' })

        logDebug('[useSearch] Sending recommendation query:', {
          text: query.text,
          inputs: inputs.length
        })

        const requestStartedAt = performance.now()
        const initialResult = await requestSearchSnapshot(query, currentSequence, (result) => {
          applyRecommendationResult(result)
          loading.value = false
          recommendationPending.value = false
        })
        logDebug('[useSearch] Recommendation stream snapshot duration:', {
          ms: Math.round(performance.now() - requestStartedAt),
          sessionId: initialResult?.sessionId
        })
        clearRecommendationTimeout(currentSequence)
        clearInFlightQuery(queryKey, currentSequence)

        if (currentSequence !== searchSequence) {
          logDebug('[useSearch] Discarding stale recommendation result', {
            sessionId: initialResult?.sessionId,
            sequence: currentSequence,
            latest: searchSequence
          })
          return
        }

        logDebug('[useSearch] Recommendation result accepted:', {
          sessionId: initialResult?.sessionId,
          itemCount: initialResult?.items?.length || 0
        })
      } catch (error) {
        clearRecommendationTimeout(currentSequence)
        clearInFlightQuery(queryKey, currentSequence)
        if (error === searchStreamSupersededError || currentSequence !== searchSequence) return
        devLog('Recommendation search failed:', error)
        resetSearchState()
        searchError.value = true
      }
      return
    }

    if (!searchVal.value) {
      beginSearchSequence(inputs, options)
      const query = buildCurrentQuery('', inputs, queryContext)

      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })

      return
    }

    if (shouldSkipDuplicateQuery(queryKey, inputs, options.force === true)) {
      return
    }

    const currentSequence = beginSearchSequence(inputs, options)
    if (!options.preserveSelection) {
      boxOptions.focus = 0
    }
    loading.value = true
    // A new query waits for its first rows, even with the previous query's still on screen. A
    // re-run of the query on screen (an index-commit refresh, the re-run on show) already has its
    // own rows up, so it is settling rather than waiting.
    hasFreshResults.value = isRenderedTextQuery(queryKey) && searchResults.value.length > 0
    // Don't clear results immediately - this causes UI flicker
    // Results will be replaced when new search completes

    try {
      markInFlightQuery(queryKey, currentSequence)
      const query = buildCurrentQuery(searchVal.value, inputs, queryContext)

      logDebug('[useSearch] Sending search query:', {
        text: query.text,
        inputs: inputs.length
      })

      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })

      const requestStartedAt = performance.now()
      const initialResult = await requestSearchSnapshot(
        query,
        currentSequence,
        (result) => {
          applySearchSnapshot(result, options, selectedItemId, queryKey)
        },
        selectedItemId
      )
      logDebug('[useSearch] Search stream snapshot duration:', {
        ms: Math.round(performance.now() - requestStartedAt),
        sessionId: initialResult?.sessionId
      })
      clearInFlightQuery(queryKey, currentSequence)

      logDebug('[useSearch] Search result received:', {
        sessionId: initialResult.sessionId,
        itemCount: initialResult.items?.length || 0,
        hasActivate: !!initialResult.activate,
        activateLength: initialResult.activate?.length || 0,
        query: query.text
      })

      if (currentSequence !== searchSequence) {
        logDebug('[useSearch] Discarding stale search result (sequence mismatch)', {
          sessionId: initialResult.sessionId,
          sequence: currentSequence,
          latest: searchSequence
        })
        return
      }
    } catch (error) {
      clearInFlightQuery(queryKey, currentSequence)
      if (error === searchStreamSupersededError || currentSequence !== searchSequence) return
      devLog('Search initiation failed:', error)
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined
      loading.value = false
      searchError.value = true
    }
  }

  const debouncedSearch = useDebounceFn(executeSearch, SEARCH_DEBOUNCE_MS)

  async function handleSearch(): Promise<void> {
    debouncedSearch()
  }

  async function handleSearchImmediate(options: ExecuteSearchOptions = {}): Promise<void> {
    const cancelable = debouncedSearch as unknown as { cancel?: () => void }
    cancelable.cancel?.()
    await executeSearch(options)
  }

  /**
   * Whether a committed index revision should re-run the current query.
   *
   * The empty query is the recommendation grid, and it is refreshed only when main says the commit
   * actually changed what belongs there (`recommendationsInvalidated`). Refreshing it on every
   * commit would re-query CoreBox continuously while a file index builds; never refreshing it —
   * the behaviour before 2026-09-04 — left an open CoreBox showing a stale grid until the user
   * closed and reopened it, even for a freshly installed app whose cache main had already dropped.
   *
   * Visibility decides when, not whether: a commit that arrives while CoreBox is hidden stays
   * pending until it is shown again (see armIndexCommitRefresh).
   */
  function shouldRefreshForIndexCommit(recommendationsInvalidated: boolean): boolean {
    if (isDivisionBoxMode() || !hasWindow()) return false
    if (hasPluginFeatureActivation(activeActivations.value)) return false

    return searchVal.value.trim() ? true : recommendationsInvalidated
  }

  /**
   * The native signal is authoritative: a hidden keep-alive window can still report
   * `document.hidden === false`. The document state only adds a stop.
   */
  function isCoreBoxHidden(): boolean {
    return !coreBoxWindowVisible || (hasDocument() && document.hidden)
  }

  /**
   * Tracks whether commits keep arriving. The step climbs only when a refresh runs (see
   * runIndexCommitRefresh); a quiet gap starts it over, and a bulk commit starts at 2s.
   */
  function noteIndexCommit(bulk: boolean): void {
    const now = performance.now()
    if (lastIndexCommitAt === null || now - lastIndexCommitAt >= INDEX_COMMIT_QUIET_MS) {
      indexCommitRefreshStep = 0
    }
    lastIndexCommitAt = now
    if (bulk) indexCommitRefreshStep = Math.max(indexCommitRefreshStep, INDEX_COMMIT_BULK_STEP)
  }

  function scheduleIndexCommitRefresh(commit: {
    recommendationsInvalidated: boolean
    bulk: boolean
  }): void {
    noteIndexCommit(commit.bulk)
    if (!shouldRefreshForIndexCommit(commit.recommendationsInvalidated)) return
    indexCommitRefreshPending = true
    // A commit that only matters to the grid must not be downgraded by a later plain commit
    // arriving inside the debounce window.
    indexCommitRefreshForRecommendations ||= commit.recommendationsInvalidated
    armIndexCommitRefresh(INDEX_COMMIT_REFRESH_STEPS_MS[indexCommitRefreshStep])
  }

  /**
   * One timer at a time, and a later commit never pushes it back. Hidden, nothing is armed: the
   * refresh stays pending, and the re-run when CoreBox is shown again covers it.
   */
  function armIndexCommitRefresh(delayMs: number): void {
    if (indexCommitRefreshTimer || isCoreBoxHidden()) return
    indexCommitRefreshTimer = setTimeout(() => {
      indexCommitRefreshTimer = null
      void runIndexCommitRefresh()
    }, delayMs)
  }

  function clearIndexCommitRefreshTimer(): void {
    if (!indexCommitRefreshTimer) return
    clearTimeout(indexCommitRefreshTimer)
    indexCommitRefreshTimer = null
  }

  /**
   * Starts the backoff over and drops a waiting refresh. Whatever searches next (the new query, the
   * re-run of a re-shown CoreBox) reads the index as it is now, which covers every commit so far.
   */
  function resetIndexCommitRefresh(): void {
    indexCommitRefreshStep = 0
    indexCommitRefreshPending = false
    indexCommitRefreshForRecommendations = false
    clearIndexCommitRefreshTimer()
  }

  async function runIndexCommitRefresh(): Promise<void> {
    if (!indexCommitRefreshPending) return
    if (!shouldRefreshForIndexCommit(indexCommitRefreshForRecommendations)) {
      indexCommitRefreshPending = false
      indexCommitRefreshForRecommendations = false
      return
    }
    // Hiding clears the timer, so only the document can have hidden it since: stay pending.
    if (isCoreBoxHidden()) return
    if (loading.value || inFlightQuery !== null) {
      // Poll at the first step until the search in flight ends; the step counts refreshes.
      armIndexCommitRefresh(INDEX_COMMIT_REFRESH_STEPS_MS[0])
      return
    }

    indexCommitRefreshPending = false
    indexCommitRefreshForRecommendations = false
    indexCommitRefreshStep = Math.min(
      indexCommitRefreshStep + 1,
      INDEX_COMMIT_REFRESH_STEPS_MS.length - 1
    )
    await handleSearchImmediate({
      force: true,
      preserveSelection: true,
      refreshClipboard: false
    })
    if (indexCommitRefreshPending) {
      armIndexCommitRefresh(INDEX_COMMIT_REFRESH_STEPS_MS[indexCommitRefreshStep])
    }
  }

  function scheduleIndexCommitStreamRetry(): void {
    if (
      indexCommitStreamDisposed ||
      indexCommitStreamStartPending ||
      indexCommitStreamController ||
      indexCommitStreamRetryTimer
    ) {
      return
    }
    indexCommitStreamRetryTimer = setTimeout(() => {
      indexCommitStreamRetryTimer = null
      startIndexCommitStream()
    }, 1_000)
  }

  function startIndexCommitStream(): void {
    if (
      isDivisionBoxMode() ||
      indexCommitStreamDisposed ||
      indexCommitStreamStartPending ||
      indexCommitStreamController
    ) {
      return
    }

    const generation = ++indexCommitStreamGeneration
    indexCommitStreamStartPending = true
    void transport
      .stream(CoreBoxEvents.search.indexCommitted, undefined, {
        onData: (payload) => {
          if (generation === indexCommitStreamGeneration && !indexCommitStreamDisposed) {
            scheduleIndexCommitRefresh({
              recommendationsInvalidated: payload?.recommendationsInvalidated === true,
              bulk: payload?.bulk === true
            })
          }
        },
        onError: (error) => {
          if (generation !== indexCommitStreamGeneration || indexCommitStreamDisposed) {
            return
          }
          devLog('Search index commit stream failed:', error)
          indexCommitStreamGeneration++
          indexCommitStreamStartPending = false
          const controller = indexCommitStreamController
          indexCommitStreamController = null
          controller?.cancel()
          scheduleIndexCommitStreamRetry()
        }
      })
      .then((controller) => {
        if (indexCommitStreamDisposed || generation !== indexCommitStreamGeneration) {
          controller.cancel()
          return
        }
        indexCommitStreamStartPending = false
        indexCommitStreamController = controller
      })
      .catch((error) => {
        if (indexCommitStreamDisposed || generation !== indexCommitStreamGeneration) {
          return
        }
        indexCommitStreamStartPending = false
        devLog('Failed to start search index commit stream:', error)
        scheduleIndexCommitStreamRetry()
      })
  }

  function stopIndexCommitStream(): void {
    indexCommitStreamDisposed = true
    indexCommitStreamGeneration++
    indexCommitStreamStartPending = false
    indexCommitStreamController?.cancel()
    indexCommitStreamController = null
    resetIndexCommitRefresh()
    if (indexCommitStreamRetryTimer) {
      clearTimeout(indexCommitStreamRetryTimer)
      indexCommitStreamRetryTimer = null
    }
  }

  // D-d (2026-09-26): a hidden CoreBox does not refresh on commits; they wait for it to be shown.
  const unsubscribeRendererActivity = subscribeRendererActivity((visible) => {
    if (visible === coreBoxWindowVisible) return
    coreBoxWindowVisible = visible
    if (!visible) {
      clearIndexCommitRefreshTimer()
      return
    }
    // `corebox:shown` normally re-runs the query first and so clears what is pending. Anything
    // still pending gets its one refresh here, from the first step.
    indexCommitRefreshStep = 0
    if (indexCommitRefreshPending) armIndexCommitRefresh(INDEX_COMMIT_REFRESH_STEPS_MS[0])
  })

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      return
    }

    // Clipboard-history recommendation items have no execute provider in the
    // search core. Route them through the clipboard apply pipeline (write +
    // auto-paste), which hides CoreBox and pastes into the active app.
    if (itemToExecute.source?.id === CLIPBOARD_HISTORY_SOURCE_ID) {
      const recordId = resolveClipboardHistoryRecordId(itemToExecute)
      if (recordId != null) {
        searchVal.value = ''
        searchResults.value = []
        select.value = -1
        await transport
          .send(ClipboardEvents.apply, { id: recordId, autoPaste: true })
          .catch((error) => {
            devLog('Clipboard apply failed:', error)
          })
        return
      }
    }

    const isPluginFeature =
      itemToExecute.kind === 'feature' && itemToExecute.source?.type === 'plugin'
    const pluginFeatureSnapshot = isPluginFeature
      ? (JSON.parse(JSON.stringify(itemToExecute)) as PluginFeatureItem)
      : null
    const metaRecord = isRecord(itemToExecute.meta) ? itemToExecute.meta : null
    const intelligence =
      metaRecord && isRecord(metaRecord.intelligence) ? metaRecord.intelligence : null
    const keepCoreBoxOpen =
      metaRecord?.keepCoreBoxOpen === true || intelligence?.keepCoreBoxOpen === true
    const shouldRestoreAfterExecute =
      isPluginFeature || !appSetting.tools.autoHide || keepCoreBoxOpen
    const shouldLaunchAppInBackground = isBackgroundAppLaunchItem(itemToExecute)

    if (shouldLaunchAppInBackground) {
      searchVal.value = ''
      searchResults.value = []
      activeActivations.value = null
      loading.value = false
      select.value = -1

      const serializedItem = JSON.parse(JSON.stringify(itemToExecute))
      const serializedSearchResult = searchResult.value
        ? JSON.parse(JSON.stringify(searchResult.value))
        : null

      await transport
        .send(CoreBoxEvents.ui.hide, { immediate: true, reason: 'execute' })
        .catch(() => {})
      void transport
        .send(
          CoreBoxEvents.item.execute,
          serializedSearchResult
            ? {
                item: serializedItem,
                searchResult: serializedSearchResult
              }
            : {
                item: serializedItem
              }
        )
        .catch((error) => {
          devLog('Execute failed:', error)
        })
      return
    }

    if (!isPluginFeature && !keepCoreBoxOpen) {
      searchVal.value = ''
      await transport.send(CoreBoxEvents.ui.hide, undefined).catch(() => {})
    }

    let pluginFeatureShowsInput = true

    if (isPluginFeature) {
      ensureBoxData(boxOptions).feature = itemToExecute
      boxOptions.mode = BoxMode.FEATURE

      const interaction = (itemToExecute.meta as { interaction?: unknown } | null | undefined)
        ?.interaction
      const explicitShowInput = isRecord(interaction) ? interaction.showInput : undefined
      const allowInput = isRecord(interaction) && interaction.allowInput === true

      const acceptedInputTypes = (
        itemToExecute.meta as { extension?: Record<string, unknown> } | null | undefined
      )?.extension?.acceptedInputTypes
      const hasAcceptedInputTypes =
        Array.isArray(acceptedInputTypes) && acceptedInputTypes.length > 0
      const shouldShowInput =
        typeof explicitShowInput === 'boolean'
          ? explicitShowInput
          : hasAcceptedInputTypes || allowInput
      pluginFeatureShowsInput = shouldShowInput

      activeActivations.value = [
        {
          id: 'plugin-features',
          meta: {
            pluginName: itemToExecute.meta?.pluginName,
            featureId: itemToExecute.meta?.featureId,
            feature: itemToExecute,
            activationFeature: pluginFeatureSnapshot
          },
          hideResults: false,
          showInput: shouldShowInput
        }
      ]
    }

    searchResults.value = []

    const currentQueryText =
      isPluginFeature && !pluginFeatureShowsInput
        ? ''
        : isPluginFeature
          ? searchVal.value
          : typeof searchResult.value?.query?.text === 'string'
            ? searchResult.value.query.text
            : searchVal.value
    await refreshClipboardBeforeInputBuild('explicit')
    const currentInputs = buildQueryInputs({
      queryText: currentQueryText,
      allowPendingTextClipboard: isPluginFeature
    })
    if (isPluginFeature && !pluginFeatureShowsInput) {
      searchVal.value = ''
    }
    const usedFileModeAttachment =
      boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length > 0
    const usedClipboardInput = currentInputs.length > 0 && !usedFileModeAttachment

    const serializedItem = pluginFeatureSnapshot ?? JSON.parse(JSON.stringify(itemToExecute))
    const serializedSearchResult = searchResult.value
      ? JSON.parse(JSON.stringify(searchResult.value))
      : null

    if (serializedSearchResult?.query) {
      if (oneShotQueryContext) {
        serializedSearchResult.query.context = oneShotQueryContext
      } else {
        delete serializedSearchResult.query.context
      }
    }
    oneShotQueryContext = undefined

    if (isPluginFeature && serializedSearchResult?.query) {
      serializedSearchResult.query.text = currentQueryText
      serializedSearchResult.query.inputs = currentInputs
    }

    loading.value = true
    // The rows were cleared above: an execute in flight is waiting, never "still searching more".
    hasFreshResults.value = false

    let pluginFeatureActivated = false

    try {
      const activationState = await transport.send(
        CoreBoxEvents.item.execute,
        serializedSearchResult
          ? {
              item: serializedItem,
              searchResult: serializedSearchResult
            }
          : {
              item: serializedItem
            }
      )
      const newActivationState = mergePluginFeatureActivationState(
        toActivations(activationState as ActivationState | IProviderActivate[] | null),
        activeActivations.value,
        isPluginFeature ? itemToExecute : undefined
      )
      activeActivations.value = newActivationState
      pluginFeatureActivated = isPluginFeature && hasPluginFeatureActivation(newActivationState)

      if (newActivationState && newActivationState.length > 0 && !pluginFeatureActivated) {
        searchVal.value = ''
      }

      if (usedFileModeAttachment) {
        boxOptions.mode = BoxMode.INPUT
        boxOptions.file = { buffer: null, paths: [] }
      }

      if (usedClipboardInput && clipboardOptions) {
        if (clipboardOptions.last?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
        } else if (clipboardOptions.pendingAutoFillItem?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.pendingAutoFillItem.timestamp
        }
        clipboardOptions.last = null
        clipboardOptions.pendingAutoFillItem = null
        clipboardOptions.detectedAt = null
        clipboardOptions.activeClipboardSource = null
      } else if (isPluginFeature && clipboardOptions && appSetting.tools.autoPaste.time === 0) {
        if (clipboardOptions.last?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
        } else if (clipboardOptions.pendingAutoFillItem?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.pendingAutoFillItem.timestamp
        }
        clipboardOptions.last = null
        clipboardOptions.pendingAutoFillItem = null
        clipboardOptions.detectedAt = null
        clipboardOptions.activeClipboardSource = null
      }
    } catch (error) {
      devLog('Execute failed:', error)
    } finally {
      loading.value = false

      if (shouldRestoreAfterExecute) {
        transport.send(CoreBoxEvents.ui.show).catch(() => {})
      }
    }

    select.value = -1

    if (!pluginFeatureActivated) {
      await handleSearch()
    }
  }

  async function deactivateProvider(providerId?: string): Promise<boolean> {
    if (!providerId) {
      const newState = await transport.send(CoreBoxEvents.provider.deactivateAll)
      activeActivations.value = toActivations(newState)
      searchVal.value = ''
      await handleSearch()
      return true
    }

    const newState = await transport.send(CoreBoxEvents.provider.deactivate, { id: providerId })
    const mapped = toActivations(newState)
    activeActivations.value = mapped

    if (!mapped || mapped.length === 0) {
      searchVal.value = ''
    }

    await handleSearch()
    return true
  }

  async function deactivateAllProviders(): Promise<void> {
    const newState = await transport.send(CoreBoxEvents.provider.deactivateAll)
    activeActivations.value = toActivations(newState)
    searchVal.value = ''

    if (boxOptions.mode === BoxMode.FEATURE) {
      boxOptions.mode = BoxMode.INPUT
      boxOptions.data = {}
    }

    await handleSearch()
  }

  async function handleExit(): Promise<void> {
    if (contextActionRequest.value) {
      contextActionRequest.value = null
      activeActivations.value = null
      await transport
        .send(CoreBoxEvents.provider.deactivate, { id: CONTEXT_ACTIONS_PROVIDER_ID })
        .catch(() => null)
      transport.send(CoreBoxEvents.ui.hide, undefined).catch(() => {})
      return
    }

    if (activeActivations.value && activeActivations.value.length > 0) {
      await deactivateAllProviders()
      return
    }

    if (boxOptions.mode !== BoxMode.INPUT) {
      if (boxOptions.mode === BoxMode.FEATURE) {
        const boxData = boxOptions.data as BoxData | undefined
        if (boxData?.pushedItemIds && boxData.pushedItemIds.size > 0) {
          const pushedIds = boxData.pushedItemIds

          searchResults.value = searchResults.value.filter((item: TuffItem) => {
            return (
              !item.meta?.extension?.pushedItemId ||
              !pushedIds.has(item.meta?.extension?.pushedItemId)
            )
          })
        }

        if (boxData?.plugin) {
          transport
            .send(triggerFeatureExitEvent, {
              plugin: boxData.plugin
            })
            .catch(() => {})
        }
        ensureBoxData(boxOptions).feature = undefined
      }

      boxOptions.mode = searchVal.value.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
      boxOptions.data = {}
    } else if (searchVal.value) {
      searchVal.value = ''
    } else {
      transport.send(CoreBoxEvents.ui.hide, undefined).catch(() => {})
    }
  }

  useResize({ results: res, activeActivations, loading, recommendationPending })

  watch(
    () => res.value.length,
    () => {
      if (res.value.length > 0 && boxOptions.focus === -1) {
        boxOptions.focus = 0
      }
    }
  )

  watch(searchVal, (newSearchVal) => {
    if (contextActionRequest.value && newSearchVal.trim()) {
      contextActionRequest.value = null
      activeActivations.value =
        activeActivations.value?.filter(
          (activation) => activation.id !== CONTEXT_ACTIONS_PROVIDER_ID
        ) ?? null
      void transport.send(CoreBoxEvents.provider.deactivate, {
        id: CONTEXT_ACTIONS_PROVIDER_ID
      })
    }

    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND) {
      boxOptions.mode = newSearchVal.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
    }
  })

  watch(searchVal, (val) => {
    // A new query reads the index as it is now; the commit backoff starts over with it.
    resetIndexCommitRefresh()
    if (programmaticQueryValue !== null) {
      const shouldSkipReactiveSearch = val === programmaticQueryValue
      programmaticQueryValue = null
      if (shouldSkipReactiveSearch) return
    }
    oneShotQueryContext = undefined
    if (hasSendModePluginFeatureActivation(activeActivations.value)) {
      const cancelable = debouncedSearch as unknown as { cancel?: () => void }
      cancelable.cancel?.()
      if (!val) {
        void handleSearchImmediate()
      }
      return
    }

    if (!val) {
      const cancelable = debouncedSearch as unknown as { cancel?: () => void }
      cancelable.cancel?.()
      void handleSearchImmediate()
      return
    }
    handleSearch()
  })

  const activeItem = computed(() => res.value[boxOptions.focus])

  const unregContextActionsOpen = transport.on(
    CoreBoxEvents.contextActions.open,
    async (payload) => {
      const request = normalizeCoreBoxContextActionsOpenRequest(payload)
      if (!request) return

      await transport.send(CoreBoxEvents.provider.deactivateAll).catch(() => null)
      contextActionRequest.value = request
      activeActivations.value = null
      searchVal.value = ''
      searchResults.value = []
      searchResult.value = null
      boxOptions.mode = BoxMode.INPUT
      boxOptions.data = {}
      boxOptions.focus = 0

      await handleSearchImmediate({ force: true })
      window.dispatchEvent(new CustomEvent(CoreBoxEvents.input.focus.toEventName()))
    }
  )

  const unregSetQuery = transport.on(CoreBoxEvents.input.setQuery, ({ value, context }) => {
    contextActionRequest.value = null
    void transport.send(CoreBoxEvents.provider.deactivate, { id: CONTEXT_ACTIONS_PROVIDER_ID })
    const nextValue = typeof value === 'string' ? value : ''
    programmaticQueryValue = nextValue
    oneShotQueryContext = context
    searchVal.value = nextValue
    void handleSearchImmediate({ force: true })
    window.dispatchEvent(new CustomEvent(CoreBoxEvents.input.focus.toEventName()))
  })

  let coreBoxShownHandler: (() => void) | null = null

  onMounted(() => {
    startIndexCommitStream()
    transport.send(CoreBoxEvents.provider.getActivated).then((providers) => {
      activeActivations.value = toActivations(providers as ActivationState | IProviderActivate[])
    })

    const divisionSessionId = windowState.divisionBox?.sessionId
    if (isDetachedDivisionMode() && divisionSessionId) {
      void hydrateDetachedPayload(divisionSessionId).then((loaded) => {
        if (loaded) return

        const fallbackQuery = getDetachedDivisionConfig()?.query
        if (fallbackQuery) {
          searchVal.value = fallbackQuery
          return
        }
        void handleSearchImmediate()
      })
    } else {
      handleSearch()
    }

    if (!isDivisionBoxMode()) {
      coreBoxShownHandler = () => {
        // The re-run below is the one refresh for every commit missed while hidden, and the
        // backoff starts over from it.
        resetIndexCommitRefresh()
        if (
          !hasPluginFeatureActivation(activeActivations.value) &&
          (searchVal.value || !activeActivations.value?.length)
        ) {
          handleSearchImmediate({ force: true })
        }
      }
      window.addEventListener('corebox:shown', coreBoxShownHandler)
    }
  })

  onBeforeUnmount(() => {
    searchDisposed = true
    const cancelable = debouncedSearch as unknown as { cancel?: () => void }
    cancelable.cancel?.()
    cancelActiveSearchStream()
    stopIndexCommitStream()
    unsubscribeRendererActivity()
    unregContextActionsOpen()
    unregSetQuery()
    unregItemClear()

    if (coreBoxShownHandler) {
      window.removeEventListener('corebox:shown', coreBoxShownHandler)
      coreBoxShownHandler = null
    }

    window.__coreboxQueryInputDebug = undefined
    clearRecommendationTimeout()
  })

  function applySearchEnd(data: SearchEndData): void {
    if (data.cancelled) {
      resetSearchState()
      activeActivations.value = null
      return
    }

    settleRefreshReconcile()
    const nextActivationState = mergePluginFeatureActivationState(
      data.activate || null,
      activeActivations.value
    )
    if (searchResult.value) {
      searchResult.value.activate = nextActivationState ?? undefined
      searchResult.value.sources = data.sources ?? []
    }
    activeActivations.value = nextActivationState
    loading.value = false
    recommendationPending.value = false
  }

  const unregItemClear = transport.on(CoreBoxEvents.item.clear, () => {
    resetSearchState()
  })

  function applyNoResults(): void {
    if (searchVal.value || activeActivations.value?.length) return

    recommendationPending.value = false
    loading.value = false

    if (res.value.length === 0) {
      transport.send(CoreBoxEvents.ui.expand, { mode: 'collapse' }).catch(() => {})
      return
    }

    window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
  }

  return {
    searchVal,
    select,
    res,
    loading,
    awaitingFirstResults,
    searchSettling,
    searchError,
    recommendationPending,
    activeItem,
    activeActivations,
    replaceSearchResults,
    handleExecute,
    handleExit,
    handleSearchImmediate,
    deactivateProvider,
    deactivateAllProviders
  }
}
