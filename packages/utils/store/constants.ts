import type {
  StoreProviderDefinition,
  StoreProviderTrustLevel,
  StoreSourcesPayload,
  StoreSourcesStorageInfo,
} from './types'
import { StorageList } from '../common/storage/constants'
import { getTuffBaseUrl } from '../env'
import {
  DEFAULT_NPM_REGISTRY_URL,
  NPM_PLUGIN_CANONICAL_KEYWORD,
  NPM_PLUGIN_DISCOVERY_KEYWORDS,
} from '../plugin/npm-contract'

export { DEFAULT_NPM_REGISTRY_URL }

export const STORE_SOURCES_STORAGE_KEY = StorageList.STORE_SOURCES
export const STORE_SOURCES_STORAGE_VERSION = 2

export const DEFAULT_GITHUB_STORE_URL = 'https://github.com/topics/tuff-plugin'
export const DEFAULT_STORE_DISCOVERY_KEYWORDS = NPM_PLUGIN_DISCOVERY_KEYWORDS

function defineProvider(
  provider: Omit<StoreProviderDefinition, 'trustLevel'> & {
    trustLevel?: StoreProviderTrustLevel
  },
): StoreProviderDefinition {
  return {
    trustLevel: provider.trustLevel ?? 'unverified',
    ...provider,
  }
}

export function createDefaultStoreProviders(baseUrl = getTuffBaseUrl()): StoreProviderDefinition[] {
  const nexusBase = baseUrl.replace(/\/+$/, '')
  return [
    defineProvider({
      id: 'tuff-nexus',
      name: 'Tuff Nexus',
      type: 'tpexApi',
      url: nexusBase,
      description: 'Tuff 官方插件市场，提供经过审核的插件。',
      enabled: true,
      priority: 110,
      trustLevel: 'official',
      isOfficial: true,
      outdated: false,
      readOnly: true,
      config: {
        apiUrl: `${nexusBase}/api/store/plugins`,
      },
    }),
    defineProvider({
      id: 'github-releases',
      name: 'GitHub',
      type: 'repository',
      url: DEFAULT_GITHUB_STORE_URL,
      description: '从 GitHub 开源插件仓库与 Releases 发现插件。',
      enabled: false,
      priority: 90,
      trustLevel: 'unverified',
      isOfficial: false,
      outdated: false,
      readOnly: false,
      config: {
        platform: 'github',
        apiBase: 'https://api.github.com',
        mode: 'search',
        topic: DEFAULT_STORE_DISCOVERY_KEYWORDS[0],
        topics: [...DEFAULT_STORE_DISCOVERY_KEYWORDS],
      },
    }),
    defineProvider({
      id: 'npm-scope',
      name: 'NPM Registry',
      type: 'npmPackage',
      url: DEFAULT_NPM_REGISTRY_URL,
      description: '从 NPM 官方源发现带有 tuff-plugin 关键字的插件包。',
      enabled: false,
      priority: 80,
      trustLevel: 'unverified',
      isOfficial: false,
      outdated: false,
      readOnly: false,
      config: {
        registryUrl: DEFAULT_NPM_REGISTRY_URL,
        keyword: NPM_PLUGIN_CANONICAL_KEYWORD,
        keywords: [...DEFAULT_STORE_DISCOVERY_KEYWORDS],
      },
    }),
  ]
}

export const DEFAULT_STORE_PROVIDERS: StoreProviderDefinition[] = createDefaultStoreProviders()

export const STORE_SOURCES_STORAGE_INFO: StoreSourcesStorageInfo = {
  storageKey: STORE_SOURCES_STORAGE_KEY,
  version: STORE_SOURCES_STORAGE_VERSION,
}

export function createDefaultStoreSourcesPayload(baseUrl = getTuffBaseUrl()): StoreSourcesPayload {
  const providers = createDefaultStoreProviders(baseUrl)
  const clone = typeof structuredClone === 'function'
    ? structuredClone(providers)
    : JSON.parse(JSON.stringify(providers))

  return {
    version: STORE_SOURCES_STORAGE_VERSION,
    sources: clone,
  }
}
