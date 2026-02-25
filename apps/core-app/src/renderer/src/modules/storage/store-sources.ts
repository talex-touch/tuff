import type { StoreProviderDefinition, StoreSourcesPayload } from '@talex-touch/utils/store'
import {
  createDefaultStoreSourcesPayload,
  DEFAULT_STORE_PROVIDERS,
  STORE_SOURCES_STORAGE_KEY,
  STORE_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/store'
import {
  createStorageDataProxy,
  createStorageProxy,
  TouchStorage
} from '@talex-touch/utils/renderer/storage/base-storage'

const STORE_SOURCES_SINGLETON_KEY = `storage:${STORE_SOURCES_STORAGE_KEY}`

function cloneDefinition(definition: StoreProviderDefinition): StoreProviderDefinition {
  return JSON.parse(JSON.stringify(definition))
}

const NON_OUTDATED_PROVIDER_IDS = new Set<string>(['tuff-nexus', 'npm-scope'])
const BUILTIN_PROVIDER_IDS = new Set<string>(DEFAULT_STORE_PROVIDERS.map((item) => item.id))

function resolveOutdatedFlag(source: StoreProviderDefinition): boolean | undefined {
  if (BUILTIN_PROVIDER_IDS.has(source.id)) {
    return !NON_OUTDATED_PROVIDER_IDS.has(source.id)
  }

  if (typeof source.outdated === 'boolean') {
    return source.outdated
  }

  return undefined
}

class StoreSourcesStorage extends TouchStorage<StoreSourcesPayload> {
  #initialized = false

  constructor() {
    super(STORE_SOURCES_STORAGE_KEY, createDefaultStoreSourcesPayload())
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

  getSources(): StoreProviderDefinition[] {
    return this.get().sources
  }

  updateSources(nextSources: StoreProviderDefinition[]): void {
    const normalized = this.normalizeDefinitions(nextSources)
    this.set({
      version: STORE_SOURCES_STORAGE_VERSION,
      sources: normalized
    })
  }

  private normalizePayload(options: { ensureDefaults?: boolean } = {}): void {
    const payload = this.get()
    const normalizedSources = Array.isArray(payload.sources) ? [...payload.sources] : []
    const existingIds = new Set<string>(normalizedSources.map((item) => item.id))

    if (options.ensureDefaults) {
      for (const preset of DEFAULT_STORE_PROVIDERS) {
        if (!existingIds.has(preset.id)) {
          normalizedSources.push(cloneDefinition(preset))
          existingIds.add(preset.id)
        }
      }
    }

    if (normalizedSources.length === 0) {
      normalizedSources.push(cloneDefinition(DEFAULT_STORE_PROVIDERS[0]!))
    }

    const normalizedPayload: StoreSourcesPayload = {
      version: STORE_SOURCES_STORAGE_VERSION,
      sources: this.normalizeDefinitions(normalizedSources)
    }

    const hasChanged = JSON.stringify(payload) !== JSON.stringify(normalizedPayload)

    if (hasChanged) {
      this.set(normalizedPayload)
    }
  }

  private normalizeDefinitions(sources: StoreProviderDefinition[]): StoreProviderDefinition[] {
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
        readOnly: source.readOnly ?? false,
        isOfficial: source.isOfficial ?? false,
        outdated: resolveOutdatedFlag(source)
      }))
  }
}

export const storeSourcesStorage = createStorageProxy(
  STORE_SOURCES_SINGLETON_KEY,
  () => new StoreSourcesStorage()
)

export const storeSourcesData = createStorageDataProxy(storeSourcesStorage)

export function getStoreSourceDefinitions(): StoreProviderDefinition[] {
  return storeSourcesStorage.getSources()
}
