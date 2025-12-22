import { StorageList } from '../common/storage/constants'
import { NEXUS_BASE_URL } from '../env'
import type {
  MarketProviderDefinition,
  MarketSourcesPayload,
  MarketSourcesStorageInfo,
  MarketProviderTrustLevel,
} from './types'

export const MARKET_SOURCES_STORAGE_KEY = StorageList.MARKET_SOURCES
export const MARKET_SOURCES_STORAGE_VERSION = 1

function defineProvider(
  provider: Omit<MarketProviderDefinition, 'trustLevel'> & {
    trustLevel?: MarketProviderTrustLevel
  },
): MarketProviderDefinition {
  return {
    trustLevel: provider.trustLevel ?? 'unverified',
    ...provider,
  }
}

export const DEFAULT_MARKET_PROVIDERS: MarketProviderDefinition[] = [
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
    readOnly: true,
    config: {
      apiUrl: `${NEXUS_BASE_URL}/api/market/plugins`,
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
    config: {
      registryUrl: 'https://registry.npmjs.org',
      keyword: 'talex-touch-plugin',
    },
  }),
]

export const MARKET_SOURCES_STORAGE_INFO: MarketSourcesStorageInfo = {
  storageKey: MARKET_SOURCES_STORAGE_KEY,
  version: MARKET_SOURCES_STORAGE_VERSION,
}

export function createDefaultMarketSourcesPayload(): MarketSourcesPayload {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(DEFAULT_MARKET_PROVIDERS)
    : JSON.parse(JSON.stringify(DEFAULT_MARKET_PROVIDERS))

  return {
    version: MARKET_SOURCES_STORAGE_VERSION,
    sources: clone,
  }
}
