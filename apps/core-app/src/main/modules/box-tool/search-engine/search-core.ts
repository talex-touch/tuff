import {
  IProviderActivate,
  ISearchEngine,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from './types'
import { Sorter } from './sort/sorter'
import { tuffSorter } from './sort/tuff-sorter'
import { getGatheredItems, IGatherController } from './search-gather'
import { appProvider } from '../addon/apps/app-provider'
import { fileProvider } from '../addon/files/file-provider'
import { windowManager } from '../core-box/window'
import PluginFeaturesAdapter from '../../plugin-manager/plugin-features-adapter'
import { TalexTouch, TuffFactory } from '@talex-touch/utils'
import { TouchApp } from '../../../core/touch-core'
import { databaseManager } from '../../database'
import storage from '../../../core/storage'
import { createDbUtils, DbUtils } from '../../../db/utils'
import crypto from 'crypto'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { ChannelType, StandardChannelData } from '@talex-touch/utils/channel'

/**
 * Generates a unique key for an activation request.
 * For the plugin adapter, it combines the provider ID with the plugin name
 * to ensure that each plugin's activation is unique.
 * @param activation The activation object.
 * @returns A unique string key.
 */
function getActivationKey(activation: IProviderActivate): string {
  if (activation.id === 'plugin-features' && activation.meta?.pluginName) {
    return `${activation.id}:${activation.meta.pluginName}`
  }
  return activation.id
}

export class SearchEngineCore implements ISearchEngine, TalexTouch.IModule {
  private static _instance: SearchEngineCore

  readonly name = Symbol('search-engine-core')

  private providers: Map<string, ISearchProvider> = new Map()
  private providersToLoad: ISearchProvider[] = []
  private sorter: Sorter
  private activatedProviders: Map<string, IProviderActivate> | null = null
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
    // TODO refractory - this provider costs a lot of time
    // this.registerProvider(fileProvider)
    this.registerProvider(PluginFeaturesAdapter)
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

  activateProviders(activations: IProviderActivate[] | null): void {
    if (activations && activations.length > 0) {
      const uniqueProviders = new Map<string, IProviderActivate>()
      for (const activation of activations) {
        const key = getActivationKey(activation)
        if (!uniqueProviders.has(key)) {
          uniqueProviders.set(key, activation)
        }
      }
      this.activatedProviders = uniqueProviders.size > 0 ? uniqueProviders : null
      console.debug(
        `[SearchEngineCore] activateProviders SET:`,
        this.activatedProviders ? Array.from(this.activatedProviders.values()) : null
      )
    } else {
      this.deactivateProviders()
    }
  }

  deactivateProvider(uniqueKey: string): void {
    if (this.activatedProviders && this.activatedProviders.has(uniqueKey)) {
      this.activatedProviders.delete(uniqueKey)
      console.log(`[SearchEngineCore] Deactivated provider with key: ${uniqueKey}`)
      if (this.activatedProviders.size === 0) {
        this.activatedProviders = null
        console.log(`[SearchEngineCore] All providers deactivated.`)
      }
    }
  }

  deactivateProviders(): void {
    console.log(
      `[SearchEngineCore] Deactivating all providers. Current state:`,
      this.activatedProviders
    )
    this.activatedProviders = null
    console.log(`[SearchEngineCore] All providers deactivated. New state is null.`)
  }

  getActiveProviders(): ISearchProvider[] {
    if (!this.activatedProviders) {
      return Array.from(this.providers.values())
    }
    // Get unique provider IDs from the activation keys
    const providerIds = new Set(
      Array.from(this.activatedProviders.values()).map((activation) => activation.id)
    )

    return Array.from(providerIds)
      .map((id) => this.providers.get(id))
      .filter((p): p is ISearchProvider => !!p)
  }

  public getActivationState(): IProviderActivate[] | null {
    if (!this.activatedProviders) {
      return null
    }
    return Array.from(this.activatedProviders.values())
  }

  public getProvidersByIds(ids: string[]): ISearchProvider[] {
    return ids.map((id) => this.providers.get(id)).filter((p): p is ISearchProvider => !!p)
  }

  private _updateActivationState(newResults: TuffSearchResult[]): void {
    const allNewActivations = newResults.flatMap((res) => res.activate || [])

    if (allNewActivations.length > 0) {
      const merged = new Map<string, IProviderActivate>(this.activatedProviders || [])
      allNewActivations.forEach((activation) => {
        const key = getActivationKey(activation)
        merged.set(key, activation)
      })
      this.activatedProviders = merged
    }
  }

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    console.log('[SearchEngineCore] search', query)
    this.currentGatherController?.abort()

    const sessionId = crypto.randomUUID()
    if (!query.text) {
      const emptyResult = TuffFactory.createSearchResult(query).setItems([]).setDuration(0).build()
      emptyResult.activate = this.getActivationState() ?? undefined
      emptyResult.sessionId = sessionId
      return emptyResult
    }

    const startTime = Date.now()
    this._recordSearchUsage(sessionId, query)

    return new Promise((resolve) => {
      let isFirstUpdate = true
      const providersToSearch = this.getActiveProviders()

      const sendUpdateToFrontend = (itemsToSend: TuffItem[]): void => {
        const coreBoxWindow = windowManager.current?.window
        if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
          this.touchApp!.channel.sendTo(coreBoxWindow, ChannelType.MAIN, 'core-box:search-update', {
            items: itemsToSend,
            searchId: sessionId
          })
        }
      }

      const gatherController = getGatheredItems(providersToSearch, query, (update) => {
        if (update.isDone) {
          // Handle final state and notify frontend
          this.currentGatherController = null
          this._updateActivationState(update.newResults)
          const coreBoxWindow = windowManager.current?.window
          if (coreBoxWindow) {
            this.touchApp!.channel.sendTo(coreBoxWindow, ChannelType.MAIN, 'core-box:search-end', {
              searchId: sessionId,
              activate: this.getActivationState() ?? undefined,
              sources: update.sourceStats
            })
          }
          console.debug(
            `[SearchEngineCore] SEARCH END. Final activation state:`,
            this.getActivationState()
          )
          return
        }

        if (isFirstUpdate) {
          isFirstUpdate = false
          const initialItems = update.newResults.flatMap((res) => res.items)
          const { sortedItems } = this.sorter.sort(initialItems, query, gatherController.signal)

          this._updateActivationState(update.newResults)

          const initialResult = TuffFactory.createSearchResult(query)
            .setItems(sortedItems)
            .setDuration(Date.now() - startTime)
            .setSources(update.sourceStats || [])
            .build()
          initialResult.sessionId = sessionId
          initialResult.activate = this.getActivationState() ?? undefined
          resolve(initialResult)
        } else if (update.newResults.length > 0) {
          // This is a subsequent update
          const subsequentItems = update.newResults.flatMap((res) => res.items)
          const { sortedItems } = this.sorter.sort(subsequentItems, query, gatherController.signal)
          this._updateActivationState(update.newResults)
          sendUpdateToFrontend(sortedItems)
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

      console.debug(
        `[SearchEngineCore] Recorded execute for item ${itemId} in session ${sessionId}`
      )
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

    // Register IPC handlers
    const channel = touchApp.channel
    channel.regChannel(ChannelType.MAIN, 'core-box:query', async ({ data }) => {
      return instance.search(data.query)
    })

    channel.regChannel(
      ChannelType.MAIN,
      'core-box:execute',
      async (channelData: StandardChannelData) => {
        const { item, searchResult } = channelData.data as {
          item: TuffItem
          searchResult?: TuffSearchResult
        }
        const provider = instance.providers.get(item.source.id)
        if (!provider || !provider.onExecute) {
          return null
        }

        const shouldActivate = await provider.onExecute({ item, searchResult })

        if (shouldActivate) {
          // Create a detailed activation object
          const activation: IProviderActivate = {
            id: provider.id,
            name: provider.name,
            icon: provider.icon,
            meta: item.meta?.extension || {} // Pass all extension meta for deep activation
          }
          instance.activateProviders([activation])
        }

        return instance.getActivationState()
      }
    )

    channel.regChannel(ChannelType.MAIN, 'core-box:get-activated-providers', () => {
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:deactivate-provider', ({ data }) => {
      instance.deactivateProvider(data.id)
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:deactivate-providers', () => {
      instance.deactivateProviders()
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:get-provider-details', ({ data }) => {
      const providers = instance.getProvidersByIds(data.providerIds)
      return providers.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon
      }))
    })
  }

  destroy(): void {
    console.log('[SearchEngineCore] Destroying SearchEngineCore and aborting any ongoing search.')
    this.currentGatherController?.abort()
  }
}

export default SearchEngineCore.getInstance()
