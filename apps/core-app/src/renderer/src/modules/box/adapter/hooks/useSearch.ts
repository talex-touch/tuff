import type {
  IProviderActivate,
  TuffItem,
  TuffQuery,
  TuffQueryInput,
  TuffSearchResult
} from '@talex-touch/utils'
import type { IBoxOptions } from '..'
import type { IUseSearch } from '../types'
import type { IClipboardOptions } from './types'
import { TuffInputType } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useBoxItems } from '~/modules/box/item-sdk'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { createCoreBoxInputTransport } from '../transport/input-transport'
import { BoxMode } from '..'
import { useResize } from './useResize'
import { isDivisionBoxMode, windowState } from '~/modules/hooks/core-box'

export function useSearch(
  boxOptions: IBoxOptions,
  clipboardOptions?: IClipboardOptions
): IUseSearch {
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
    console.debug('[useSearch] res computed:', {
      boxItemsCount: boxItems.value.length,
      searchResultsCount: searchResults.value.length,
      totalCount: result.length
    })
    return result
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const recommendationPending = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)

  const pendingSearchEndById = new Map<string, any>()

  const BASE_DEBOUNCE = 35
  const inputTransport = createCoreBoxInputTransport(touchChannel, BASE_DEBOUNCE)

  let searchSequence = 0

  const MAX_TEXT_INPUT_LENGTH = 2000
  const MAX_HTML_INPUT_LENGTH = 5000
  const MIN_TEXT_ATTACHMENT_LENGTH = 80

  function safeSerializeMetadata(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
    if (!meta) return undefined
    try {
      const safe: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(meta)) {
        if (value === null || value === undefined) continue
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          safe[key] = value
        }
      }
      return Object.keys(safe).length > 0 ? safe : undefined
    } catch {
      return undefined
    }
  }

  function truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content
    return content.slice(0, maxLength)
  }

  function buildQueryInputs(): TuffQueryInput[] {
    const inputs: TuffQueryInput[] = []

    if (clipboardOptions?.last?.type === 'image') {
      inputs.push({
        type: TuffInputType.Image,
        content: clipboardOptions.last.content,
        thumbnail: clipboardOptions.last.thumbnail ?? undefined,
        metadata: safeSerializeMetadata(clipboardOptions.last.meta)
      })
    } else if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length > 0) {
      inputs.push({
        type: TuffInputType.Files,
        content: JSON.stringify(boxOptions.file.paths),
        metadata: undefined
      })
    } else if (clipboardOptions?.last?.type === 'files') {
      inputs.push({
        type: TuffInputType.Files,
        content: clipboardOptions.last.content,
        metadata: safeSerializeMetadata(clipboardOptions.last.meta)
      })
    } else if (
      clipboardOptions?.last?.type === 'text' ||
      clipboardOptions?.last?.type === 'html'
    ) {
      const content = clipboardOptions.last.content ?? ''
      if (content.length >= MIN_TEXT_ATTACHMENT_LENGTH) {
        if (clipboardOptions.last.rawContent) {
          inputs.push({
            type: TuffInputType.Html,
            content: truncateContent(content, MAX_TEXT_INPUT_LENGTH),
            rawContent: truncateContent(clipboardOptions.last.rawContent, MAX_HTML_INPUT_LENGTH),
            metadata: safeSerializeMetadata(clipboardOptions.last.meta)
          })
        } else {
          inputs.push({
            type: TuffInputType.Text,
            content: truncateContent(content, MAX_TEXT_INPUT_LENGTH),
            metadata: safeSerializeMetadata(clipboardOptions.last.meta)
          })
        }
      }
    }

    return inputs
  }

  const collapseCoreBox = (): void => {
    touchChannel.sendSync('core-box:expand', { mode: 'collapse' })
  }

  const resetSearchState = (): void => {
    searchResults.value = []
    searchResult.value = null
    currentSearchId.value = null
    activeActivations.value = null
    boxOptions.layout = undefined
    loading.value = false
    recommendationPending.value = false
  }

  const broadcastDivisionBoxInput = (query: TuffQuery): void => {
    inputTransport.broadcast({
      input: query.text,
      query,
      source: 'renderer'
    })

    if (windowState.divisionBox?.sessionId) {
      touchChannel.send('division-box:input-change', {
        sessionId: windowState.divisionBox.sessionId,
        input: searchVal.value,
        query
      })
    }
  }

  const applyRecommendationResult = (initialResult: TuffSearchResult): void => {
    currentSearchId.value = initialResult.sessionId || null
    searchResult.value = initialResult
    searchResults.value = initialResult.items
    boxOptions.layout = initialResult.containerLayout

    activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

    if (currentSearchId.value) {
      const pending = pendingSearchEndById.get(currentSearchId.value)
      if (pending) {
        pendingSearchEndById.delete(currentSearchId.value)
        applySearchEnd(pending)
      }
    }

    if (!activeActivations.value && initialResult.items.length === 0) {
      collapseCoreBox()
    }
  }

  async function executeSearch(): Promise<void> {
    const currentSequence = ++searchSequence
    const inputs = buildQueryInputs()

    recommendationPending.value = false

    if (isDivisionBoxMode()) {
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
        collapseCoreBox()
        return
      }

      loading.value = true
      recommendationPending.value = true
      collapseCoreBox()

      const RECOMMENDATION_TIMEOUT_MS = 400
      const timeoutId = setTimeout(() => {
        if (recommendationPending.value && searchResults.value.length === 0) {
          resetSearchState()
          collapseCoreBox()
        }
      }, RECOMMENDATION_TIMEOUT_MS)

      try {
        const query: TuffQuery = { text: '', inputs }
        inputTransport.broadcast({ input: query.text, query, source: 'renderer' })

        const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })
        clearTimeout(timeoutId)

        if (currentSequence !== searchSequence) {
          recommendationPending.value = false
          return
        }

        applyRecommendationResult(initialResult)
        loading.value = false
        recommendationPending.value = false
      } catch (error) {
        clearTimeout(timeoutId)
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

    boxOptions.focus = 0
    loading.value = true
    searchResults.value = []

    try {
      const query: TuffQuery = {
        text: searchVal.value,
        inputs
      }

      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })

      const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

      console.debug('[useSearch] Search result received:', {
        sessionId: initialResult.sessionId,
        itemCount: initialResult.items?.length || 0,
        hasActivate: !!initialResult.activate,
        activateLength: initialResult.activate?.length || 0,
        query: query.text
      })

      if (currentSequence !== searchSequence) {
        console.debug('[useSearch] Discarding stale search result (sequence mismatch)')
        return
      }

      currentSearchId.value = initialResult.sessionId || null
      searchResult.value = initialResult

      activeActivations.value = initialResult.activate?.length ? initialResult.activate : null

      if (currentSearchId.value) {
        const pending = pendingSearchEndById.get(currentSearchId.value)
        if (pending) {
          pendingSearchEndById.delete(currentSearchId.value)
          applySearchEnd(pending)
        }
      }

      searchResults.value = initialResult.items
      console.debug('[useSearch] searchResults updated:', searchResults.value.length, 'items')

      boxOptions.layout = undefined

    } catch (error) {
      console.error('Search initiation failed:', error)
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
    await executeSearch()
  }

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      console.warn('[useSearch] handleExecute called without an item.')
      return
    }

    const isPluginFeature =
      itemToExecute.kind === 'feature' && itemToExecute.source?.type === 'plugin'
    const keepCoreBoxOpen =
      (itemToExecute.meta as any)?.keepCoreBoxOpen === true ||
      (itemToExecute.meta as any)?.intelligence?.keepCoreBoxOpen === true
    const shouldRestoreAfterExecute =
      isPluginFeature || !appSetting.tools.autoHide || keepCoreBoxOpen

    if (!isPluginFeature && !keepCoreBoxOpen) {
      searchVal.value = ''
      touchChannel.send('core-box:hide')
    }

    if (isPluginFeature) {
      boxOptions.data.feature = itemToExecute
      boxOptions.mode = BoxMode.FEATURE

      const featureMeta = itemToExecute.meta as any
      const interaction = featureMeta?.interaction
      const acceptedInputTypes = featureMeta?.extension?.acceptedInputTypes
      const hasAcceptedInputTypes = acceptedInputTypes && acceptedInputTypes.length > 0
      const allowInput = interaction?.allowInput === true
      const shouldShowInput = hasAcceptedInputTypes || allowInput

      activeActivations.value = [{
        id: 'plugin-features',
        meta: {
          pluginName: featureMeta?.pluginName,
          featureId: featureMeta?.featureId,
          feature: itemToExecute
        },
        hideResults: false,
        showInput: shouldShowInput
      }]
    }

    searchResults.value = []

    const serializedItem = JSON.parse(JSON.stringify(itemToExecute))
    const serializedSearchResult = searchResult.value
      ? JSON.parse(JSON.stringify(searchResult.value))
      : null

    if (isPluginFeature && serializedSearchResult?.query) {
      const currentInputs = buildQueryInputs()
      serializedSearchResult.query.inputs = currentInputs
    }

    loading.value = true

    try {
      const newActivationState: IProviderActivate[] | null = await touchChannel.send(
        'core-box:execute',
        serializedSearchResult
          ? {
              item: serializedItem,
              searchResult: serializedSearchResult
            }
          : {
              item: serializedItem
            }
      )

      activeActivations.value = newActivationState

      if (newActivationState && newActivationState.length > 0) {
        searchVal.value = ''
      }

      if (isPluginFeature && clipboardOptions && appSetting.tools.autoPaste.time === 0) {
        clipboardOptions.last = null
        clipboardOptions.detectedAt = null
      }
    } catch (error) {
      console.error('Execute failed:', error)
    } finally {
      loading.value = false

      if (shouldRestoreAfterExecute) {
        touchChannel.sendSync('core-box:show')
      }
    }

    select.value = -1
  }

  async function deactivateProvider(providerId?: string): Promise<boolean> {
    if (!providerId) {
      const newState = await touchChannel.send('core-box:deactivate-providers')
      activeActivations.value = newState
      searchVal.value = ''
      await handleSearch()
      return true
    }

    const newState = await touchChannel.send('core-box:deactivate-provider', { id: providerId })
    activeActivations.value = newState

    if (!newState || newState.length === 0) {
      searchVal.value = ''
    }

    await handleSearch()
    return true
  }

  async function deactivateAllProviders(): Promise<void> {
    const newState = await touchChannel.send('core-box:deactivate-providers')
    activeActivations.value = newState
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
        if (boxOptions.data?.pushedItemIds && boxOptions.data.pushedItemIds.size > 0) {
          const pushedIds = boxOptions.data.pushedItemIds

          searchResults.value = searchResults.value.filter((item: TuffItem) => {
            return (
              !item.meta?.extension?.pushedItemId ||
              !pushedIds.has(item.meta?.extension?.pushedItemId)
            )
          })
        }

        if (boxOptions.data?.plugin) {
          touchChannel.send('trigger-plugin-feature-exit', {
            plugin: boxOptions.data.plugin
          })
        }
        boxOptions.data.feature = undefined
      }

      boxOptions.mode = searchVal.value.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
      boxOptions.data = {}
    } else if (searchVal.value) {
      searchVal.value = ''
    } else {
      touchChannel.sendSync('core-box:hide')
    }
  }

  useResize({ results: res, activeActivations, loading, recommendationPending })

  watch(
    () => res.value,
    () => {
      if (res.value.length > 0 && boxOptions.focus === -1) {
        boxOptions.focus = 0
      }
    },
    { deep: true }
  )

  watch(searchVal, (newSearchVal) => {
    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND) {
      boxOptions.mode = newSearchVal.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
    }
  })

  watch(searchVal, (val) => {
    if (!val) {
      ;(debouncedSearch as any).cancel?.()
      void handleSearchImmediate()
      return
    }
    handleSearch()
  })

  const activeItem = computed(() => res.value[boxOptions.focus])

  touchChannel.regChannel('core-box:search-update', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      if (data.items && data.items.length > 0) {
        searchResults.value = [...searchResults.value, ...data.items]
      }
    }
  })

  touchChannel.regChannel('core-box:set-query', ({ data }) => {
    const value = typeof data?.value === 'string' ? data.value : ''
    searchVal.value = value
    window.dispatchEvent(new CustomEvent('corebox:focus-input'))
  })

  onMounted(() => {
    touchChannel.send('core-box:get-activated-providers').then((providers) => {
      activeActivations.value = providers ?? null
    })

    handleSearch()

    const handleCoreBoxShown = () => {
      if (!searchVal.value && !activeActivations.value?.length) {
        handleSearchImmediate()
      }
    }

    window.addEventListener('corebox:shown', handleCoreBoxShown)
  })

  touchChannel.regChannel('core-box:search-end', ({ data }) => {
    if (!data?.searchId) return

    if (!currentSearchId.value) {
      pendingSearchEndById.set(data.searchId, data)
      return
    }

    if (data.searchId === currentSearchId.value) {
      applySearchEnd(data)
      return
    }
  })

  const applySearchEnd = (data: any): void => {
    if (data.cancelled) {
      resetSearchState()
      activeActivations.value = null
      return
    }

    if (searchResult.value) {
      searchResult.value.activate = data.activate
      searchResult.value.sources = data.sources
    }
    activeActivations.value = data.activate || null
    loading.value = false
    recommendationPending.value = false
  }

  touchChannel.regChannel('core-box:clear-items', () => {
    resetSearchState()
  })

  touchChannel.regChannel('core-box:no-results', ({ data }) => {
    if (data?.shouldShrink) {
      collapseCoreBox()
    }
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
