import type { MarketPlugin, MarketProviderResultMeta } from '@talex-touch/utils/market'
import { ref, watch } from 'vue'
import { fetchMarketCatalog } from '~/modules/market/market-data-service'
import { marketSourcesStorage } from '~/modules/storage/market-sources'

export type MarketPluginListItem = MarketPlugin

export function useMarketData() {
  const plugins = ref<MarketPlugin[]>([])
  const stats = ref<MarketProviderResultMeta[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const lastUpdated = ref<number | null>(null)

  async function loadMarketPlugins(force = false): Promise<void> {
    if (loading.value) {
      return
    }

    loading.value = true
    errorMessage.value = ''

    try {
      const definitions = marketSourcesStorage
        .getSources()
        .filter((source) => source.enabled !== false)
      const result = await fetchMarketCatalog({
        definitions,
        force
      })

      plugins.value = result.plugins
      stats.value = result.stats
      lastUpdated.value = Date.now()
    } catch (error: unknown) {
      console.error('[Market] Failed to load plugins:', error)
      const reason = error instanceof Error ? error.message : ''
      errorMessage.value = reason || 'market.error.loadFailed'
    } finally {
      loading.value = false
    }
  }

  watch(
    () => marketSourcesStorage.get().sources,
    () => {
      void loadMarketPlugins(true)
    },
    { deep: true }
  )

  return {
    plugins,
    stats,
    loading,
    errorMessage,
    lastUpdated,
    loadMarketPlugins
  }
}
