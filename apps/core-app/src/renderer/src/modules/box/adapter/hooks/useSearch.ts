import { ref, watch, computed, onMounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode, IBoxOptions } from '..'
import { IProviderActivate, TuffItem, TuffSearchResult } from '@talex-touch/utils'
import { IUseSearch } from '../types'
import { appSetting } from '~/modules/channel/storage'

export function useSearch(boxOptions: IBoxOptions): IUseSearch {
  const searchVal = ref('')
  const select = ref(-1)
  const res = ref<Array<TuffItem>>([])
  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)

  const debounceMs = computed(() => {
    return activeActivations.value && activeActivations.value.length > 0 ? 350 : 100
  })

  const debouncedSearch = useDebounceFn(async () => {
    if (!searchVal.value) {
      if (!activeActivations.value?.length) {
        res.value.length = 0
      }
      return
    }
    boxOptions.focus = 0
    loading.value = true
    res.value = [] // Clear previous results immediately

    try {
      const query = {
        text: searchVal.value,
        mode: boxOptions.mode
      }
      // The initial call now returns the high-priority results directly.
      const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

      // Store the session ID to track this specific search stream.
      currentSearchId.value = initialResult.sessionId || null
      searchResult.value = initialResult

      // Immediately display the high-priority items.
      res.value = initialResult.items

      // The initial activation state is set here.
      if (initialResult.activate && initialResult.activate.length > 0) {
        activeActivations.value = initialResult.activate
      }
      // Removed else block to prevent premature clearing of activeActivations
      // Subsequent items will arrive via `search-update` events.
      // The loading state will be managed by `search-end`.
    } catch (error) {
      console.error('Search initiation failed:', error)
      res.value = []
      searchResult.value = null
      currentSearchId.value = null
      loading.value = false
    }
    // Do not set loading to false here; wait for the `search-end` event.
  }, debounceMs)

  async function handleSearch(): Promise<void> {
    debouncedSearch()
  }

  async function cancelSearch(): Promise<void> {
    if (!loading.value || !currentSearchId.value) return

    try {
      // Send cancellation request to main process
      await touchChannel.send('core-box:cancel-search', { searchId: currentSearchId.value })

      // Update UI state to reflect cancellation
      loading.value = false
      if (res.value.length === 0) {
        // If no results yet, reset search state entirely
        searchResult.value = null
        currentSearchId.value = null
      }
    } catch (error) {
      console.error('Failed to cancel search:', error)
    }
  }

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      console.warn('[useSearch] handleExecute called without an item.')
      return
    }

    const shouldRestoreAfterExecute = !appSetting.tools.autoHide

    touchChannel.sendSync('core-box:hide')

    if (itemToExecute.kind === 'feature') {
      boxOptions.data.feature = itemToExecute
      boxOptions.mode = BoxMode.FEATURE
    }

    res.value = []

    const serializedItem = JSON.parse(JSON.stringify(itemToExecute))
    const serializedSearchResult = searchResult.value
      ? JSON.parse(JSON.stringify(searchResult.value))
      : null

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

  async function deactivateProvider(providerId?: string): Promise<void> {
    if (!providerId) {
      // Deactivate all if no ID is provided
      const newState = await touchChannel.send('core-box:deactivate-providers')
      activeActivations.value = newState
      await handleSearch()
      return
    }

    const newState = await touchChannel.send('core-box:deactivate-provider', { id: providerId })
    activeActivations.value = newState
    await handleSearch()
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

          res.value = res.value.filter((item: TuffItem) => {
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
    // If the input is cleared while a provider is active, also clear the results.
    if (newSearchVal === '' && activeActivations.value && activeActivations.value.length > 0) {
      res.value = []
    }
  })

  // 2. Watch for searchVal or mode changes to trigger the search
  watch([searchVal], handleSearch)

  const activeItem = computed(() => res.value[boxOptions.focus])

  // Listener for incremental search result updates.
  touchChannel.regChannel('core-box:search-update', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      // console.log('[useSearch] Received subsequent item batch:', data.items.length)
      // Subsequent batches are already sorted and should be appended.
      res.value.push(...data.items)
    } else {
      // console.log('[useSearch] Discarded update for old search:', data.searchId)
    }
  })

  onMounted(() => {
    touchChannel.send('core-box:get-activated-providers').then((providers) => {
      if (providers) {
        activeActivations.value = providers
      }
    })
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

  // Listener for items pushed directly from an activated plugin feature.
  touchChannel.regChannel('core-box:push-items', ({ data }) => {
    // If a provider is active, allow incoming pushes regardless of searchVal.
    // This ensures plugins can display items even when the user has cleared the input
    // but the plugin is still active and pushing results.
    if (activeActivations.value && activeActivations.value.length > 0) {
      //
    } else if (searchVal.value === '') {
      // If no provider is active and searchVal is empty, ignore pushed items.
      return
    }

    //

    // Use a Map to ensure uniqueness and efficient updates.
    const itemsMap = new Map(res.value.map((item) => [item.id, item]))
    data.items.forEach((item: TuffItem) => {
      itemsMap.set(item.id, item)
    })

    // Assign the updated list back to the reactive ref.
    res.value = Array.from(itemsMap.values())
    loading.value = false
  })

  // Listener for a plugin requesting to clear all items.
  touchChannel.regChannel('core-box:clear-items', () => {
    res.value = []
    searchResult.value = null
    loading.value = false
  })

  return {
    searchVal,
    select,
    res,
    loading,
    activeItem,
    activeActivations,
    handleSearch,
    handleExecute,
    handleExit,
    deactivateProvider,
    deactivateAllProviders,
    cancelSearch
  }
}
