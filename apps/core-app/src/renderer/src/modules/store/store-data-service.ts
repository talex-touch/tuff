import type {
  StorePlugin,
  StoreProviderDefinition,
  StoreProviderListOptions,
  StoreProviderResultMeta
} from '@talex-touch/utils/store'
import { storeHttpRequest } from './store-http-client'
import { createStoreProvider } from './provider-factory'

interface FetchOptions extends StoreProviderListOptions {
  definitions: StoreProviderDefinition[]
}

export interface StoreCatalogResult {
  plugins: StorePlugin[]
  stats: StoreProviderResultMeta[]
}

export async function fetchStoreCatalog(options: FetchOptions): Promise<StoreCatalogResult> {
  const definitions = options.definitions
    .filter((definition) => definition.enabled !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  const ctx = {
    request: storeHttpRequest
  }

  const settled = await Promise.allSettled(
    definitions.map(async (definition) => {
      const provider = createStoreProvider(definition, ctx)
      if (!provider) {
        return {
          meta: buildMeta(definition, false, 'STORE_PROVIDER_UNSUPPORTED', 0),
          plugins: []
        }
      }

      try {
        const plugins = await provider.list(options)
        return {
          plugins,
          meta: buildMeta(definition, true, undefined, plugins.length)
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : undefined
        return {
          plugins: [],
          meta: buildMeta(definition, false, message || 'STORE_PROVIDER_FAILED', 0)
        }
      }
    })
  )

  const plugins: StorePlugin[] = []
  const stats: StoreProviderResultMeta[] = []

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const { plugins: providerPlugins, meta } = result.value
      plugins.push(
        ...providerPlugins.map((plugin) => ({
          ...plugin,
          providerId: meta.providerId
        }))
      )
      stats.push(meta)
    } else {
      // A rejected promise indicates unexpected failure
      const reason =
        result.reason instanceof Error ? result.reason.message : 'STORE_PROVIDER_FAILED'
      stats.push({
        providerId: 'unknown',
        providerName: 'Unknown',
        providerType: 'nexusStore',
        success: false,
        error: reason,
        fetchedAt: Date.now(),
        itemCount: 0
      })
    }
  }

  return { plugins, stats }
}

function buildMeta(
  definition: StoreProviderDefinition,
  success: boolean,
  error: string | undefined,
  count: number
): StoreProviderResultMeta {
  return {
    providerId: definition.id,
    providerName: definition.name,
    providerType: definition.type,
    success,
    error,
    fetchedAt: Date.now(),
    itemCount: count
  }
}
