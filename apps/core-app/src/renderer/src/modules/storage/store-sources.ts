import type { StoreProviderDefinition, StoreSourcesPayload } from '@talex-touch/utils/store'
import {
  createDefaultStoreProviders,
  createDefaultStoreSourcesPayload,
  DEFAULT_GITHUB_STORE_URL,
  DEFAULT_NPM_REGISTRY_URL,
  DEFAULT_STORE_DISCOVERY_KEYWORDS,
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

const ACTIVE_BUILTIN_PROVIDER_IDS = new Set<string>(['tuff-nexus', 'github-releases', 'npm-scope'])
const LEGACY_TALEX_OFFICIAL_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json'

function getRuntimeDefaultProviders(baseUrl = getRuntimeNexusBaseUrl()): StoreProviderDefinition[] {
  return createDefaultStoreProviders(baseUrl)
}

function getRuntimeDefaultProvider(
  id: string,
  baseUrl = getRuntimeNexusBaseUrl()
): StoreProviderDefinition | undefined {
  return getRuntimeDefaultProviders(baseUrl).find((item) => item.id === id)
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isLegacyPlaceholderToPrune(source: StoreProviderDefinition): boolean {
  if (source.id === 'talex-official') {
    const url = trimOptionalString(source.url)
    return source.enabled === false && (!url || url === LEGACY_TALEX_OFFICIAL_URL)
  }

  if (source.id === 'gitee-repos') {
    const url = trimOptionalString(source.url)
    return source.enabled === false && !url
  }

  return false
}

function normalizeBuiltinSource(
  source: StoreProviderDefinition,
  baseUrl: string
): StoreProviderDefinition {
  if (source.id === 'tuff-nexus' && source.isOfficial === true) {
    const runtimeSource = getRuntimeDefaultProvider('tuff-nexus', baseUrl)
    if (!runtimeSource) {
      return source
    }

    return {
      ...source,
      url: runtimeSource.url,
      outdated: false,
      config: {
        ...(source.config ?? {}),
        apiUrl: runtimeSource.config?.apiUrl
      }
    }
  }

  if (source.id === 'github-releases') {
    const runtimeSource = getRuntimeDefaultProvider('github-releases', baseUrl)
    const currentUrl = trimOptionalString(source.url)
    const nextUrl = currentUrl ?? runtimeSource?.url ?? DEFAULT_GITHUB_STORE_URL
    const currentConfig = source.config ?? {}
    const shouldUseSearchMode = !currentUrl || nextUrl === DEFAULT_GITHUB_STORE_URL
    const existingTopics = Array.isArray(currentConfig.topics)
      ? currentConfig.topics.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : []

    return {
      ...source,
      name: source.name === 'GitHub Releases' ? (runtimeSource?.name ?? 'GitHub') : source.name,
      url: nextUrl,
      description:
        !source.description ||
        source.description === '从 GitHub 仓库 releases / manifest 中读取插件。'
          ? (runtimeSource?.description ?? source.description)
          : source.description,
      priority:
        source.priority === 80 && !currentUrl ? (runtimeSource?.priority ?? 90) : source.priority,
      outdated: false,
      config: {
        platform: 'github',
        apiBase: 'https://api.github.com',
        ...currentConfig,
        ...(shouldUseSearchMode
          ? {
              mode: typeof currentConfig.mode === 'string' ? currentConfig.mode : 'search',
              topic:
                typeof currentConfig.topic === 'string' && currentConfig.topic.trim().length > 0
                  ? currentConfig.topic
                  : DEFAULT_STORE_DISCOVERY_KEYWORDS[0],
              topics:
                existingTopics.length > 0 ? existingTopics : [...DEFAULT_STORE_DISCOVERY_KEYWORDS]
            }
          : {})
      }
    }
  }

  if (source.id === 'npm-scope') {
    const runtimeSource = getRuntimeDefaultProvider('npm-scope', baseUrl)
    const currentConfig = source.config ?? {}
    const configRegistry = trimOptionalString(currentConfig.registryUrl)
    const currentUrl = trimOptionalString(source.url)
    const nextUrl = currentUrl ?? configRegistry ?? runtimeSource?.url ?? DEFAULT_NPM_REGISTRY_URL
    const existingKeywords = Array.isArray(currentConfig.keywords)
      ? currentConfig.keywords.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : []
    const legacyKeyword = trimOptionalString(currentConfig.keyword)
    const isDefaultKeyword =
      !legacyKeyword ||
      (DEFAULT_STORE_DISCOVERY_KEYWORDS as readonly string[]).includes(legacyKeyword)
    const migratedKeywords =
      existingKeywords.length > 0
        ? existingKeywords
        : isDefaultKeyword
          ? [...DEFAULT_STORE_DISCOVERY_KEYWORDS]
          : [legacyKeyword]
    const migratedKeyword = isDefaultKeyword ? DEFAULT_STORE_DISCOVERY_KEYWORDS[0] : legacyKeyword
    const isDefaultRegistryUrl = !currentUrl || currentUrl === DEFAULT_NPM_REGISTRY_URL

    return {
      ...source,
      name: source.name === 'NPM 包' ? (runtimeSource?.name ?? 'NPM Registry') : source.name,
      url: nextUrl,
      description:
        !source.description || source.description === '基于 NPM 关键字或 scope 的插件发布渠道。'
          ? (runtimeSource?.description ?? source.description)
          : source.description,
      priority:
        source.priority === 60 && isDefaultRegistryUrl
          ? (runtimeSource?.priority ?? 80)
          : source.priority,
      outdated: false,
      config: {
        ...currentConfig,
        registryUrl: configRegistry ?? nextUrl,
        keyword: migratedKeyword,
        keywords: migratedKeywords
      }
    }
  }

  return source
}

function resolveOutdatedFlag(source: StoreProviderDefinition): boolean | undefined {
  if (ACTIVE_BUILTIN_PROVIDER_IDS.has(source.id)) {
    return false
  }

  if (typeof source.outdated === 'boolean') {
    return source.outdated
  }

  return undefined
}

export function normalizeStoreSourceDefinitions(
  sources: StoreProviderDefinition[],
  baseUrl = getRuntimeNexusBaseUrl()
): StoreProviderDefinition[] {
  return sources
    .filter((source) => Boolean(source && source.id && source.name))
    .map((source) => {
      const runtimeSource = normalizeBuiltinSource(source, baseUrl)

      return {
        id: runtimeSource.id,
        name: runtimeSource.name,
        type: runtimeSource.type,
        url: trimOptionalString(runtimeSource.url),
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

export function normalizeStoreSourcesPayload(
  payload: Partial<StoreSourcesPayload> | null | undefined,
  options: {
    ensureDefaults?: boolean
    restoreMissingDefaults?: boolean
    baseUrl?: string
  } = {}
): StoreSourcesPayload {
  const baseUrl = options.baseUrl ?? getRuntimeNexusBaseUrl()
  const storedVersion = typeof payload?.version === 'number' ? payload.version : 0
  const isUpgradingFromLegacy = storedVersion < STORE_SOURCES_STORAGE_VERSION
  const runtimeDefaults = getRuntimeDefaultProviders(baseUrl)

  let workingSources = Array.isArray(payload?.sources)
    ? payload.sources.map((item) => cloneDefinition(item))
    : []

  if (isUpgradingFromLegacy) {
    workingSources = workingSources.filter((item) => !isLegacyPlaceholderToPrune(item))
  }

  const existingIds = new Set<string>(workingSources.map((item) => item.id))
  const shouldSeedAllDefaults =
    options.restoreMissingDefaults === true || workingSources.length === 0 || isUpgradingFromLegacy

  if (shouldSeedAllDefaults) {
    for (const preset of runtimeDefaults) {
      if (!existingIds.has(preset.id)) {
        workingSources.push(cloneDefinition(preset))
        existingIds.add(preset.id)
      }
    }
  } else if (options.ensureDefaults) {
    // Always preserve the official primary source even on v2+ payloads.
    const officialPreset = runtimeDefaults.find((item) => item.id === 'tuff-nexus')
    if (officialPreset && !existingIds.has(officialPreset.id)) {
      workingSources.unshift(cloneDefinition(officialPreset))
      existingIds.add(officialPreset.id)
    }
  }

  if (workingSources.length === 0 && runtimeDefaults[0]) {
    workingSources.push(cloneDefinition(runtimeDefaults[0]))
  }

  const normalizedSources = normalizeStoreSourceDefinitions(workingSources, baseUrl)
  if (isUpgradingFromLegacy) {
    normalizedSources.sort((a, b) => {
      const aOutdated = a.outdated ? 1 : 0
      const bOutdated = b.outdated ? 1 : 0
      if (aOutdated !== bOutdated) return aOutdated - bOutdated
      return (b.priority ?? 0) - (a.priority ?? 0)
    })
  }

  return {
    version: STORE_SOURCES_STORAGE_VERSION,
    sources: normalizedSources
  }
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
    return normalizeStoreSourceDefinitions(this.get().sources, getRuntimeNexusBaseUrl())
  }

  updateSources(nextSources: StoreProviderDefinition[]): void {
    const normalized = normalizeStoreSourceDefinitions(nextSources, getRuntimeNexusBaseUrl())
    this.set({
      version: STORE_SOURCES_STORAGE_VERSION,
      sources: normalized
    })
  }

  restoreDefaultSources(): StoreProviderDefinition[] {
    const payload = this.get()
    const nextPayload = normalizeStoreSourcesPayload(payload, {
      restoreMissingDefaults: true,
      baseUrl: getRuntimeNexusBaseUrl()
    })
    const currentSources = Array.isArray(payload.sources) ? payload.sources : []
    const existingIds = new Set(currentSources.map((item) => item.id))
    const missingDefaults = nextPayload.sources.filter((item) => !existingIds.has(item.id))

    if (missingDefaults.length > 0 || payload.version !== STORE_SOURCES_STORAGE_VERSION) {
      this.set(nextPayload)
    }

    return missingDefaults
  }

  private normalizePayload(options: { ensureDefaults?: boolean } = {}): void {
    const payload = this.get()
    const normalizedPayload = normalizeStoreSourcesPayload(payload, {
      ensureDefaults: options.ensureDefaults,
      baseUrl: getRuntimeNexusBaseUrl()
    })

    const hasChanged = JSON.stringify(payload) !== JSON.stringify(normalizedPayload)

    if (hasChanged) {
      this.set(normalizedPayload)
    }
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

export function getMissingDefaultStoreSourceIds(
  sources: ReadonlyArray<Pick<StoreProviderDefinition, 'id'>>
): string[] {
  const existingIds = new Set(sources.map((item) => item.id))
  return DEFAULT_STORE_PROVIDERS.filter((item) => !existingIds.has(item.id)).map((item) => item.id)
}
