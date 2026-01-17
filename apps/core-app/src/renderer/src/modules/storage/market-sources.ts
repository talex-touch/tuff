import type { MarketProviderDefinition, MarketSourcesPayload } from '@talex-touch/utils/market'
import {
  createDefaultMarketSourcesPayload,
  DEFAULT_MARKET_PROVIDERS,
  MARKET_SOURCES_STORAGE_KEY,
  MARKET_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/market'
import { createStorageProxy, TouchStorage } from '@talex-touch/utils/renderer/storage/base-storage'

const MARKET_SOURCES_SINGLETON_KEY = `storage:${MARKET_SOURCES_STORAGE_KEY}`

function cloneDefinition(definition: MarketProviderDefinition): MarketProviderDefinition {
  return JSON.parse(JSON.stringify(definition))
}

class MarketSourcesStorage extends TouchStorage<MarketSourcesPayload> {
  #initialized = false

  constructor() {
    super(MARKET_SOURCES_STORAGE_KEY, createDefaultMarketSourcesPayload())
    this.setAutoSave(true)
    this.normalizePayload({ ensureDefaults: true })
    this.#initialized = true

    this.onUpdate(() => {
      if (!this.#initialized) {
        return
      }
      this.normalizePayload()
    })
  }

  getSources(): MarketProviderDefinition[] {
    return this.get().sources
  }

  updateSources(nextSources: MarketProviderDefinition[]): void {
    const normalized = this.normalizeDefinitions(nextSources)
    this.set({
      version: MARKET_SOURCES_STORAGE_VERSION,
      sources: normalized
    })
  }

  private normalizePayload(options: { ensureDefaults?: boolean } = {}): void {
    const payload = this.get()
    const normalizedSources = Array.isArray(payload.sources) ? [...payload.sources] : []
    const existingIds = new Set<string>(normalizedSources.map((item) => item.id))

    if (options.ensureDefaults) {
      for (const preset of DEFAULT_MARKET_PROVIDERS) {
        if (!existingIds.has(preset.id)) {
          normalizedSources.push(cloneDefinition(preset))
          existingIds.add(preset.id)
        }
      }
    }

    if (normalizedSources.length === 0) {
      normalizedSources.push(cloneDefinition(DEFAULT_MARKET_PROVIDERS[0]!))
    }

    const normalizedPayload: MarketSourcesPayload = {
      version: MARKET_SOURCES_STORAGE_VERSION,
      sources: this.normalizeDefinitions(normalizedSources)
    }

    const hasChanged = JSON.stringify(payload) !== JSON.stringify(normalizedPayload)

    if (hasChanged) {
      this.set(normalizedPayload)
    }
  }

  private normalizeDefinitions(sources: MarketProviderDefinition[]): MarketProviderDefinition[] {
    return sources
      .filter((source) => Boolean(source && source.id && source.name))
      .map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        url: source.url,
        config: source.config ?? {},
        description: source.description,
        enabled: source.enabled !== false,
        priority: typeof source.priority === 'number' ? source.priority : 0,
        trustLevel: source.trustLevel ?? 'unverified',
        tags: Array.isArray(source.tags) ? [...source.tags] : undefined,
        readOnly: source.readOnly ?? false
      }))
  }
}

export const marketSourcesStorage = createStorageProxy(
  MARKET_SOURCES_SINGLETON_KEY,
  () => new MarketSourcesStorage()
)

export function getMarketSourceDefinitions(): MarketProviderDefinition[] {
  return marketSourcesStorage.getSources()
}
