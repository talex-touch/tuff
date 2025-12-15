import type { StorageList } from '../common/storage/constants'

export type MarketProviderType = 'repository' | 'nexusStore' | 'npmPackage' | 'tpexApi'

export type MarketProviderTrustLevel = 'official' | 'verified' | 'unverified'

export interface MarketProviderDefinition {
  id: string
  name: string
  type: MarketProviderType
  /**
   * Base URL or identifier for the provider.
   * Individual provider implementations can interpret this differently.
   */
  url?: string
  /**
   * Additional configuration object for provider specific options.
   */
  config?: Record<string, any>
  description?: string
  enabled: boolean
  priority: number
  trustLevel?: MarketProviderTrustLevel
  tags?: string[]
  /**
    * Whether this provider should be treated as read-only (no install)
    */
  readOnly?: boolean
  /**
   * Whether this is an official provider
   */
  isOfficial?: boolean
  /**
   * Whether this provider is outdated and should be deprecated
   */
  outdated?: boolean
}

export interface MarketSourcesPayload {
  /**
   * Schema version, used for migrations.
   */
  version: number
  sources: MarketProviderDefinition[]
}

export type MarketInstallInstruction =
  | {
    type: 'url'
    url: string
    format?: 'zip' | 'tar' | 'tgz' | 'tpex'
    integrity?: string
  }
  | {
    type: 'npm'
    packageName: string
    version?: string
    registry?: string
  }
  | {
    type: 'git'
    repo: string
    ref?: string
    sparse?: boolean
  }

export interface MarketPlugin {
  id: string
  name: string
  version?: string
  description?: string
  category?: string
  tags?: string[]
  author?: string
  /**
   * Icon class name (e.g., 'i-mdi-puzzle')
   */
  icon?: string
  /**
   * Direct URL to icon image (e.g., '/api/images/xxx.svg')
   */
  iconUrl?: string
  metadata?: Record<string, unknown>
  readmeUrl?: string
  homepage?: string
  downloadUrl?: string
  install?: MarketInstallInstruction
  providerId: string
  providerName: string
  providerType: MarketProviderType
  providerTrustLevel: MarketProviderTrustLevel
  trusted: boolean
  official?: boolean
  timestamp?: number | string
}

export interface MarketProviderResultMeta {
  providerId: string
  providerName: string
  providerType: MarketProviderType
  success: boolean
  error?: string
  fetchedAt: number
  itemCount: number
}

export interface MarketProviderListOptions {
  keyword?: string
  force?: boolean
}

export interface MarketHttpRequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  params?: Record<string, any>
  data?: any
  timeout?: number
  responseType?: 'json' | 'text' | 'arraybuffer'
}

export interface MarketHttpResponse<T = unknown> {
  status: number
  statusText: string
  headers: Record<string, string>
  data: T
  url: string
}

export interface MarketSourcesStorageInfo {
  storageKey: StorageList
  version: number
}
