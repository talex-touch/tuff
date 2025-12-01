import type { MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

interface NexusManifestEntry {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  path: string
  timestamp?: string | number
  metadata?: Record<string, unknown>
}

export class NexusStoreProvider extends BaseMarketProvider {
  #cache: MarketPlugin[] | null = null

  async list(options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    if (!options.force && this.#cache) {
      return this.#cache
    }

    const manifestUrl = this.resolveManifestUrl()
    if (!manifestUrl) {
      return []
    }

    const response = await this.request<NexusManifestEntry[]>({
      url: manifestUrl,
      method: 'GET',
      headers: { Accept: 'application/json' }
    })

    if (!Array.isArray(response.data)) {
      throw new TypeError('MARKET_NEXUS_INVALID_MANIFEST')
    }

    const baseUrl = this.resolveBaseUrl(manifestUrl)

    const plugins = response.data.map((entry) => this.normalizeEntry(entry, baseUrl))

    this.#cache = plugins

    return plugins
  }

  private resolveManifestUrl(): string | null {
    if (typeof this.definition.config?.manifestUrl === 'string') {
      return this.definition.config.manifestUrl
    }

    if (typeof this.definition.url === 'string') {
      return this.definition.url
    }

    return null
  }

  private resolveBaseUrl(manifestUrl: string): string {
    if (typeof this.definition.config?.baseUrl === 'string') {
      return this.definition.config.baseUrl
    }

    try {
      const parsed = new URL(manifestUrl)
      parsed.pathname = parsed.pathname.replace(/\/[^/]*$/, '/') // remove filename
      return parsed.toString()
    } catch {
      return manifestUrl
    }
  }

  private normalizeEntry(entry: NexusManifestEntry, baseUrl: string): MarketPlugin {
    const normalizedPath = entry.path.replace(/^\//, '')
    const downloadUrl = new URL(normalizedPath, baseUrl).toString()

    let readmeUrl: string | undefined
    const metadata = entry.metadata ?? {}
    const readmePath = typeof metadata.readme_path === 'string' ? metadata.readme_path : undefined
    if (readmePath && readmePath.trim().length > 0) {
      readmeUrl = new URL(readmePath.replace(/^\//, ''), baseUrl).toString()
    }

    let icon: string | undefined
    if (
      typeof (metadata as any).icon_class === 'string' &&
      (metadata as any).icon_class.trim().length > 0
    ) {
      icon = (metadata as any).icon_class.trim()
    } else if (
      typeof (metadata as any).icon === 'string' &&
      (metadata as any).icon.trim().length > 0
    ) {
      const trimmed = (metadata as any).icon.trim()
      icon = trimmed.startsWith('i-') ? trimmed : `i-${trimmed}`
    }

    return {
      id: entry.id,
      name: entry.name,
      author: entry.author,
      version: entry.version,
      description: entry.description,
      category: entry.category,
      timestamp: entry.timestamp,
      icon,
      metadata,
      readmeUrl,
      downloadUrl,
      install: {
        type: 'url',
        url: downloadUrl
      },
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: this.definition.type,
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      official: this.trustLevel === 'official'
    }
  }
}
