import type { MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { requestNexusWithAuth } from '../nexus-auth-client'
import { BaseMarketProvider } from './base-provider'

interface TpexApiPlugin {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: { name: string; avatarColor?: string } | null
  iconUrl?: string | null
  readmeMarkdown?: string | null
  readmeUrl?: string | null
  latestVersion?: {
    id: string
    version: string
    channel: string
    packageUrl: string
    packageSize: number
    manifest?: Record<string, unknown> | null
    changelog?: string | null
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

interface TpexApiResponse {
  plugins: TpexApiPlugin[]
  total: number
}

export class TpexApiProvider extends BaseMarketProvider {
  #cache: MarketPlugin[] | null = null

  async list(options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    if (!options.force && this.#cache) {
      return this.#cache
    }

    const apiUrl = this.resolveApiUrl()
    if (!apiUrl) {
      return []
    }

    const response = await this.request<TpexApiResponse>({
      url: apiUrl,
      method: 'GET',
      headers: { Accept: 'application/json' }
    })

    if (!response.data?.plugins || !Array.isArray(response.data.plugins)) {
      throw new TypeError('MARKET_TPEX_API_INVALID_RESPONSE')
    }

    const plugins = response.data.plugins.map((entry) => this.normalizeEntry(entry))

    this.#cache = plugins

    return plugins
  }

  private resolveApiUrl(): string | null {
    if (typeof this.definition.config?.apiUrl === 'string') {
      return this.definition.config.apiUrl
    }

    if (typeof this.definition.url === 'string') {
      const baseUrl = this.definition.url.replace(/\/$/, '')
      return `${baseUrl}/api/market/plugins`
    }

    return null
  }

  private normalizeEntry(entry: TpexApiPlugin): MarketPlugin {
    const downloadUrl = entry.latestVersion?.packageUrl ?? ''

    return {
      id: entry.slug || entry.id,
      name: entry.name,
      author: entry.author?.name,
      version: entry.latestVersion?.version,
      description: entry.summary,
      category: entry.category,
      timestamp: entry.latestVersion?.createdAt || entry.updatedAt,
      iconUrl: entry.iconUrl ?? undefined,
      metadata: {
        installs: entry.installs,
        badges: entry.badges,
        isOfficial: entry.isOfficial,
        homepage: entry.homepage
      },
      readmeUrl: entry.readmeUrl ?? undefined,
      homepage: entry.homepage ?? undefined,
      downloadUrl,
      install: downloadUrl
        ? {
            type: 'url',
            url: downloadUrl,
            format: 'tpex'
          }
        : undefined,
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: this.definition.type,
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      official: entry.isOfficial || this.trustLevel === 'official'
    }
  }

  /**
   * Fetch user's own plugins from dashboard API (requires authentication)
   */
  async listUserPlugins(): Promise<MarketPlugin[]> {
    const baseUrl = this.resolveBaseUrl()
    if (!baseUrl) {
      return []
    }

    const apiUrl = `${baseUrl}/api/dashboard/plugins`

    const response = await requestNexusWithAuth<TpexApiResponse>(
      (options) => this.request<TpexApiResponse>(options),
      {
        url: apiUrl,
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      'tpex-api:user-plugins'
    )

    if (!response) {
      console.warn('[TpexApiProvider] Not authenticated, cannot fetch user plugins')
      return []
    }
    if (response.status < 200 || response.status >= 300) {
      return []
    }

    if (!response.data?.plugins || !Array.isArray(response.data.plugins)) {
      return []
    }

    return response.data.plugins.map((entry) => this.normalizeEntry(entry))
  }

  private resolveBaseUrl(): string | null {
    if (typeof this.definition.url === 'string') {
      return this.definition.url.replace(/\/$/, '')
    }

    if (typeof this.definition.config?.apiUrl === 'string') {
      const url = new URL(this.definition.config.apiUrl)
      return `${url.protocol}//${url.host}`
    }

    return null
  }
}
