import type { MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

interface NexusManifestEntry {
  id: string
  name: string
  author?: string | { name: string }
  version: string
  category?: string
  description?: string
  summary?: string
  path?: string
  timestamp?: string | number
  metadata?: Record<string, unknown>
  // Nexus API specific fields
  slug?: string
  iconUrl?: string | null
  latestVersion?: {
    version: string
    packageUrl: string
    changelog?: string
  }
  versions?: Array<{
    version: string
    packageUrl: string
    changelog?: string
  }>
  readmeUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

// Nexus API response format
interface NexusApiResponse {
  plugins: NexusManifestEntry[]
  total: number
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

    console.log('[NexusStoreProvider] Requesting:', manifestUrl)

    let response: Awaited<ReturnType<typeof this.request<NexusApiResponse | NexusManifestEntry[]>>>
    try {
      response = await this.request<NexusApiResponse | NexusManifestEntry[]>({
        url: manifestUrl,
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      console.log('[NexusStoreProvider] Response status:', response.status)
    } catch (err: any) {
      console.error('[NexusStoreProvider] Request failed:', manifestUrl, err?.message || err)
      throw new TypeError(`MARKET_NEXUS_REQUEST_FAILED: ${err?.message || 'Unknown error'}`)
    }

    // Handle both formats: Nexus API { plugins: [...] } and legacy array format
    let entries: NexusManifestEntry[]
    let data: unknown = response.data

    // Auto-parse JSON string if needed (axios may not parse when Content-Type is incorrect)
    if (typeof data === 'string') {
      const rawStr = data
      try {
        data = JSON.parse(rawStr)
      } catch {
        console.error('[NexusStoreProvider] Failed to parse JSON string:', rawStr.slice(0, 200))
        throw new TypeError('MARKET_NEXUS_INVALID_JSON')
      }
    }

    if (Array.isArray(data)) {
      entries = data as NexusManifestEntry[]
    } else if (data && typeof data === 'object' && 'plugins' in data && Array.isArray(data.plugins)) {
      entries = data.plugins as NexusManifestEntry[]
    } else {
      // Provide detailed debug info
      const dataType = data === null ? 'null' : typeof data
      const dataPreview = data === null || data === undefined
        ? String(data)
        : JSON.stringify(data).slice(0, 200)
      console.error('[NexusStoreProvider] Invalid manifest format:', {
        url: manifestUrl,
        status: response.status,
        dataType,
        dataPreview,
      })
      throw new TypeError(`MARKET_NEXUS_INVALID_MANIFEST (type: ${dataType})`)
    }

    const baseUrl = this.resolveBaseUrl(manifestUrl)

    const plugins = entries.map((entry) => this.normalizeEntry(entry, baseUrl))

    this.#cache = plugins

    return plugins
  }

  private resolveManifestUrl(): string | null {
    let url: string | null = null

    if (typeof this.definition.config?.manifestUrl === 'string') {
      url = this.definition.config.manifestUrl
    } else if (typeof this.definition.url === 'string') {
      url = this.definition.url
    }

    if (!url) {
      return null
    }

    // Ensure URL has the API path (backward compatibility for old configs)
    if (!url.includes('/api/market/plugins')) {
      const base = url.endsWith('/') ? url.slice(0, -1) : url
      return `${base}/api/market/plugins`
    }

    return url
  }

  private resolveBaseUrl(manifestUrl: string): string {
    if (typeof this.definition.config?.baseUrl === 'string') {
      return this.definition.config.baseUrl
    }

    try {
      const parsed = new URL(manifestUrl)
      // Return the origin (scheme + host) as the base URL
      // e.g., http://localhost:3200/api/market/plugins -> http://localhost:3200
      return parsed.origin
    } catch {
      return manifestUrl
    }
  }

  private normalizeEntry(entry: NexusManifestEntry, baseUrl: string): MarketPlugin {
    // Handle Nexus API format (latestVersion.packageUrl) or legacy format (path)
    let downloadUrl: string
    let version: string = entry.version

    if (entry.latestVersion?.packageUrl) {
      // Nexus API format
      downloadUrl = entry.latestVersion.packageUrl.startsWith('http')
        ? entry.latestVersion.packageUrl
        : new URL(entry.latestVersion.packageUrl.replace(/^\//, ''), baseUrl).toString()
      version = entry.latestVersion.version || entry.version
    } else if (entry.path) {
      // Legacy format
      const normalizedPath = entry.path.replace(/^\//, '')
      downloadUrl = new URL(normalizedPath, baseUrl).toString()
    } else {
      // Fallback: construct download URL from slug
      downloadUrl = `${baseUrl}/api/market/plugins/${entry.slug || entry.id}/download`
    }

    // Handle readme URL
    let readmeUrl: string | undefined
    if (entry.readmeUrl) {
      // Nexus API format
      readmeUrl = entry.readmeUrl.startsWith('http')
        ? entry.readmeUrl
        : new URL(entry.readmeUrl.replace(/^\//, ''), baseUrl).toString()
    } else {
      const metadata = entry.metadata ?? {}
      const readmePath = typeof metadata.readme_path === 'string' ? metadata.readme_path : undefined
      if (readmePath && readmePath.trim().length > 0) {
        readmeUrl = new URL(readmePath.replace(/^\//, ''), baseUrl).toString()
      }
    }

    // Handle icon - always construct full URL at source
    let icon: string | undefined
    let iconUrl: string | undefined
    const rawIconUrl = entry.iconUrl || (entry.metadata as any)?.icon_url
    if (rawIconUrl && typeof rawIconUrl === 'string') {
      iconUrl = rawIconUrl.startsWith('http')
        ? rawIconUrl
        : new URL(rawIconUrl.replace(/^\//, ''), baseUrl).toString()
    } else {
      const metadata = entry.metadata ?? {}
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
    }

    // Handle author
    const author = typeof entry.author === 'object' && entry.author?.name
      ? entry.author.name
      : (entry.author as string | undefined)

    // Use description or summary
    const description = entry.description || entry.summary

    const metadata = entry.metadata ?? {}

    return {
      id: entry.slug || entry.id,
      name: entry.name,
      author,
      version,
      description,
      category: entry.category,
      timestamp: entry.updatedAt || entry.createdAt || entry.timestamp,
      icon,
      iconUrl,
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
