import type {
  StoreProviderDefinition,
  StoreProviderTrustLevel,
  StoreSourcesPayload,
  StoreSourcesStorageInfo,
} from './types'
import { StorageList } from '../common/storage/constants'
import { NEXUS_BASE_URL } from '../env'

export const STORE_SOURCES_STORAGE_KEY = StorageList.STORE_SOURCES
export const STORE_SOURCES_STORAGE_VERSION = 1

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

export const DEFAULT_STORE_PROVIDERS: StoreProviderDefinition[] = [
  defineProvider({
    id: 'tuff-nexus',
    name: 'Tuff Nexus',
    type: 'tpexApi',
    url: NEXUS_BASE_URL,
    description: 'Tuff 官方插件市场，提供经过审核的插件。',
    enabled: true,
    priority: 110,
    trustLevel: 'official',
    isOfficial: true,
    outdated: false,
    readOnly: true,
    config: {
      apiUrl: `${NEXUS_BASE_URL}/api/store/plugins`,
    },
  }),
  defineProvider({
    id: 'talex-official',
    name: 'Talex Official',
    type: 'nexusStore',
    url: 'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json',
    description: '官方插件市场，提供经过审核的核心插件。',
    enabled: false,
    priority: 100,
    trustLevel: 'official',
    isOfficial: true,
    outdated: true,
    readOnly: true,
    config: {
      manifestUrl:
        'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json',
      baseUrl: 'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/',
    },
  }),
  defineProvider({
    id: 'github-releases',
    name: 'GitHub Releases',
    type: 'repository',
    description: '从 GitHub 仓库 releases / manifest 中读取插件。',
    enabled: false,
    priority: 80,
    trustLevel: 'unverified',
    outdated: true,
    config: {
      platform: 'github',
      apiBase: 'https://api.github.com',
    },
  }),
  defineProvider({
    id: 'gitee-repos',
    name: 'Gitee 仓库',
    type: 'repository',
    description: 'Gitee 平台插件仓库，适合国内网络。',
    enabled: false,
    priority: 70,
    trustLevel: 'unverified',
    outdated: true,
    config: {
      platform: 'gitee',
      apiBase: 'https://gitee.com/api/v5',
    },
  }),
  defineProvider({
    id: 'npm-scope',
    name: 'NPM 包',
    type: 'npmPackage',
    description: '基于 NPM 关键字或 scope 的插件发布渠道。',
    enabled: false,
    priority: 60,
    trustLevel: 'unverified',
    outdated: false,
    config: {
      registryUrl: 'https://registry.npmjs.org',
      keyword: 'talex-touch-plugin',
    },
  }),
]

export const STORE_SOURCES_STORAGE_INFO: StoreSourcesStorageInfo = {
  storageKey: STORE_SOURCES_STORAGE_KEY,
  version: STORE_SOURCES_STORAGE_VERSION,
}

export function createDefaultStoreSourcesPayload(): StoreSourcesPayload {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(DEFAULT_STORE_PROVIDERS)
    : JSON.parse(JSON.stringify(DEFAULT_STORE_PROVIDERS))

  return {
    version: STORE_SOURCES_STORAGE_VERSION,
    sources: clone,
  }
}
