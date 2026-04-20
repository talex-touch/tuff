import type { StorePlugin, StoreProviderListOptions } from '@talex-touch/utils/store'
import { BaseStoreProvider } from './base-provider'
import { devLog } from '~/utils/dev-log'

interface NexusManifestEntry {
  id: string
  name: string
  author?: string | { name: string }
  version: string
  category?: string
  description?: string
  summary?: string
  timestamp?: string | number
  metadata?: Record<string, unknown>
  slug?: string
  iconUrl?: string | null
  isOfficial?: boolean
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

interface NexusApiResponse {
  plugins: NexusManifestEntry[]
  total: number
}

export class NexusStoreProvider extends BaseStoreProvider {
  #cache: StorePlugin[] | null = null

  private appendCompactQuery(url: string): string {
    try {
      const parsed = new URL(url)
      parsed.searchParams.set('compact', '1')
      return parsed.toString()
    } catch {
      const separator = url.includes('?') ? '&' : '?'
      return `${url}${separator}compact=1`
    }
  }

  async list(options: StoreProviderListOptions = {}): Promise<StorePlugin[]> {
    if (!options.force && this.#cache) {
      return this.#cache
    }

    const manifestUrl = this.resolveManifestUrl()
    if (!manifestUrl) {
      return []
    }

    devLog('[NexusStoreProvider] Requesting:', manifestUrl)

    let response: Awaited<ReturnType<typeof this.request<NexusApiResponse>>>
    try {
      response = await this.request<NexusApiResponse>({
        url: manifestUrl,
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      devLog('[NexusStoreProvider] Response status:', response.status)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[NexusStoreProvider] Request failed:', manifestUrl, message)
      throw new TypeError(`STORE_NEXUS_REQUEST_FAILED: ${message}`)
    }

    let data: unknown = response.data

    // Auto-parse JSON string if needed (axios may not parse when Content-Type is incorrect)
    if (typeof data === 'string') {
      const rawStr = data
      try {
        data = JSON.parse(rawStr)
      } catch {
        console.error('[NexusStoreProvider] Failed to parse JSON string:', rawStr.slice(0, 200))
        throw new TypeError('STORE_NEXUS_INVALID_JSON')
      }
    }

    if (Array.isArray(data)) {
      console.error('[NexusStoreProvider] Unsupported manifest array format:', {
        url: manifestUrl,
        status: response.status
      })
      throw new TypeError('STORE_NEXUS_LEGACY_MANIFEST_UNSUPPORTED')
    }

    if (data && typeof data === 'object' && 'plugins' in data && Array.isArray(data.plugins)) {
      const entries = data.plugins as NexusManifestEntry[]
      const baseUrl = this.resolveBaseUrl(manifestUrl)
      const plugins = entries.map((entry) => this.normalizeEntry(entry, baseUrl))
      this.#cache = plugins
      return plugins
    }

    {
      const dataType = data === null ? 'null' : typeof data
      const dataPreview =
        data === null || data === undefined ? String(data) : JSON.stringify(data).slice(0, 200)
      console.error('[NexusStoreProvider] Invalid manifest format:', {
        url: manifestUrl,
        status: response.status,
        dataType,
        dataPreview
      })
      throw new TypeError(`STORE_NEXUS_INVALID_MANIFEST (type: ${dataType})`)
    }
  }

  private resolveManifestUrl(): string | null {
    let url: string | null = null

    if (typeof this.definition.config?.apiUrl === 'string') {
      url = this.definition.config.apiUrl
    } else if (typeof this.definition.config?.manifestUrl === 'string') {
      url = this.definition.config.manifestUrl
    } else if (typeof this.definition.url === 'string') {
      url = this.definition.url
    }

    if (!url) {
      return null
    }

    if (!url.includes('/api/store/plugins')) {
      throw new TypeError('STORE_NEXUS_API_URL_REQUIRED')
    }

    return this.appendCompactQuery(url)
  }

  private resolveBaseUrl(manifestUrl: string): string {
    if (typeof this.definition.config?.baseUrl === 'string') {
      return this.definition.config.baseUrl
    }

    try {
      const parsed = new URL(manifestUrl)
      // Return the origin (scheme + host) as the base URL
      // e.g., http://localhost:3200/api/store/plugins -> http://localhost:3200
      return parsed.origin
    } catch {
      return manifestUrl
    }
  }

  private normalizeEntry(entry: NexusManifestEntry, baseUrl: string): StorePlugin {
    let downloadUrl: string
    let version: string = entry.version
    const metadata = entry.metadata ?? {}

    if (entry.latestVersion?.packageUrl) {
      downloadUrl = entry.latestVersion.packageUrl.startsWith('http')
        ? entry.latestVersion.packageUrl
        : new URL(entry.latestVersion.packageUrl.replace(/^\//, ''), baseUrl).toString()
      version = entry.latestVersion.version || entry.version
    } else {
      throw new TypeError(`STORE_NEXUS_PACKAGE_URL_REQUIRED: ${entry.slug || entry.id}`)
    }

    let readmeUrl: string | undefined
    if (entry.readmeUrl) {
      readmeUrl = entry.readmeUrl.startsWith('http')
        ? entry.readmeUrl
        : new URL(entry.readmeUrl.replace(/^\//, ''), baseUrl).toString()
    } else {
      const readmePath = typeof metadata.readme_path === 'string' ? metadata.readme_path : undefined
      if (readmePath && readmePath.trim().length > 0) {
        readmeUrl = new URL(readmePath.replace(/^\//, ''), baseUrl).toString()
      }
    }

    // Handle icon - always construct full URL at source
    let icon: string | undefined
    let iconUrl: string | undefined
    const rawIconUrl =
      entry.iconUrl || (typeof metadata.icon_url === 'string' ? metadata.icon_url : undefined)
    if (rawIconUrl && typeof rawIconUrl === 'string') {
      iconUrl = rawIconUrl.startsWith('http')
        ? rawIconUrl
        : new URL(rawIconUrl.replace(/^\//, ''), baseUrl).toString()
    } else {
      const iconClass = typeof metadata.icon_class === 'string' ? metadata.icon_class.trim() : ''
      const iconValue = typeof metadata.icon === 'string' ? metadata.icon.trim() : ''
      if (iconClass.length > 0) {
        icon = iconClass
      } else if (iconValue.length > 0) {
        const trimmed = iconValue
        icon = trimmed.startsWith('i-') ? trimmed : `i-${trimmed}`
      }
    }

    // Handle author
    const author =
      typeof entry.author === 'object' && entry.author?.name
        ? entry.author.name
        : (entry.author as string | undefined)

    // Use description or summary
    const description = entry.description || entry.summary

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
      official: entry.isOfficial || this.trustLevel === 'official'
    }
  }
}
