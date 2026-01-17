import type {
  MarketPlugin,
  MarketProviderDefinition,
  MarketProviderListOptions,
  MarketProviderResultMeta
} from '@talex-touch/utils/market'
import { marketHttpRequest } from './market-http-client'
import { createMarketProvider } from './provider-factory'

interface FetchOptions extends MarketProviderListOptions {
  definitions: MarketProviderDefinition[]
}

export interface MarketCatalogResult {
  plugins: MarketPlugin[]
  stats: MarketProviderResultMeta[]
}

export async function fetchMarketCatalog(options: FetchOptions): Promise<MarketCatalogResult> {
  const definitions = options.definitions
    .filter((definition) => definition.enabled !== false)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  const ctx = {
    request: marketHttpRequest
  }

  const settled = await Promise.allSettled(
    definitions.map(async (definition) => {
      const provider = createMarketProvider(definition, ctx)
      if (!provider) {
        return {
          meta: buildMeta(definition, false, 'MARKET_PROVIDER_UNSUPPORTED', 0),
          plugins: []
        }
      }

      try {
        const plugins = await provider.list(options)
        return {
          plugins,
          meta: buildMeta(definition, true, undefined, plugins.length)
        }
      } catch (error: any) {
        return {
          plugins: [],
          meta: buildMeta(
            definition,
            false,
            typeof error?.message === 'string' ? error.message : 'MARKET_PROVIDER_FAILED',
            0
          )
        }
      }
    })
  )

  const plugins: MarketPlugin[] = []
  const stats: MarketProviderResultMeta[] = []

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
      stats.push({
        providerId: 'unknown',
        providerName: 'Unknown',
        providerType: 'nexusStore',
        success: false,
        error: result.reason?.message ?? 'MARKET_PROVIDER_FAILED',
        fetchedAt: Date.now(),
        itemCount: 0
      })
    }
  }

  return { plugins, stats }
}

function buildMeta(
  definition: MarketProviderDefinition,
  success: boolean,
  error: string | undefined,
  count: number
): MarketProviderResultMeta {
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
