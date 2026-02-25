import type { StorePlugin, StoreProviderResultMeta } from '@talex-touch/utils/store'
import { ref, watch } from 'vue'
import { fetchStoreCatalog } from '~/modules/store/store-data-service'
import { storeSourcesStorage } from '~/modules/storage/store-sources'

export type StorePluginListItem = StorePlugin

export function useStoreData() {
  const plugins = ref<StorePlugin[]>([])
  const stats = ref<StoreProviderResultMeta[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const lastUpdated = ref<number | null>(null)

  async function loadStorePlugins(force = false): Promise<void> {
    if (loading.value) {
      return
    }

    loading.value = true
    errorMessage.value = ''

    try {
      const definitions = storeSourcesStorage
        .getSources()
        .filter((source) => source.enabled !== false)
      const result = await fetchStoreCatalog({
        definitions,
        force
      })

      plugins.value = result.plugins
      stats.value = result.stats
      lastUpdated.value = Date.now()
    } catch (error: unknown) {
      console.error('[Store] Failed to load plugins:', error)
      const reason = error instanceof Error ? error.message : ''
      errorMessage.value = reason || 'store.error.loadFailed'
    } finally {
      loading.value = false
    }
  }

  watch(
    () => storeSourcesStorage.get().sources,
    () => {
      void loadStorePlugins(true)
    },
    { deep: true }
  )

  return {
    plugins,
    stats,
    loading,
    errorMessage,
    lastUpdated,
    loadStorePlugins
  }
}
