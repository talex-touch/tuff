import type {
  IProviderActivate,
  SearchPriorityLayer,
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

  // Use shallowRef for better performance - avoid deep reactivity on large arrays
  const searchResults = shallowRef<Array<TuffItem>>([])

  const res = computed<Array<TuffItem>>(() => {
    const itemsMap = new Map<string, TuffItem>()

    boxItems.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    searchResults.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    return Array.from(itemsMap.values())
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)

  const BASE_DEBOUNCE = 35
  const MAX_DEBOUNCE = 150
  const inputTransport = createCoreBoxInputTransport(touchChannel, BASE_DEBOUNCE)
  
  // Track previous input for dynamic debounce calculation
  let prevSearchVal = ''
  let lastInputTime = 0
  
  /**
   * Calculate dynamic debounce time based on input pattern
   */
  function calculateDebounceMs(input: string): number {
    const now = Date.now()
    const timeSinceLastInput = now - lastInputTime
    lastInputTime = now
    
    // If provider is activated, use longer debounce
    if (activeActivations.value && activeActivations.value.length > 0) {
      return 100
    }
    
    // Fast consecutive typing detection (< 100ms between keystrokes)
    if (timeSinceLastInput < 100 && input.startsWith(prevSearchVal) && input.length === prevSearchVal.length + 1) {
      // User is typing fast, increase debounce to avoid excessive searches
      return Math.min(BASE_DEBOUNCE * 2, MAX_DEBOUNCE)
    }
    
    // Paste detection (multiple characters added at once)
    if (input.length - prevSearchVal.length > 3) {
      return BASE_DEBOUNCE // Execute quickly for paste
    }
    
    // Delete operation
    if (input.length < prevSearchVal.length) {
      return Math.round(BASE_DEBOUNCE * 1.5) // Slightly delay on delete
    }
    
    prevSearchVal = input
    return BASE_DEBOUNCE
  }
  
  const debounceMs = computed(() => {
    return calculateDebounceMs(searchVal.value)
  })

  let searchSequence = 0

  const MAX_TEXT_INPUT_LENGTH = 2000
  const MAX_HTML_INPUT_LENGTH = 5000

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
      if (clipboardOptions.last.rawContent) {
        inputs.push({
          type: TuffInputType.Html,
          content: truncateContent(clipboardOptions.last.content, MAX_TEXT_INPUT_LENGTH),
          rawContent: truncateContent(clipboardOptions.last.rawContent, MAX_HTML_INPUT_LENGTH),
          metadata: safeSerializeMetadata(clipboardOptions.last.meta)
        })
      } else {
        inputs.push({
          type: TuffInputType.Text,
          content: truncateContent(clipboardOptions.last.content, MAX_TEXT_INPUT_LENGTH),
          metadata: safeSerializeMetadata(clipboardOptions.last.meta)
        })
      }
    }

    return inputs
  }

  const debouncedSearch = useDebounceFn(async () => {
    const currentSequence = ++searchSequence
    const inputs = buildQueryInputs()

    // In DivisionBox mode, only broadcast input changes - no search
    if (isDivisionBoxMode()) {
      const query: TuffQuery = {
        text: searchVal.value,
        inputs
      }
      
      // Broadcast input to plugin UI via IPC
      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })
      
      // Also send via main channel to plugin
      if (windowState.divisionBox?.sessionId) {
        touchChannel.send('division-box:input-change', {
          sessionId: windowState.divisionBox.sessionId,
          input: searchVal.value,
          query
        })
      }
      
      return
    }

    // Empty text query (with or without inputs): show recommendations or input-aware results
    if (!searchVal.value && !activeActivations.value?.length) {
      boxOptions.focus = 0
      loading.value = true
      searchResults.value = []

      try {
        const query: TuffQuery = {
          text: '',
          inputs
        }

        inputTransport.broadcast({
          input: query.text,
          query,
          source: 'renderer'
        })

        const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

        if (currentSequence !== searchSequence) {
          return
        }

        currentSearchId.value = initialResult.sessionId || null
        searchResult.value = initialResult
        searchResults.value = initialResult.items
        boxOptions.layout = initialResult.containerLayout

        if (initialResult.activate && initialResult.activate.length > 0) {
          activeActivations.value = initialResult.activate
        }

        loading.value = false
      } catch (error) {
        console.error('Recommendation search failed:', error)
        searchResults.value = []
        searchResult.value = null
        currentSearchId.value = null
        boxOptions.layout = undefined
        loading.value = false
      }
      return
    }

    if (!searchVal.value) {
      // Empty query with active providers: still notify plugins/UI about clear
      const query: TuffQuery = {
        text: '',
        inputs
      }

      inputTransport.broadcast({
        input: query.text,
        query,
        source: 'renderer'
      })

      // Keep current search state; no new search request
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

      // The initial call now returns the high-priority results directly.
      const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

      // Validate sequence: only process if this is still the latest search
      if (currentSequence !== searchSequence) {
        return // Discard outdated results
      }

      // Store the session ID to track this specific search stream.
      currentSearchId.value = initialResult.sessionId || null
      searchResult.value = initialResult

      // Immediately display the high-priority items.
      searchResults.value = initialResult.items

      // 搜索结果使用 list 模式（清除 grid 布局）
      boxOptions.layout = undefined

      // The initial activation state is set here.
      if (initialResult.activate && initialResult.activate.length > 0) {
        activeActivations.value = initialResult.activate
      }
    } catch (error) {
      console.error('Search initiation failed:', error)
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      boxOptions.layout = undefined
      loading.value = false
    }
    // Do not set loading to false here; wait for the `search-end` event.
  }, debounceMs)

  /**
   * Trigger debounced search
   */
  async function handleSearch(): Promise<void> {
    debouncedSearch()
  }

  /**
   * Force immediate search without debounce
   * Used when clipboard state changes or immediate update is needed
   */
  async function handleSearchImmediate(): Promise<void> {
    // Always trigger search - even with empty input, clipboard content should be searched
    debouncedSearch()
    // @ts-ignore - flush method exists on debounced function from lodash-es
    if (debouncedSearch.flush) {
      // @ts-ignore - flush method exists on debounced function from lodash-es
      debouncedSearch.flush()
    }
  }

  /**
   * Execute a search result item
   * @param item - Item to execute, defaults to currently focused item
   */
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
      touchChannel.sendSync('core-box:hide')
    }

    if (isPluginFeature) {
      boxOptions.data.feature = itemToExecute
      boxOptions.mode = BoxMode.FEATURE
    }

    searchResults.value = []

    const serializedItem = JSON.parse(JSON.stringify(itemToExecute))
    const serializedSearchResult = searchResult.value
      ? JSON.parse(JSON.stringify(searchResult.value))
      : null

    // IMPORTANT: Always use current clipboard state from UI (clipboardOptions.last)
    // This ensures consistency between what's shown in TagSection and what's passed to plugins
    // Don't re-fetch from main process - use buildQueryInputs() as the single source of truth
    if (isPluginFeature && serializedSearchResult?.query) {
      // Get current clipboard inputs from UI state
      const currentInputs = buildQueryInputs()
      
      // Replace the cached inputs with current state
      // This ensures cleared clipboard (ESC) is respected
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

      // 进入 provider 时清空 query，让插件从空白状态开始
      // 启动应用后也清空输入框
      if ((newActivationState && newActivationState.length > 0) || !isPluginFeature) {
        searchVal.value = ''
      }

      // Clear clipboard after execute if time === 0
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

  /**
   * Deactivate provider(s) and trigger new search
   * @param providerId - Specific provider ID to deactivate, or deactivate all if undefined
   * @returns True if successfully deactivated
   */
  async function deactivateProvider(providerId?: string): Promise<boolean> {
    if (!providerId) {
      // Deactivate all if no ID is provided
      const newState = await touchChannel.send('core-box:deactivate-providers')
      activeActivations.value = newState
      searchVal.value = '' // Clear search input to clear item list
      await handleSearch()
      return true
    }

    const newState = await touchChannel.send('core-box:deactivate-provider', { id: providerId })
    activeActivations.value = newState

    // If all providers are deactivated, clear search input
    if (!newState || newState.length === 0) {
      searchVal.value = ''
    }

    await handleSearch()
    return true
  }

  /**
   * Deactivate all active providers
   * This MUST be async to ensure backend provider deactivation completes
   * before updating the UI state. Calling this synchronously could cause
   * race conditions where the UI believes providers are deactivated but
   * they're still active in the backend.
   *
   * @async
   * @returns Promise that resolves when all providers are deactivated
   */
  async function deactivateAllProviders(): Promise<void> {
    const newState = await touchChannel.send('core-box:deactivate-providers')
    activeActivations.value = newState
    searchVal.value = '' // Clear search input to clear item list
    await handleSearch()
  }

  /**
   * Handle exit operations in strict sequential order.
   * This is an ASYNC function to ensure provider deactivation completes
   * before proceeding, preventing race conditions.
   *
   * Exit sequence:
   * 1. Deactivate active providers (if any) and return
   * 2. Handle mode transitions (FEATURE → INPUT)
   * 3. Clear search input (if any)
   * 4. Hide CoreBox window (final step)
   *
   * @async
   * @returns Promise that resolves when exit handling is complete
   */
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

  useResize({ results: res, activeActivations, loading })

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

  // 2. Watch for searchVal or mode changes to trigger the search
  watch([searchVal], handleSearch)

  const activeItem = computed(() => res.value[boxOptions.focus])

  // Listener for incremental search result updates.
  touchChannel.regChannel('core-box:search-update', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      const layer: SearchPriorityLayer | undefined = data.layer
      
      // For deferred layer results, append to existing results
      // For fast layer, results are already set in initial response
      if (data.items && data.items.length > 0) {
        // Use spread to trigger shallowRef reactivity
        searchResults.value = [...searchResults.value, ...data.items]
        
        // Log layer info for debugging performance
        if (layer) {
          console.debug(`[useSearch] ${layer} layer: +${data.items.length} items`)
        }
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
      if (providers) {
        activeActivations.value = providers
      }
    })

    // Trigger initial search to show recommendations when CoreBox opens
    handleSearch()
  })

  // Listener for when the search stream is finished.
  touchChannel.regChannel('core-box:search-end', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      if (data.cancelled) {
        console.log('[useSearch] Search was cancelled')
        searchResults.value = []
        searchResult.value = null
        activeActivations.value = null
        currentSearchId.value = null
        loading.value = false
        return
      }

      if (searchResult.value) {
        searchResult.value.activate = data.activate
        searchResult.value.sources = data.sources
      }
      activeActivations.value = data.activate || null
      loading.value = false
    }
  })

  // ⚠️ 已废弃：push-items 监听器
  // 现在所有插件推送都通过 BoxItemSDK 统一管理
  // Plugin SDK 的 boxItems.push() 使用 boxItemManager.upsert()
  // 渲染层的 useBoxItems 会自动处理这些 items
  /*
  touchChannel.regChannel('core-box:push-items', ({ data }) => {
    ... 旧逻辑已移除 ...
  })
  */

  // Listener for a plugin requesting to clear all items.
  touchChannel.regChannel('core-box:clear-items', () => {
    searchResults.value = []
    searchResult.value = null
    loading.value = false
  })

  return {
    searchVal,
    select,
    res, // computed - 合并 searchResults 和 boxItems
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
