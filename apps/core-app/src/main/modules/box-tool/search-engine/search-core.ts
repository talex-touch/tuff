import { ISearchEngine, ISearchProvider, TuffItem, TuffQuery, TuffSearchResult } from './types'
import { Sorter } from './sort/sorter'
import { tuffSorter } from './sort/tuff-sorter'
import { getGatheredItems, IGatherController } from './search-gather'
import { appProvider } from '../addon/apps/app-provider'
import { TalexTouch, TuffFactory } from '@talex-touch/utils'
import { TouchApp } from '../../../core/touch-core'
import { databaseManager } from '../../database'
import storage from '../../../core/storage'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { createDbUtils, DbUtils } from '../../../db/utils'
import crypto from 'crypto'

export class SearchEngineCore implements ISearchEngine, TalexTouch.IModule {
  private static _instance: SearchEngineCore

  readonly name = Symbol('search-engine-core')

  private providers: Map<string, ISearchProvider> = new Map()
  private providersToLoad: ISearchProvider[] = []
  private sorter: Sorter
  private activatedProviderIds: Set<string> | null = null
  private currentGatherController: IGatherController | null = null
  private dbUtils: DbUtils | null = null

  private touchApp: TouchApp | null = null

  constructor() {
    if (SearchEngineCore._instance) {
      throw new Error('[SearchEngineCore] Singleton class cannot be instantiated more than once.')
    }

    SearchEngineCore._instance = this
    this.sorter = new Sorter()
  }

  private registerDefaults(): void {
    this.sorter.register(tuffSorter)
    this.registerProvider(appProvider)
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

    if (provider.onLoad) {
      this.providersToLoad.push(provider)
    }
  }

  private async loadProvider(provider: ISearchProvider): Promise<void> {
    if (!this.touchApp) {
      console.error('[SearchEngineCore] Core modules not available to load provider.')
      return
    }
    const startTime = Date.now()
    try {
      await provider.onLoad?.({
        touchApp: this.touchApp,
        databaseManager: databaseManager,
        storageManager: storage
      })
      const duration = Date.now() - startTime
      console.log(
        `[SearchEngineCore] Provider '${provider.id}' loaded successfully in ${duration}ms.`
      )
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(
        `[SearchEngineCore] Failed to load provider '${provider.id}' after ${duration}ms.`,
        error
      )
    }
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
    const sessionId = crypto.randomUUID()
    console.debug(`[SearchEngineCore] search \`${query.text}\` (Session: ${sessionId})`)

    this._recordSearchUsage(sessionId, query)

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

          console.debug(`[SearchEngineCore] Matching ${allItems.length} items...`)
          const matchedItems = allItems
          console.debug(`[SearchEngineCore] Sorting ${matchedItems.length} items...`)
          const { sortedItems, stats: sort_stats } = this.sorter.sort(
            matchedItems,
            query,
            gatherController.signal
          )
          const duration = Date.now() - startTime

          const searchResult: TuffSearchResult = TuffFactory.createSearchResult(query)
            .setItems(sortedItems)
            .setDuration(duration)
            .setSources(finalSourceStats)
            .setSortStats(sort_stats)
            .build()

          searchResult.sessionId = sessionId

          resolve(searchResult)
        }
      })
      this.currentGatherController = gatherController
    })
  }

  private _getItemId(item: TuffItem): string {
    if (!item.id) {
      console.error('[SearchEngineCore] Item is missing a required `id` for usage tracking.', item)
      throw new Error('Item is missing a required `id` for usage tracking.')
    }
    return item.id
  }

  private async _recordSearchUsage(sessionId: string, query: TuffQuery): Promise<void> {
    if (!this.dbUtils) return

    try {
      await this.dbUtils.addUsageLog({
        sessionId,
        itemId: 'search_session', // Special ID for the search event itself
        source: 'system',
        action: 'search',
        keyword: query.text,
        timestamp: new Date(),
        context: JSON.stringify(query.context || {})
      })
      console.debug(`[SearchEngineCore] Recorded search session ${sessionId}`)
    } catch (error) {
      console.error('[SearchEngineCore] Failed to record search usage.', error)
    }
  }

  public async recordExecute(sessionId: string, item: TuffItem): Promise<void> {
    if (!this.dbUtils) return

    const itemId = this._getItemId(item)

    try {
      await this.dbUtils.addUsageLog({
        sessionId,
        itemId,
        source: item.source.type,
        action: 'execute',
        keyword: '', // Keyword is not relevant for an execute action
        timestamp: new Date(),
        context: JSON.stringify({
          scoring: item.scoring
        })
      })

      // Atomically increment the click count and update the last used timestamp
      await this.dbUtils.incrementUsageSummary(itemId)

      console.debug(`[SearchEngineCore] Recorded execute for item ${itemId} in session ${sessionId}`)
    } catch (error) {
      console.error(`[SearchEngineCore] Failed to record execute usage for item ${itemId}.`, error)
    }
  }

  maintain(): void {
    console.log(
      '[SearchEngineCore] Maintenance tasks can be triggered from here, but providers are now stateless.'
    )
    // TODO: The logic for refreshing indexes or caches should be handled
    // within the providers themselves, possibly triggered by a separate scheduler.
  }

  init(touchApp: TouchApp): void {
    const instance = SearchEngineCore.getInstance()

    instance.touchApp = touchApp
    instance.registerDefaults()

    const db = databaseManager.getDb()
    instance.dbUtils = createDbUtils(db)

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => {
      console.log('[SearchEngineCore] All modules loaded, start loading providers...')
      instance.providersToLoad.forEach((provider) => instance.loadProvider(provider))
      instance.providersToLoad = []
    })
  }

  destroy(): void {
    console.log('[SearchEngineCore] Destroying SearchEngineCore and aborting any ongoing search.')
    this.currentGatherController?.abort()
  }
}

export default SearchEngineCore.getInstance()
