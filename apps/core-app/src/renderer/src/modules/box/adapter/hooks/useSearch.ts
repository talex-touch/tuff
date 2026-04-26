import type {
  IProviderActivate,
  TuffItem,
  TuffQuery,
  TuffQueryInput,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ActivationState } from '@talex-touch/utils/transport/events/types'
import type { IBoxOptions } from '..'
import type { IUseSearch } from '../types'
import type { IClipboardOptions } from './types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents, DivisionBoxEvents } from '@talex-touch/utils/transport/events'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useBoxItems } from '~/modules/box/item-sdk'
import { appSetting } from '~/modules/channel/storage'
import { devLog } from '~/utils/dev-log'
import { isDivisionBoxMode, windowState } from '~/modules/hooks/core-box'
import { BoxMode } from '..'
import { createCoreBoxInputTransport } from '../transport/input-transport'
import { isBackgroundAppLaunchItem } from './app-launch-item'
import { buildClipboardQueryInputs } from './clipboard-query-inputs'
import { useResize } from './useResize'

interface SearchEndData {
  searchId: string
  cancelled?: boolean
  activate?: TuffSearchResult['activate']
  sources?: TuffSearchResult['sources']
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

interface DetachedDivisionConfig {
  itemId?: string
  sourceId?: string
  query?: string
}

interface DetachedDivisionPayload {
  item: TuffItem
  query?: string
}

function parseDetachedDivisionConfig(url: string | undefined): DetachedDivisionConfig | null {
  if (!url || !url.startsWith('tuff://detached')) {
    return null
  }
  try {
    const parsed = new URL(url)
    return {
      itemId: parsed.searchParams.get('itemId') || undefined,
      sourceId: parsed.searchParams.get('source') || undefined,
      query: parsed.searchParams.get('query') || undefined
    }
  } catch {
    return null
  }
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
    const config = getDetachedDivisionConfig()
    if (!config?.itemId) return true
    if (item.id !== config.itemId) return false
    if (config.sourceId && item.source?.id !== config.sourceId) return false
    return true
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

  const res = computed<Array<TuffItem>>(() => {
    const itemsMap = new Map<string, TuffItem>()

    boxItems.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    searchResults.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    const result = Array.from(itemsMap.values())
    return filterDetachedItems(result)
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const recommendationPending = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)
  const transport = useTuffTransport()
  const triggerFeatureExitEvent = defineRawEvent<{ plugin: string }, void>(
    'trigger-plugin-feature-exit'
  )

  const pendingSearchEndById = new Map<string, SearchEndData>()
  const pendingSearchUpdatesById = new Map<string, TuffItem[]>()

  const BASE_DEBOUNCE = 80
  const inputTransport = createCoreBoxInputTransport(transport, BASE_DEBOUNCE)

  let searchSequence = 0
  let recommendationTimeoutId: ReturnType<typeof setTimeout> | null = null
  let inFlightQueryKey: string | null = null
  let lastQueryKey = ''
  let lastQueryAt = 0

  const DUPLICATE_QUERY_WINDOW_MS = 200
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
    return `${text}::${activationKey}::${inputsKey}`
  }

  function buildQueryInputs(options?: {
    queryText?: string
    allowPendingTextClipboard?: boolean
  }): TuffQueryInput[] {
    return buildClipboardQueryInputs({
      clipboardItem: clipboardOptions?.last,
      pendingTextClipboardItem: clipboardOptions?.pendingAutoFillItem,
      queryText: options?.queryText,
      allowPendingTextClipboard: options?.allowPendingTextClipboard ?? false,
      filePaths: boxOptions.file?.paths,
      useFileMode: boxOptions.mode === BoxMode.FILE
    })
  }

  const resetSearchState = (): void => {
    searchResults.value = []
    searchResult.value = null
    currentSearchId.value = null
    activeActivations.value = null
    boxOptions.layout = undefined
    loading.value = false
    recommendationPending.value = false
    pendingSearchEndById.clear()
    pendingSearchUpdatesById.clear()
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
    const filteredItems = filterDetachedItems(initialResult.items)
    currentSearchId.value = initialResult.sessionId || null
    searchResult.value = isDetachedDivisionMode()
      ? { ...initialResult, items: filteredItems }
      : initialResult
    searchResults.value = filteredItems
    boxOptions.layout = initialResult.containerLayout

    activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

    if (currentSearchId.value) {
      const pending = pendingSearchEndById.get(currentSearchId.value)
      if (pending) {
        pendingSearchEndById.delete(currentSearchId.value)
        applySearchEnd(pending)
      }
    }

    nextTick(() => {
      window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
    })
  }

  async function executeSearch(): Promise<void> {
    const currentSequence = ++searchSequence
    const inputs = buildQueryInputs()
    const queryKey = buildQueryKey(searchVal.value, inputs, activeActivations.value)

    pendingSearchEndById.clear()
    pendingSearchUpdatesById.clear()

    logDebug('[useSearch] executeSearch start:', {
      sequence: currentSequence,
      text: searchVal.value,
      inputs: inputs.length,
      activations: activeActivations.value?.length || 0
    })

    // Clear any pending recommendation timeout when starting a new search
    if (recommendationTimeoutId) {
      clearTimeout(recommendationTimeoutId)
      recommendationTimeoutId = null
    }

    recommendationPending.value = false

    if (isDivisionBoxMode() && !isDetachedDivisionMode()) {
      const query: TuffQuery = { text: searchVal.value, inputs }
      broadcastDivisionBoxInput(query)
      return
    }

    if (!searchVal.value && !activeActivations.value?.length) {
      boxOptions.focus = 0
      const hasInputs = inputs.length > 0

      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined

      if (!hasInputs && appSetting.recommendation?.enabled === false) {
        resetSearchState()
        return
      }

      const now = Date.now()
      if (inFlightQueryKey === queryKey) {
        logDebug('[useSearch] Skipping duplicate in-flight query:', {
          text: searchVal.value,
          inputs: inputs.length
        })
        return
      }
      if (queryKey === lastQueryKey && now - lastQueryAt < DUPLICATE_QUERY_WINDOW_MS) {
        logDebug('[useSearch] Skipping duplicate query (window):', {
          text: searchVal.value,
          inputs: inputs.length
        })
        return
      }
      lastQueryKey = queryKey
      lastQueryAt = now

      loading.value = true
      recommendationPending.value = true
      // Don't collapse immediately - wait for recommendation to load
      // This prevents the jarring collapse-then-expand animation

      const RECOMMENDATION_TIMEOUT_MS = 400
      recommendationTimeoutId = setTimeout(() => {
        if (recommendationPending.value && searchResults.value.length === 0) {
          resetSearchState()
        }
        recommendationTimeoutId = null
      }, RECOMMENDATION_TIMEOUT_MS)

      try {
        inFlightQueryKey = queryKey
        const query: TuffQuery = { text: '', inputs }
        inputTransport.broadcast({ input: query.text, query, source: 'renderer' })

        logDebug('[useSearch] Sending recommendation query:', {
          text: query.text,
          inputs: inputs.length
        })

        const requestStartedAt = performance.now()
        const initialResult: TuffSearchResult = await transport.send(CoreBoxEvents.search.query, {
          query
        })
        logDebug('[useSearch] Recommendation IPC duration:', {
          ms: Math.round(performance.now() - requestStartedAt),
          sessionId: initialResult?.sessionId
        })
        if (recommendationTimeoutId) {
          clearTimeout(recommendationTimeoutId)
          recommendationTimeoutId = null
        }
        if (inFlightQueryKey === queryKey) {
          inFlightQueryKey = null
        }

        if (currentSequence !== searchSequence) {
          recommendationPending.value = false
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
        if (recommendationTimeoutId) {
          clearTimeout(recommendationTimeoutId)
          recommendationTimeoutId = null
        }
        if (inFlightQueryKey === queryKey) {
          inFlightQueryKey = null
        }
        console.error('Recommendation search failed:', error)
        resetSearchState()
      }
      return
    }

    if (!searchVal.value) {
      const query: TuffQuery = {
        text: '',
        inputs
      }

      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })

      return
    }

    const now = Date.now()
    if (inFlightQueryKey === queryKey) {
      logDebug('[useSearch] Skipping duplicate in-flight query:', {
        text: searchVal.value,
        inputs: inputs.length
      })
      return
    }
    if (queryKey === lastQueryKey && now - lastQueryAt < DUPLICATE_QUERY_WINDOW_MS) {
      logDebug('[useSearch] Skipping duplicate query (window):', {
        text: searchVal.value,
        inputs: inputs.length
      })
      return
    }
    lastQueryKey = queryKey
    lastQueryAt = now

    boxOptions.focus = 0
    loading.value = true
    // Don't clear results immediately - this causes UI flicker
    // Results will be replaced when new search completes

    try {
      inFlightQueryKey = queryKey
      const query: TuffQuery = {
        text: searchVal.value,
        inputs
      }

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
      const initialResult: TuffSearchResult = await transport.send(CoreBoxEvents.search.query, {
        query
      })
      logDebug('[useSearch] Search IPC duration:', {
        ms: Math.round(performance.now() - requestStartedAt),
        sessionId: initialResult?.sessionId
      })
      if (inFlightQueryKey === queryKey) {
        inFlightQueryKey = null
      }

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
      const filteredItems = filterDetachedItems(initialResult.items)
      searchResult.value = isDetachedDivisionMode()
        ? { ...initialResult, items: filteredItems }
        : initialResult

      activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

      if (currentSearchId.value) {
        const pending = pendingSearchEndById.get(currentSearchId.value)
        if (pending) {
          pendingSearchEndById.delete(currentSearchId.value)
          applySearchEnd(pending)
        }
      }

      searchResults.value = filteredItems
      if (currentSearchId.value) {
        const pendingUpdates = pendingSearchUpdatesById.get(currentSearchId.value)
        if (pendingUpdates && pendingUpdates.length > 0) {
          pendingSearchUpdatesById.delete(currentSearchId.value)
          logDebug('[useSearch] Applying queued search updates:', {
            sessionId: currentSearchId.value,
            itemCount: pendingUpdates.length
          })
          searchResults.value = [...searchResults.value, ...pendingUpdates]
        }
      }
      logDebug('[useSearch] searchResults updated:', searchResults.value.length, 'items')

      boxOptions.layout = undefined
    } catch (error) {
      console.error('Search initiation failed:', error)
      if (inFlightQueryKey === queryKey) {
        inFlightQueryKey = null
      }
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined
      loading.value = false
    }
  }

  const debouncedSearch = useDebounceFn(executeSearch, BASE_DEBOUNCE)

  async function handleSearch(): Promise<void> {
    debouncedSearch()
  }

  async function handleSearchImmediate(): Promise<void> {
    const cancelable = debouncedSearch as unknown as { cancel?: () => void }
    cancelable.cancel?.()
    await executeSearch()
  }

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      return
    }

    const isPluginFeature =
      itemToExecute.kind === 'feature' && itemToExecute.source?.type === 'plugin'
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

      void transport.send(CoreBoxEvents.ui.hide).catch(() => {})
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
          console.error('Execute failed:', error)
        })
      return
    }

    if (!isPluginFeature && !keepCoreBoxOpen) {
      searchVal.value = ''
      await transport.send(CoreBoxEvents.ui.hide).catch(() => {})
    }

    if (isPluginFeature) {
      ensureBoxData(boxOptions).feature = itemToExecute
      boxOptions.mode = BoxMode.FEATURE

      const interaction = (itemToExecute.meta as { interaction?: unknown } | null | undefined)
        ?.interaction
      const allowInput = isRecord(interaction) && interaction.allowInput === true

      const acceptedInputTypes = (
        itemToExecute.meta as { extension?: Record<string, unknown> } | null | undefined
      )?.extension?.acceptedInputTypes
      const hasAcceptedInputTypes =
        Array.isArray(acceptedInputTypes) && acceptedInputTypes.length > 0
      const shouldShowInput = hasAcceptedInputTypes || allowInput

      activeActivations.value = [
        {
          id: 'plugin-features',
          meta: {
            pluginName: itemToExecute.meta?.pluginName,
            featureId: itemToExecute.meta?.featureId,
            feature: itemToExecute
          },
          hideResults: false,
          showInput: shouldShowInput
        }
      ]
    }

    searchResults.value = []

    const currentQueryText =
      typeof searchResult.value?.query?.text === 'string'
        ? searchResult.value.query.text
        : searchVal.value
    const currentInputs = buildQueryInputs({
      queryText: currentQueryText,
      allowPendingTextClipboard: isPluginFeature
    })
    const usedFileModeAttachment =
      boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length > 0
    const usedClipboardInput = currentInputs.length > 0 && !usedFileModeAttachment

    const serializedItem = JSON.parse(JSON.stringify(itemToExecute))
    const serializedSearchResult = searchResult.value
      ? JSON.parse(JSON.stringify(searchResult.value))
      : null

    if (isPluginFeature && serializedSearchResult?.query) {
      serializedSearchResult.query.inputs = currentInputs
    }

    loading.value = true

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
      const newActivationState = toActivations(
        activationState as ActivationState | IProviderActivate[] | null
      )
      activeActivations.value = newActivationState

      if (newActivationState && newActivationState.length > 0) {
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
      } else if (isPluginFeature && clipboardOptions && appSetting.tools.autoPaste.time === 0) {
        if (clipboardOptions.last?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
        } else if (clipboardOptions.pendingAutoFillItem?.timestamp) {
          clipboardOptions.lastClearedTimestamp = clipboardOptions.pendingAutoFillItem.timestamp
        }
        clipboardOptions.last = null
        clipboardOptions.pendingAutoFillItem = null
        clipboardOptions.detectedAt = null
      }
    } catch (error) {
      console.error('Execute failed:', error)
    } finally {
      loading.value = false

      if (shouldRestoreAfterExecute) {
        transport.send(CoreBoxEvents.ui.show).catch(() => {})
      }
    }

    select.value = -1

    await handleSearch()
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
      transport.send(CoreBoxEvents.ui.hide).catch(() => {})
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
    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND) {
      boxOptions.mode = newSearchVal.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
    }
  })

  watch(searchVal, (val) => {
    if (!val) {
      const cancelable = debouncedSearch as unknown as { cancel?: () => void }
      cancelable.cancel?.()
      void handleSearchImmediate()
      return
    }
    handleSearch()
  })

  const activeItem = computed(() => res.value[boxOptions.focus])

  const unregSearchUpdate = transport.on(CoreBoxEvents.search.update, (data) => {
    const filteredItems = filterDetachedItems(data.items ?? [])
    const itemCount = filteredItems.length
    if (!data.searchId) return
    if (!currentSearchId.value) {
      if (itemCount > 0) {
        const queued = pendingSearchUpdatesById.get(data.searchId) ?? []
        pendingSearchUpdatesById.set(data.searchId, [...queued, ...filteredItems])
        logDebug('[useSearch] Queued search update (no active session):', {
          sessionId: data.searchId,
          itemCount,
          queuedTotal: queued.length + itemCount
        })
      } else {
        logDebug('[useSearch] Ignoring empty search update (no active session):', {
          sessionId: data.searchId
        })
      }
      return
    }
    if (data.searchId !== currentSearchId.value) {
      logDebug('[useSearch] Ignoring search update (session mismatch):', {
        sessionId: data.searchId,
        currentSessionId: currentSearchId.value,
        itemCount
      })
      return
    }
    // Skip empty updates to avoid unnecessary re-renders
    if (filteredItems.length === 0) {
      logDebug('[useSearch] Ignoring empty search update:', { sessionId: data.searchId })
      return
    }
    logDebug('[useSearch] Applying search update:', {
      sessionId: data.searchId,
      itemCount,
      currentTotal: searchResults.value.length
    })
    searchResults.value = [...searchResults.value, ...filteredItems]
  })

  const unregSetQuery = transport.on(CoreBoxEvents.input.setQuery, ({ value }) => {
    const nextValue = typeof value === 'string' ? value : ''
    searchVal.value = nextValue
    window.dispatchEvent(new CustomEvent('corebox:focus-input'))
  })

  let coreBoxShownHandler: (() => void) | null = null

  onMounted(() => {
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
        if (!searchVal.value && !activeActivations.value?.length) {
          handleSearchImmediate()
        }
      }
      window.addEventListener('corebox:shown', coreBoxShownHandler)
    }
  })

  onBeforeUnmount(() => {
    unregSearchUpdate()
    unregSetQuery()
    unregSearchEnd()
    unregItemClear()
    unregNoResults()

    if (coreBoxShownHandler) {
      window.removeEventListener('corebox:shown', coreBoxShownHandler)
      coreBoxShownHandler = null
    }

    if (recommendationTimeoutId) {
      clearTimeout(recommendationTimeoutId)
      recommendationTimeoutId = null
    }
  })

  const unregSearchEnd = transport.on(CoreBoxEvents.search.end, (payload) => {
    if (!payload || typeof payload !== 'object') return
    if (!payload.searchId) return

    if (!currentSearchId.value) {
      pendingSearchEndById.set(payload.searchId, payload as SearchEndData)
      logDebug('[useSearch] Queued search end (no active session):', {
        sessionId: payload.searchId,
        cancelled: Boolean(payload.cancelled)
      })
      return
    }

    if (payload.searchId === currentSearchId.value) {
      const activateCount = Array.isArray(payload.activate) ? payload.activate.length : 0
      const sourceCount = Array.isArray(payload.sources) ? payload.sources.length : 0
      logDebug('[useSearch] Applying search end:', {
        sessionId: payload.searchId,
        cancelled: Boolean(payload.cancelled),
        activateCount,
        sourceCount
      })
      applySearchEnd(payload as SearchEndData)
      return
    }

    logDebug('[useSearch] Ignoring search end (session mismatch):', {
      sessionId: payload.searchId,
      currentSessionId: currentSearchId.value
    })
  })

  const applySearchEnd = (data: SearchEndData): void => {
    if (data.cancelled) {
      resetSearchState()
      activeActivations.value = null
      return
    }

    if (searchResult.value) {
      searchResult.value.activate = data.activate
      searchResult.value.sources = data.sources ?? []
    }
    activeActivations.value = data.activate || null
    loading.value = false
    recommendationPending.value = false
  }

  const unregItemClear = transport.on(CoreBoxEvents.item.clear, () => {
    resetSearchState()
  })

  const unregNoResults = transport.on(CoreBoxEvents.search.noResults, (payload) => {
    if (!payload || typeof payload !== 'object') return
    if (!payload.shouldShrink) return
    if (searchVal.value || activeActivations.value?.length) return

    recommendationPending.value = false
    loading.value = false

    if (res.value.length === 0) {
      transport.send(CoreBoxEvents.ui.expand, { mode: 'collapse' }).catch(() => {})
      return
    }

    window.dispatchEvent(new CustomEvent('corebox:layout-refresh'))
  })

  return {
    searchVal,
    select,
    res,
    loading,
    activeItem,
    activeActivations,
    handleExecute,
    handleExit,
    handleSearchImmediate,
    deactivateProvider,
    deactivateAllProviders
  }
}
