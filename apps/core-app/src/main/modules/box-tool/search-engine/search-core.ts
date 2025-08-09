import { TalexTouch } from '../../../../../../../packages/utils/types/touch-app-core'
import {
  ISearchEngine,
  ISearchProvider,
  ISortMiddleware,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from './types'
import { Sorter } from './sort/sorter'
import { getGatheredItems, IGatherController } from './search-gather'
import { TuffFactory } from '@core-box/builder/tuff-builder'

export class SearchEngineCore implements ISearchEngine, TalexTouch.IModule {
  private static _instance: SearchEngineCore

  readonly name = Symbol('search-engine-core')

  private providers: Map<string, ISearchProvider> = new Map()
  private sorter: Sorter
  private activatedProviderIds: Set<string> | null = null
  private currentGatherController: IGatherController | null = null

  constructor() {
    if (SearchEngineCore._instance) {
      throw new Error('[SearchEngineCore] Singleton class cannot be instantiated more than once.')
    }

    SearchEngineCore._instance = this
    this.sorter = new Sorter()

    // Register a default sorting middleware
    const defaultSortMiddleware: ISortMiddleware = {
      name: 'default-match-sorter',
      sort: (items: TuffItem[]) => {
        return [...items].sort((a, b) => {
          const scoreA = a.scoring?.match ?? 0
          const scoreB = b.scoring?.match ?? 0
          return scoreB - scoreA
        })
      }
    }
    this.sorter.register(defaultSortMiddleware)
  }

  static getInstance(): SearchEngineCore {
    if (!this._instance) {
      this._instance = new SearchEngineCore()
    }

    return this._instance
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

  activateProviders(providerIds: string[] | null): void {
    if (providerIds && providerIds.length > 0) {
      this.activatedProviderIds = new Set(providerIds)
      console.log(`[SearchEngineCore] Activated providers:`, providerIds)
    } else {
      this.activatedProviderIds = null
      console.log(`[SearchEngineCore] All providers activated.`)
    }
  }

  deactivateProviders(): void {
    this.activatedProviderIds = null
    console.log(`[SearchEngineCore] All providers activated.`)
  }

  getActiveProviders(): ISearchProvider[] {
    if (!this.activatedProviderIds) {
      return Array.from(this.providers.values())
    }
    return Array.from(this.activatedProviderIds)
      .map((id) => this.providers.get(id))
      .filter((p): p is ISearchProvider => !!p)
  }

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    // Abort any ongoing search before starting a new one
    if (this.currentGatherController) {
      this.currentGatherController.abort()
    }

    const startTime = Date.now()
    console.log('[SearchEngineCore] search', query.text)

    const providersToSearch = this.getActiveProviders()
    const allItems: TuffItem[] = []
    let finalSourceStats: TuffSearchResult['sources'] = []

    return new Promise((resolve) => {
      const gatherController = getGatheredItems(providersToSearch, query, (update) => {
        if (update.newItems.length > 0) {
          allItems.push(...update.newItems)
        }
        if (update.sourceStats) {
          finalSourceStats = update.sourceStats
        }
        if (update.isDone) {
          this.currentGatherController = null // Clear the controller when done
          const { sortedItems, stats: sort_stats } = this.sorter.sort(
            allItems,
            query,
            gatherController.signal
          )
          const duration = Date.now() - startTime

          const searchResult = TuffFactory.createSearchResult(query)
            .setItems(sortedItems)
            .setDuration(duration)
            .setSources(finalSourceStats)
            .setSortStats(sort_stats)
            .build()
          resolve(searchResult)
        }
      })
      this.currentGatherController = gatherController
    })
  }

  maintain(): void {
    console.log(
      '[SearchEngineCore] Maintenance tasks can be triggered from here, but providers are now stateless.'
    )
    // TODO: The logic for refreshing indexes or caches should be handled
    // within the providers themselves, possibly triggered by a separate scheduler.
  }

  init(): void {
    // The core is initialized as a singleton
  }

  destroy(): void {
    console.log('[SearchEngineCore] Destroying SearchEngineCore and aborting any ongoing search.')
    this.currentGatherController?.abort()
  }
}

export function getSearchEngineCore(): SearchEngineCore {
  return SearchEngineCore.getInstance()
}
