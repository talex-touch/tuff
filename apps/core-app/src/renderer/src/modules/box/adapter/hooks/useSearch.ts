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
import { CoreBoxEvents, DivisionBoxEvents } from '@talex-touch/utils/transport/events'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useBoxItems } from '~/modules/box/item-sdk'
import { appSetting } from '~/modules/storage/app-storage'
import { devLog } from '~/utils/dev-log'
import { isDivisionBoxMode, windowState } from '~/modules/hooks/core-box'
import { BoxMode } from '..'
import { isDetachedDivisionItemMatch, parseDetachedDivisionConfig } from './detached-division'
import { createCoreBoxInputTransport } from '../transport/input-transport'
import { isBackgroundAppLaunchItem } from './app-launch-item'
import { buildClipboardQueryInputs } from './clipboard-query-inputs'
import {
  clearImplicitClipboardState,
  isClipboardFreshForAutoPaste,
  normalizeClipboardTimestamp
} from './clipboard-autopaste'
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

  watch(boxItems, (items) => {
    activeActivations.value = refreshActiveWidgetFeature(activeActivations.value, [...items])
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const contextActionRequest = shallowRef<CoreBoxContextActionsOpenRequest | null>(null)
  const loading = ref(false)
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

  function limitRenderedItems(items: TuffItem[]): TuffItem[] {
    return items.length > MAX_RENDERED_RESULTS ? items.slice(0, MAX_RENDERED_RESULTS) : items
  }

  function replaceSearchResults(items: TuffItem[]): void {
    searchResults.value = limitRenderedItems(filterDetachedItems(items))
  }

  function mergeRenderedItems(current: TuffItem[], incoming: TuffItem[]): TuffItem[] {
    const itemsById = new Map<string, TuffItem>()
    for (const item of current) {
      itemsById.set(item.id, item)
    }
    for (const item of incoming) {
      itemsById.set(item.id, item)
    }
    return Array.from(itemsById.values()).slice(0, MAX_RENDERED_RESULTS)
  }

  let searchSequence = 0
  let activeSearchStreamController: StreamController | null = null
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
  let indexCommitStreamDisposed = false
  let indexCommitStreamGeneration = 0
  let indexCommitStreamStartPending = false
  let indexCommitStreamController: { cancel: () => void } | null = null
  let indexCommitStreamRetryTimer: ReturnType<typeof setTimeout> | null = null

  const DUPLICATE_QUERY_WINDOW_MS = 200
  const INDEX_COMMIT_REFRESH_INTERVAL_MS = 500
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
    activeSearchStreamController?.cancel()
    activeSearchStreamController = null
    cancelPendingSearchSnapshot?.()
    cancelPendingSearchSnapshot = null
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

  const applyRecommendationResult = (initialResult: TuffSearchResult): void => {
    const filteredItems = limitRenderedItems(filterDetachedItems(initialResult.items))
    currentSearchId.value = initialResult.sessionId || null
    searchResult.value = isDetachedDivisionMode()
      ? { ...initialResult, items: filteredItems }
      : initialResult
    searchResults.value = filteredItems
    boxOptions.layout = initialResult.containerLayout

    activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

    nextTick(() => {
      window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
    })
  }
  async function requestSearchSnapshot(
    query: TuffQuery,
    currentSequence: number
  ): Promise<TuffSearchResult> {
    let snapshotSettled = false
    let streamEnded = false
    let resolveSnapshot!: (result: TuffSearchResult) => void
    let rejectSnapshot!: (error: unknown) => void
    const snapshotPromise = new Promise<TuffSearchResult>((resolve, reject) => {
      resolveSnapshot = resolve
      rejectSnapshot = reject
    })
    const rejectBeforeSnapshot = (error: unknown): void => {
      if (snapshotSettled) return
      snapshotSettled = true
      rejectSnapshot(error)
    }
    const supersede = (): void => {
      rejectBeforeSnapshot(searchStreamSupersededError)
    }
    cancelPendingSearchSnapshot = supersede

    let controller: StreamController | null = null
    try {
      controller = await transport.stream(
        CoreBoxEvents.search.session,
        {
          query,
          activations: activeActivations.value,
          surface: isDetachedDivisionMode() ? 'division-box' : 'core-box'
        },
        {
          onData: (chunk: CoreBoxSearchSessionChunk) => {
            if (currentSequence !== searchSequence) return

            switch (chunk.type) {
              case 'session':
                currentSearchId.value = chunk.sessionId
                return
              case 'snapshot':
                if (currentSearchId.value !== chunk.sessionId) {
                  rejectBeforeSnapshot(new Error('Search snapshot arrived before session identity'))
                  return
                }
                if (!snapshotSettled) {
                  snapshotSettled = true
                  cancelPendingSearchSnapshot = null
                  resolveSnapshot(chunk.result)
                }
                return
              case 'update': {
                if (currentSearchId.value !== chunk.sessionId) return
                const items = limitRenderedItems(filterDetachedItems(chunk.items))
                if (items.length === 0) return
                searchResults.value = mergeRenderedItems(searchResults.value, items)
                activeActivations.value = refreshActiveWidgetFeature(activeActivations.value, items)
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
          onError: (error) => {
            streamEnded = true
            if (activeSearchStreamController === controller) {
              activeSearchStreamController = null
            }
            if (currentSequence !== searchSequence) return
            if (!snapshotSettled) {
              rejectBeforeSnapshot(error)
              return
            }
            loading.value = false
            recommendationPending.value = false
            devLog('Search stream failed:', error)
          },
          onEnd: () => {
            streamEnded = true
            if (activeSearchStreamController === controller) {
              activeSearchStreamController = null
            }
            if (currentSequence === searchSequence && !snapshotSettled) {
              rejectBeforeSnapshot(new Error('Search stream ended before its snapshot'))
            }
          }
        }
      )
    } catch (error) {
      rejectBeforeSnapshot(error)
    }

    if (controller) {
      if (currentSequence !== searchSequence) {
        controller.cancel()
        rejectBeforeSnapshot(searchStreamSupersededError)
      } else if (!streamEnded) {
        activeSearchStreamController = controller
      }
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
    if (options.refreshClipboard !== false) {
      await refreshClipboardBeforeInputBuild()
    }
    const inputs = buildQueryInputs()
    const queryContext = oneShotQueryContext
    const queryKey = buildQueryKey(searchVal.value, inputs, activeActivations.value)
    const selectedItemId = options.preserveSelection
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
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined
      loading.value = true
      recommendationPending.value = true
      // Don't collapse immediately - wait for recommendation to load
      // This prevents the jarring collapse-then-expand animation

      const RECOMMENDATION_TIMEOUT_MS = 400
      recommendationTimeoutSequence = currentSequence
      recommendationTimeoutId = setTimeout(() => {
        if (recommendationTimeoutSequence !== currentSequence) return
        if (recommendationPending.value && searchResults.value.length === 0) {
          resetSearchState()
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
        const initialResult = await requestSearchSnapshot(query, currentSequence)
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
        applyRecommendationResult(initialResult)
        loading.value = false
        recommendationPending.value = false
      } catch (error) {
        clearRecommendationTimeout(currentSequence)
        clearInFlightQuery(queryKey, currentSequence)
        if (error === searchStreamSupersededError) return
        devLog('Recommendation search failed:', error)
        resetSearchState()
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
      const initialResult = await requestSearchSnapshot(query, currentSequence)
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

      currentSearchId.value = initialResult.sessionId || null
      const filteredItems = limitRenderedItems(filterDetachedItems(initialResult.items))
      searchResult.value = isDetachedDivisionMode()
        ? { ...initialResult, items: filteredItems }
        : initialResult

      activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

      searchResults.value = filteredItems
      if (options.preserveSelection) {
        const preservedIndex = selectedItemId
          ? res.value.findIndex((item) => item.id === selectedItemId)
          : -1
        boxOptions.focus = preservedIndex >= 0 ? preservedIndex : res.value.length > 0 ? 0 : -1
      }
      logDebug('[useSearch] searchResults updated:', searchResults.value.length, 'items')

      boxOptions.layout = undefined
      nextTick(() => {
        window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
      })
    } catch (error) {
      clearInFlightQuery(queryKey, currentSequence)
      if (error === searchStreamSupersededError) return
      devLog('Search initiation failed:', error)
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined
      loading.value = false
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

  function shouldRefreshForIndexCommit(): boolean {
    return (
      !isDivisionBoxMode() &&
      hasWindow() &&
      (!hasDocument() || !document.hidden) &&
      Boolean(searchVal.value.trim()) &&
      !hasPluginFeatureActivation(activeActivations.value)
    )
  }

  function scheduleIndexCommitRefresh(): void {
    if (!shouldRefreshForIndexCommit()) return
    indexCommitRefreshPending = true
    if (indexCommitRefreshTimer) return

    indexCommitRefreshTimer = setTimeout(() => {
      indexCommitRefreshTimer = null
      void runIndexCommitRefresh()
    }, INDEX_COMMIT_REFRESH_INTERVAL_MS)
  }

  async function runIndexCommitRefresh(): Promise<void> {
    if (!indexCommitRefreshPending) return
    if (!shouldRefreshForIndexCommit()) {
      indexCommitRefreshPending = false
      return
    }
    if (loading.value || inFlightQuery !== null) {
      scheduleIndexCommitRefresh()
      return
    }

    indexCommitRefreshPending = false
    await handleSearchImmediate({
      force: true,
      preserveSelection: true,
      refreshClipboard: false
    })
    if (indexCommitRefreshPending) {
      scheduleIndexCommitRefresh()
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
        onData: () => {
          if (generation === indexCommitStreamGeneration && !indexCommitStreamDisposed) {
            scheduleIndexCommitRefresh()
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
    indexCommitRefreshPending = false
    if (indexCommitRefreshTimer) {
      clearTimeout(indexCommitRefreshTimer)
      indexCommitRefreshTimer = null
    }
    if (indexCommitStreamRetryTimer) {
      clearTimeout(indexCommitStreamRetryTimer)
      indexCommitStreamRetryTimer = null
    }
  }

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      return
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

    const currentQueryText = isPluginFeature
      ? searchVal.value
      : typeof searchResult.value?.query?.text === 'string'
        ? searchResult.value.query.text
        : searchVal.value
    await refreshClipboardBeforeInputBuild('explicit')
    const currentInputs = buildQueryInputs({
      queryText: currentQueryText,
      allowPendingTextClipboard: isPluginFeature
    })
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
    cancelActiveSearchStream()
    stopIndexCommitStream()
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
