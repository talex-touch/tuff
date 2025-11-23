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
import { computed, onMounted, ref, watch } from 'vue'
import { useBoxItems } from '~/modules/box/item-sdk'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

export function useSearch(
  boxOptions: IBoxOptions,
  clipboardOptions?: IClipboardOptions
): IUseSearch {
  const searchVal = ref('')
  const select = ref(-1)

  // 使用 BoxItemSDK 统一管理所有 items
  const { items: boxItems } = useBoxItems()

  // 本地搜索结果（来自搜索引擎）
  const searchResults = ref<Array<TuffItem>>([])

  // 合并搜索结果和 BoxItemSDK items

  // 合并搜索结果和 BoxItemSDK items
  // 优先显示搜索结果，然后是 BoxItemSDK 推送的 items
  const res = computed<Array<TuffItem>>(() => {
    // 使用 Map 去重，searchResults 优先级更高
    const itemsMap = new Map<string, TuffItem>()

    // 先添加 BoxItemSDK items
    boxItems.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    // 再添加搜索结果，覆盖同 id 的 items
    searchResults.value.forEach((item) => {
      itemsMap.set(item.id, item)
    })

    return Array.from(itemsMap.values())
  })

  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)

  const debounceMs = computed(() => {
    return activeActivations.value && activeActivations.value.length > 0 ? 350 : 100
  })

  const debouncedSearch = useDebounceFn(async () => {
    // Allow empty queries to trigger recommendation search
    if (!searchVal.value && !activeActivations.value?.length) {
      // Empty query with no active providers: trigger recommendation search
      boxOptions.focus = 0
      loading.value = true
      searchResults.value = [] // Clear previous results immediately

      try {
        const query: TuffQuery = {
          text: '',
          inputs: []
        }

        // The initial call now returns the high-priority results directly.
        const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

        // Store the session ID to track this specific search stream.
        currentSearchId.value = initialResult.sessionId || null
        searchResult.value = initialResult

        // Immediately display the recommendation items.
        searchResults.value = initialResult.items

        // The initial activation state is set here.
        if (initialResult.activate && initialResult.activate.length > 0) {
          activeActivations.value = initialResult.activate
        }
      } catch (error) {
        console.error('Recommendation search failed:', error)
        searchResults.value = []
        searchResult.value = null
        currentSearchId.value = null
        loading.value = false
      }
      return
    }

    if (!searchVal.value) {
      // Empty query with active providers: keep current state
      return
    }

    boxOptions.focus = 0
    loading.value = true
    searchResults.value = [] // Clear previous results immediately

    try {
      const query: TuffQuery = {
        text: searchVal.value,
        inputs: []
      }

      const inputs: TuffQueryInput[] = []

      // Priority-based input selection (matches TagSection display logic)
      // Priority 1: Image (clipboard image)
      // Priority 2: File (FILE mode or clipboard files)
      // Priority 3: Text (clipboard text/html)
      // Only one input should be added to match what's displayed in the tag

      /**
       * CRITICAL: Use clipboardOptions.last directly instead of re-fetching from main process
       * This ensures UI (TagSection) and data (TuffQuery) use the same source
       * Fixes Bug: Suffix tags not displayed but TuffQuery contains data
       */

      // Priority 1: Image (clipboard image)
      if (clipboardOptions?.last?.type === 'image') {
        inputs.push({
          type: TuffInputType.Image,
          content: clipboardOptions.last.content,
          thumbnail: clipboardOptions.last.thumbnail ?? undefined,
          metadata: clipboardOptions.last.meta ?? undefined
        })
      }
      // Priority 2: File (FILE mode or clipboard files)
      else if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length > 0) {
        inputs.push({
          type: TuffInputType.Files,
          content: JSON.stringify(boxOptions.file.paths),
          metadata: undefined
        })
      } else if (clipboardOptions?.last?.type === 'files') {
        inputs.push({
          type: TuffInputType.Files,
          content: clipboardOptions.last.content,
          metadata: clipboardOptions.last.meta ?? undefined
        })
      }
      // Priority 3: Text (clipboard text/html)
      else if (clipboardOptions?.last?.type === 'text' || clipboardOptions?.last?.type === 'html') {
        if (clipboardOptions.last.rawContent) {
          // Rich text: preserve both plain text and HTML
          inputs.push({
            type: TuffInputType.Html,
            content: clipboardOptions.last.content, // Plain text version
            rawContent: clipboardOptions.last.rawContent, // HTML version
            metadata: clipboardOptions.last.meta ?? undefined
          })
        } else {
          // Plain text: text only
          inputs.push({
            type: TuffInputType.Text,
            content: clipboardOptions.last.content,
            metadata: clipboardOptions.last.meta ?? undefined
          })
        }
      }

      // Only add inputs if we have one (matches what's displayed in tag)
      if (inputs.length > 0) {
        query.inputs = inputs
      }

      // The initial call now returns the high-priority results directly.
      const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

      // Store the session ID to track this specific search stream.
      currentSearchId.value = initialResult.sessionId || null
      searchResult.value = initialResult

      // Immediately display the high-priority items.
      searchResults.value = initialResult.items

      // The initial activation state is set here.
      if (initialResult.activate && initialResult.activate.length > 0) {
        activeActivations.value = initialResult.activate
      }
      // Removed else block to prevent premature clearing of activeActivations
      // Subsequent items will arrive via `search-update` events.
      // The loading state will be managed by `search-end`.
    } catch (error) {
      console.error('Search initiation failed:', error)
      searchResults.value = []
      searchResult.value = null
      currentSearchId.value = null
      loading.value = false
    }
    // Do not set loading to false here; wait for the `search-end` event.
  }, debounceMs)

  async function handleSearch(): Promise<void> {
    debouncedSearch()
  }

  /**
   * Force immediate search without debounce
   * Used when clipboard state changes
   */
  async function handleSearchImmediate(): Promise<void> {
    if (!searchVal.value) {
      if (!activeActivations.value?.length) {
        searchResults.value.length = 0
      }
      return
    }
    // Call the debounced search immediately by flushing
    debouncedSearch()
    // @ts-ignore - flush method exists on debounced function from lodash-es
    if (debouncedSearch.flush) {
      // @ts-ignore - flush method exists on debounced function from lodash-es
      debouncedSearch.flush()
    }
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

    // Auto-detect clipboard when triggering plugin feature
    // Only if clipboard hasn't been cleared by user (ESC key)
    if (isPluginFeature && serializedSearchResult?.query && clipboardOptions?.last) {
      try {
        const clipboardData = touchChannel.sendSync('clipboard:get-latest')

        if (clipboardData && clipboardData.type) {
          const inputs: unknown[] = serializedSearchResult.query.inputs || []

          // Convert clipboard data to TuffQueryInput format
          if (clipboardData.type === 'image') {
            inputs.push({
              type: TuffInputType.Image,
              content: clipboardData.content,
              thumbnail: clipboardData.thumbnail,
              metadata: clipboardData.meta ?? undefined
            })
          } else if (clipboardData.type === 'files') {
            inputs.push({
              type: TuffInputType.Files,
              content: clipboardData.content, // Already JSON serialized
              metadata: clipboardData.meta ?? undefined
            })
          } else if (clipboardData.type === 'text' && clipboardData.rawContent) {
            // Has HTML content
            inputs.push({
              type: TuffInputType.Html,
              content: clipboardData.content,
              rawContent: clipboardData.rawContent,
              metadata: clipboardData.meta ?? undefined
            })
          }

          if (inputs.length > 0) {
            serializedSearchResult.query.inputs = inputs
          }
        }
      } catch (error) {
        console.debug('[useSearch] Failed to auto-detect clipboard:', error)
        // Continue execution even if clipboard detection fails
      }
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

      if (!newActivationState || newActivationState.length === 0) {
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

  async function deactivateProvider(providerId?: string): Promise<boolean> {
    if (!providerId) {
      // Deactivate all if no ID is provided
      const newState = await touchChannel.send('core-box:deactivate-providers')
      activeActivations.value = newState
      await handleSearch()
      return true
    }

    const newState = await touchChannel.send('core-box:deactivate-provider', { id: providerId })
    activeActivations.value = newState
    await handleSearch()
    return true
  }

  async function deactivateAllProviders(): Promise<void> {
    const newState = await touchChannel.send('core-box:deactivate-providers')
    activeActivations.value = newState
    await handleSearch()
  }

  function handleExit(): void {
    if (activeActivations.value && activeActivations.value.length > 0) {
      console.log(
        '[useSearch] handleExit: activeActivations exist, calling deactivateAllProviders.'
      )
      deactivateAllProviders()
      searchVal.value = '' // Clear search value to reset state
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

  const debouncedResize = useDebounceFn(() => {
    touchChannel.sendSync('core-box:expand', {
      mode: res.value.length > 0 ? 'max' : 'collapse'
    })
  }, 10)

  watch(
    () => res.value,
    () => {
      if (res.value.length > 0 && boxOptions.focus === -1) {
        boxOptions.focus = 0
      }
      debouncedResize()
    },
    { deep: true }
  )

  watch(searchVal, (newSearchVal) => {
    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND) {
      boxOptions.mode = newSearchVal.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
    }
    // If the input is cleared, also clear active providers to allow recommendations
    if (newSearchVal === '' && activeActivations.value && activeActivations.value.length > 0) {
      activeActivations.value = null
      searchResults.value = []
      // handleSearch will be triggered by the watch below and show recommendations
    }
  })

  // 2. Watch for searchVal or mode changes to trigger the search
  watch([searchVal], handleSearch)

  // 3. Watch for searchVal changes to broadcast to plugins (debounced for performance)
  const debouncedInputBroadcast = useDebounceFn((newVal: string) => {
    // 广播输入变化到主进程，主进程会转发给插件
    touchChannel.send('core-box:input-changed', { input: newVal }).catch((error) => {
      console.error('[useSearch] Failed to broadcast input change:', error)
    })
  }, 150) // 150ms 防抖，避免频繁广播

  watch(searchVal, (newVal) => {
    debouncedInputBroadcast(newVal)
  })

  const activeItem = computed(() => res.value[boxOptions.focus])

  // Listener for incremental search result updates.
  touchChannel.regChannel('core-box:search-update', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      // console.log('[useSearch] Received subsequent item batch:', data.items.length)
      // Subsequent batches are already sorted and should be appended.
      searchResults.value.push(...data.items)
    } else {
      // console.log('[useSearch] Discarded update for old search:', data.searchId)
    }
  })

  // ⚠️ 已废弃：intelligence:upsert-item 监听器
  // 现在所有 AI items 都通过 BoxItemSDK 统一管理
  // Intelligence Provider 使用 boxItemManager.upsert() 推送
  // 渲染层的 useBoxItems 会自动处理这些 items
  /*
  touchChannel.regChannel('core-box:intelligence:upsert-item', ({ data }) => {
    ... 旧逻辑已移除 ...
  })
  */

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
        loading.value = false
        // Don't update activeActivations or other states - keep the current results
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
    deactivateProvider
  }
}
