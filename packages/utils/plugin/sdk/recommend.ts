import type { RecommendProvider } from '../../core-box/recommendation'

/**
 * SDK for plugins to register custom recommendation providers.
 *
 * Providers registered through this SDK will be called by the RecommendationEngine
 * when generating recommendations for the CoreBox empty-query state.
 */
export interface RecommendSDK {
  /**
   * Register a recommendation provider.
   * @returns A dispose function to unregister the provider.
   */
  registerProvider(provider: RecommendProvider): () => void

  /**
   * Unregister a recommendation provider by its ID.
   * @returns true if the provider was found and removed.
   */
  unregisterProvider(providerId: string): boolean
}
