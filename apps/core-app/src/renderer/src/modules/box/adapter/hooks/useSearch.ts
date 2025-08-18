import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode, IBoxOptions } from '..'
import { IProviderActivate, TuffItem, TuffSearchResult } from '@talex-touch/utils'
import { IActivatedProvider, IUseSearch } from '../types'

export function useSearch(boxOptions: IBoxOptions): IUseSearch {
  const searchVal = ref('')
  const select = ref(-1)
  const res = ref<Array<TuffItem>>([])
  const searchResult = ref<TuffSearchResult | null>(null)
  const loading = ref(false)
  const activatedProviders = ref<IActivatedProvider[]>([])
  const activeActivations = ref<IProviderActivate[] | null>(null)
  const currentSearchId = ref<string | null>(null)

  const debouncedSearch = useDebounceFn(async () => {
    loading.value = true
    res.value = [] // Clear previous results immediately

    try {
      const query = {
        text: searchVal.value,
        mode: boxOptions.mode
      }
      console.log('search with context', query)

      // The initial call now returns a result with a session ID but likely empty items.
      const initialResult: TuffSearchResult = await touchChannel.send('core-box:query', { query })

      // Store the session ID to track this specific search stream.
      currentSearchId.value = initialResult.sessionId || null
      searchResult.value = initialResult

      // The initial activation state is set here.
      if (initialResult.activate && initialResult.activate.length > 0) {
        activeActivations.value = initialResult.activate
      } else {
        if (activeActivations.value) {
          activeActivations.value = null
        }
      }

      // Items will arrive via `search-update` events.
      // The loading state will be managed by `search-end`.
    } catch (error) {
      console.error('Search initiation failed:', error)
      res.value = []
      searchResult.value = null
      currentSearchId.value = null
      loading.value = false
    }
    // Do not set loading to false here; wait for the `search-end` event.
  }, 100)

  async function handleSearch(): Promise<void> {
    boxOptions.focus = 0
    debouncedSearch()
  }

  async function handleExecute(item?: TuffItem): Promise<void> {
    const itemToExecute = item || activeItem.value
    if (!itemToExecute) {
      console.warn('[useSearch] handleExecute called without an item.')
      return
    }

    // When a feature is executed, clear the current list immediately.
    if (itemToExecute.source.id === 'plugin-features') {
      res.value = []
    }
    if (!searchResult.value) {
      console.warn('[useSearch] handleExecute called without a searchResult context.')
      // Fallback for safety, though it won't be tracked
      await touchChannel.send('core-box:execute', {
        item: JSON.parse(JSON.stringify(itemToExecute))
      })
      return
    }

    loading.value = true
    try {
      const newActivationState: IProviderActivate[] | null = await touchChannel.send(
        'core-box:execute',
        {
          item: JSON.parse(JSON.stringify(itemToExecute)),
          searchResult: JSON.parse(JSON.stringify(searchResult.value))
        }
      )

      // Sync the frontend state with the new activation state from the backend.
      activeActivations.value = newActivationState

      // Only clear the search value if the execution did not result in an activation.
      if (!newActivationState || newActivationState.length === 0) {
        searchVal.value = ''
      }
    } catch (error) {
      console.error('Execute failed:', error)
    } finally {
      loading.value = false
    }

    select.value = -1
  }

  async function deactivateProvider(providerId?: string): Promise<void> {
    if (!providerId) {
      // Deactivate all if no ID is provided
      const newState = await touchChannel.send('core-box:deactivate-providers')
      activeActivations.value = newState
      return
    }

    const newState = await touchChannel.send('core-box:deactivate-provider', { id: providerId })
    activeActivations.value = newState
  }

  async function deactivateAllProviders(): Promise<void> {
    const newState = await touchChannel.send('core-box:deactivate-providers')
    activeActivations.value = newState
  }

  function handleExit(): void {
    if (activeActivations.value && activeActivations.value.length > 0) {
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
      }

      boxOptions.mode = searchVal.value.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
      boxOptions.data = {}
    } else if (searchVal.value) {
      searchVal.value = ''
    } else {
      touchChannel.sendSync('core-box:hide')
    }
  }

  const debouncedExpand = useDebounceFn(() => {
    touchChannel.sendSync('core-box:expand', res.value.length)
  }, 50)

  watch(
    () => res.value?.length,
    () => debouncedExpand(),
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

  // Create a computed property that generates a stable, unique key representing the activation state.
  const activationKey = computed(() => {
    if (!activeActivations.value || activeActivations.value.length === 0) {
      return ''
    }
    return activeActivations.value
      .map((a) => {
        if (a.id === 'plugin-features' && a.meta?.pluginName) {
          return `${a.id}:${a.meta.pluginName}`
        }
        return a.id
      })
      .sort()
      .join(',')
  })

  // Watch the computed key instead of the raw array. This prevents the watcher
  // from firing when the array object changes but its content does not.
  watch(
    activationKey,
    async (newKey) => {
      if (!newKey) {
        activatedProviders.value = []
        return
      }

      // We still use the original activeActivations.value to get the data
      const currentActivations = activeActivations.value || []
      const providerIdsToFetch: string[] = []
      const constructedPluginProviders: IActivatedProvider[] = []

      currentActivations.forEach((activation) => {
        if (activation.id === 'plugin-features' && activation.meta?.pluginName) {
          constructedPluginProviders.push({
            uniqueId: `${activation.id}:${activation.meta.pluginName}`,
            name: activation.meta.pluginName,
            icon: activation.meta.pluginIcon
          })
        } else {
          providerIdsToFetch.push(activation.id)
        }
      })

      let fetchedProviderDetails: IActivatedProvider[] = []
      if (providerIdsToFetch.length > 0) {
        const details: { id: string; name: string; icon: any }[] =
          (await touchChannel.send('core-box:get-provider-details', {
            providerIds: providerIdsToFetch
          })) || []

        fetchedProviderDetails = details.map((d) => ({
          uniqueId: d.id,
          name: d.name,
          icon: d.icon
        }))
      }

      activatedProviders.value = [...constructedPluginProviders, ...fetchedProviderDetails]
    },
    { immediate: true }
  )

  const activeItem = computed(() => res.value[boxOptions.focus])

  // Listener for incremental search result updates.
  touchChannel.regChannel('core-box:search-update', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      console.log('[useSearch] Received item update:', data.items)
      res.value.push(...data.items)
    } else {
      console.log('[useSearch] Discarded update for old search:', data.searchId)
    }
  })

  // Listener for when the search stream is finished.
  touchChannel.regChannel('core-box:search-end', ({ data }) => {
    if (data.searchId === currentSearchId.value) {
      console.log('[useSearch] Search stream ended:', data.searchId)
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
    // If a provider is active but the user has cleared the input, ignore incoming pushes.
    if (activeActivations.value && activeActivations.value.length > 0 && searchVal.value === '') {
      console.log(
        '[useSearch] Ignored pushed items because the query is empty while a provider is active.'
      )
      return
    }

    console.log(`[useSearch] Received ${data.items.length} items pushed from plugin.`)
    // When a plugin pushes items, it becomes the new source of truth for results.
    res.value = data.items
    // Pushed items are outside the standard search flow, so we clear the searchResult context.
    searchResult.value = null
    loading.value = false
  })

  // Listener for a plugin requesting to clear all items.
  touchChannel.regChannel('core-box:clear-items', () => {
    console.log('[useSearch] Received request to clear items from a plugin.')
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
    activatedProviders,
    handleSearch,
    handleExecute,
    handleExit,
    deactivateProvider
  }
}
