import { ISearchEngine, ISearchProvider, TuffItem, TuffQuery, TuffSearchResult } from './types'

export class SearchEngineCore implements ISearchEngine {
  private providers: Map<string, ISearchProvider> = new Map()

  constructor() {
    console.log('[SearchEngineCore] constructor')
  }

  registerProvider(provider: ISearchProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[SearchEngineCore] Search provider '${provider.id}' is already registered.`)
      return
    }
    this.providers.set(provider.id, provider)
    console.log(`[SearchEngineCore] Search provider '${provider.id}' registered.`)
  }

  unregisterProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      console.warn(`[SearchEngineCore] Search provider '${providerId}' is not registered.`)
      return
    }
    const provider = this.providers.get(providerId)
    provider?.onDeactivate?.()
    this.providers.delete(providerId)
    console.log(`[SearchEngineCore] Search provider '${providerId}' unregistered.`)
  }

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    const startTime = Date.now()
    console.log('[SearchEngineCore] search', query.text)

    const searchPromises: Promise<TuffItem[]>[] = []

    for (const provider of this.providers.values()) {
      searchPromises.push(provider.onSearch(query))
    }

    const resultsByProvider = await Promise.allSettled(searchPromises)

    const allItems: TuffItem[] = []
    const sourceStats: TuffSearchResult['sources'] = []

    resultsByProvider.forEach((result, index) => {
      const provider = Array.from(this.providers.values())[index]
      if (result.status === 'fulfilled') {
        const items = result.value
        allItems.push(...items)
        sourceStats.push({
          source: provider.id,
          count: items.length,
          duration: 0 // Placeholder, can be refined later
        })
      } else {
        console.error(
          `[SearchEngineCore] Provider '${provider.id}' failed to search:`,
          result.reason
        )
      }
    })

    // Simple sorting based on score (higher is better)
    allItems.sort((a, b) => (b.scoring?.final ?? 0) - (a.scoring?.final ?? 0))

    const duration = Date.now() - startTime

    const searchResult: TuffSearchResult = {
      items: allItems,
      total: allItems.length,
      query,
      duration,
      sources: sourceStats,
      has_more: false // Placeholder for future pagination
    }

    return searchResult
  }

  maintain(): void {
    console.log(
      '[SearchEngineCore] Maintenance tasks can be triggered from here, but providers are now stateless.'
    )
    // The logic for refreshing indexes or caches should be handled
    // within the providers themselves, possibly triggered by a separate scheduler.
  }
}
