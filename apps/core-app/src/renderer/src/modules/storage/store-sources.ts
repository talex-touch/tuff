import type { StoreProviderDefinition, StoreSourcesPayload } from '@talex-touch/utils/store'
import {
  createDefaultStoreProviders,
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
import { getRuntimeNexusBaseUrl } from '~/modules/nexus/runtime-base'

const STORE_SOURCES_SINGLETON_KEY = `storage:${STORE_SOURCES_STORAGE_KEY}`

function cloneDefinition(definition: StoreProviderDefinition): StoreProviderDefinition {
  return JSON.parse(JSON.stringify(definition))
}

const NON_OUTDATED_PROVIDER_IDS = new Set<string>(['tuff-nexus', 'npm-scope'])
const BUILTIN_PROVIDER_IDS = new Set<string>(DEFAULT_STORE_PROVIDERS.map((item) => item.id))

function getRuntimeDefaultProviders(): StoreProviderDefinition[] {
  return createDefaultStoreProviders(getRuntimeNexusBaseUrl())
}

function getRuntimeDefaultProvider(id: string): StoreProviderDefinition | undefined {
  return getRuntimeDefaultProviders().find((item) => item.id === id)
}

function normalizeRuntimeOfficialSource(source: StoreProviderDefinition): StoreProviderDefinition {
  if (source.id !== 'tuff-nexus' || source.isOfficial !== true) {
    return source
  }

  const runtimeSource = getRuntimeDefaultProvider('tuff-nexus')
  if (!runtimeSource) {
    return source
  }

  return {
    ...source,
    url: runtimeSource.url,
    config: {
      ...(source.config ?? {}),
      apiUrl: runtimeSource.config?.apiUrl
    }
  }
}

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
    super(STORE_SOURCES_STORAGE_KEY, createDefaultStoreSourcesPayload(getRuntimeNexusBaseUrl()))
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
    return this.normalizeDefinitions(this.get().sources)
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
        const runtimePreset = getRuntimeDefaultProvider(preset.id) ?? preset
        if (!existingIds.has(runtimePreset.id)) {
          normalizedSources.push(cloneDefinition(runtimePreset))
          existingIds.add(preset.id)
        }
      }
    }

    if (normalizedSources.length === 0) {
      normalizedSources.push(cloneDefinition(getRuntimeDefaultProviders()[0]!))
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
      .map((source) => {
        const runtimeSource = normalizeRuntimeOfficialSource(source)

        return {
          id: runtimeSource.id,
          name: runtimeSource.name,
          type: runtimeSource.type,
          url: runtimeSource.url,
          config: runtimeSource.config ?? {},
          description: runtimeSource.description,
          enabled: runtimeSource.enabled !== false,
          priority: typeof runtimeSource.priority === 'number' ? runtimeSource.priority : 0,
          trustLevel: runtimeSource.trustLevel ?? 'unverified',
          tags: Array.isArray(runtimeSource.tags) ? [...runtimeSource.tags] : undefined,
          readOnly: runtimeSource.readOnly ?? false,
          isOfficial: runtimeSource.isOfficial ?? false,
          outdated: resolveOutdatedFlag(runtimeSource)
        }
      })
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
