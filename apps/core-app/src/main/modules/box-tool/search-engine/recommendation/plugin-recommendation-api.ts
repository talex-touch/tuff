import type { RecommendProvider } from '@talex-touch/utils/core-box'

/** Runtime-only SDK surface; no plugin or search-core module import may close the provider cycle. */
export interface PluginRecommendationApi {
  registerPluginProvider(pluginName: string, provider: RecommendProvider): () => void
  /** Removes a provider only when it belongs to `pluginName`; a foreign id is reported as not removed. */
  unregisterPluginProvider(pluginName: string, providerId: string): boolean
  unregisterPluginProviders(pluginName: string): void
}

let currentApi: PluginRecommendationApi | null = null

/** The engine owns the binding and disposes only its own instance. */
export function bindPluginRecommendationApi(api: PluginRecommendationApi): () => void {
  currentApi = api
  return () => {
    if (currentApi === api) currentApi = null
  }
}

export function getPluginRecommendationApi(): PluginRecommendationApi | null {
  return currentApi
}
