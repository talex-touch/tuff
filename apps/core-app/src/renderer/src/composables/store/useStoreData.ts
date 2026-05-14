import type { StorePlugin, StoreProviderResultMeta } from '@talex-touch/utils/store'
import { effectScope, ref, watch } from 'vue'
import { fetchStoreCatalog } from '~/modules/store/store-data-service'
import { storeSourcesStorage } from '~/modules/storage/store-sources'
import { createRendererLogger } from '~/utils/renderer-log'

export type StorePluginListItem = StorePlugin

const storeDataLog = createRendererLogger('StoreData')

const plugins = ref<StorePlugin[]>([])
const stats = ref<StoreProviderResultMeta[]>([])
const loading = ref(false)
const errorMessage = ref('')
const lastUpdated = ref<number | null>(null)
const hasLoaded = ref(false)
const sourceWatcherScope = effectScope(true)

let loadPromise: Promise<void> | null = null
let lastSourceSignature = ''
let inFlightSourceSignature = ''
let sourceWatcherStarted = false
let queuedForceReload = false

function getEnabledSourceDefinitions() {
  return storeSourcesStorage.getSources().filter((source) => source.enabled !== false)
}

function createSourceSignature(
  definitions: ReturnType<typeof getEnabledSourceDefinitions>
): string {
  return JSON.stringify(definitions)
}

async function loadStorePlugins(force = false): Promise<void> {
  const definitions = getEnabledSourceDefinitions()
  const sourceSignature = createSourceSignature(definitions)
  const canUseCache = hasLoaded.value && sourceSignature === lastSourceSignature

  if (!force && canUseCache) {
    return loadPromise ?? Promise.resolve()
  }

  if (loadPromise) {
    queuedForceReload = queuedForceReload || force || sourceSignature !== inFlightSourceSignature
    return loadPromise
  }

  loading.value = true
  errorMessage.value = ''
  inFlightSourceSignature = sourceSignature

  loadPromise = (async () => {
    try {
      const result = await fetchStoreCatalog({
        definitions,
        force
      })

      plugins.value = result.plugins
      stats.value = result.stats
      lastUpdated.value = Date.now()
      lastSourceSignature = sourceSignature
      hasLoaded.value = true
    } catch (error: unknown) {
      storeDataLog.error('Failed to load plugins', error)
      const reason = error instanceof Error ? error.message : ''
      errorMessage.value = reason || 'store.error.loadFailed'
    } finally {
      loading.value = false
      loadPromise = null
      inFlightSourceSignature = ''

      if (queuedForceReload) {
        queuedForceReload = false
        await loadStorePlugins(true)
      }
    }
  })()

  return loadPromise
}

function ensureSourceWatcher(): void {
  if (sourceWatcherStarted) return
  sourceWatcherStarted = true

  sourceWatcherScope.run(() => {
    watch(
      () => storeSourcesStorage.get().sources,
      () => {
        void loadStorePlugins(true)
      },
      { deep: true }
    )
  })
}

export function useStoreData() {
  ensureSourceWatcher()

  return {
    plugins,
    stats,
    loading,
    errorMessage,
    lastUpdated,
    loadStorePlugins
  }
}
