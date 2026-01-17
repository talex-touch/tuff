import type {
  MarketInstallInstruction,
  MarketPlugin,
  MarketProviderListOptions
} from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

/**
 * NPM package metadata from registry
 */
interface NpmPackageMetadata {
  name: string
  description?: string
  'dist-tags': {
    latest: string
    [tag: string]: string
  }
  versions: Record<string, NpmVersionMetadata>
  time?: Record<string, string>
  author?: string | { name: string; email?: string }
  keywords?: string[]
  homepage?: string
  repository?: {
    type: string
    url: string
  }
}

/**
 * NPM version metadata
 */
interface NpmVersionMetadata {
  name: string
  version: string
  description?: string
  author?: string | { name: string; email?: string }
  keywords?: string[]
  homepage?: string
  tuffPlugin?: {
    category?: string
    icon?: string
    tags?: string[]
  }
  dist: {
    tarball: string
    integrity?: string
    shasum?: string
  }
}

/**
 * NPM search result
 */
interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string
      version: string
      description?: string
      keywords?: string[]
      author?: { name: string }
      links?: {
        npm?: string
        homepage?: string
        repository?: string
      }
    }
    score?: {
      final: number
    }
  }>
  total: number
}

/**
 * NPM Package Provider
 *
 * Supports fetching Tuff plugins from NPM registry.
 *
 * Configuration:
 * - url: NPM registry URL (default: https://registry.npmjs.org)
 * - config.scope: Package scope to search (e.g., @tuff-plugins)
 * - config.keyword: Search keyword (default: tuff-plugin)
 */
export class NpmPackageProvider extends BaseMarketProvider {
  private registry = 'https://registry.npmjs.org'

  /**
   * List plugins from NPM registry
   */
  async list(options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    // Use custom registry if provided
    if (this.definition.url) {
      this.registry = this.definition.url.replace(/\/$/, '')
    }

    const keyword = options.keyword || (this.definition.config?.keyword as string) || 'tuff-plugin'
    const scope = this.definition.config?.scope as string | undefined

    try {
      // Search for packages
      const packages = await this.searchPackages(keyword, scope)

      // Fetch metadata for each package and convert to MarketPlugin
      const plugins: MarketPlugin[] = []

      for (const pkg of packages.slice(0, 50)) {
        // Limit to 50 packages
        try {
          const plugin = await this.fetchPackageAsPlugin(pkg.name)
          if (plugin) {
            plugins.push(plugin)
          }
        } catch (error) {
          console.warn(`[NpmPackageProvider] Failed to fetch ${pkg.name}:`, error)
        }
      }

      return plugins
    } catch (error) {
      console.error(`[NpmPackageProvider] Failed to list packages:`, error)
      return []
    }
  }

  /**
   * Search NPM for packages
   */
  private async searchPackages(
    keyword: string,
    scope?: string
  ): Promise<Array<{ name: string; version: string; description?: string }>> {
    // Build search query
    let query = `keywords:${keyword}`
    if (scope) {
      query = `scope:${scope} ${query}`
    }

    const searchUrl = `${this.registry}/-/v1/search?text=${encodeURIComponent(query)}&size=100`

    const response = await this.request<NpmSearchResult>({
      url: searchUrl,
      method: 'GET',
      timeout: 15000
    })

    if (response.status !== 200) {
      throw new Error(`NPM search failed: ${response.status}`)
    }

    return response.data.objects.map((obj) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description
    }))
  }

  /**
   * Fetch package metadata and convert to MarketPlugin
   */
  private async fetchPackageAsPlugin(packageName: string): Promise<MarketPlugin | null> {
    const metadataUrl = `${this.registry}/${encodeURIComponent(packageName)}`

    const response = await this.request<NpmPackageMetadata>({
      url: metadataUrl,
      method: 'GET',
      timeout: 10000
    })

    if (response.status !== 200) {
      return null
    }

    const metadata = response.data
    const latestVersion = metadata['dist-tags'].latest
    const versionData = metadata.versions[latestVersion]

    if (!versionData) {
      return null
    }

    // Extract author name
    let authorName = ''
    if (typeof metadata.author === 'string') {
      authorName = metadata.author
    } else if (metadata.author?.name) {
      authorName = metadata.author.name
    }

    // Build install instruction
    const install: MarketInstallInstruction = {
      type: 'npm',
      packageName: metadata.name,
      version: latestVersion,
      registry: this.registry !== 'https://registry.npmjs.org' ? this.registry : undefined
    }

    // Get tuff-specific metadata
    const tuffMeta = versionData.tuffPlugin || {}

    const plugin: MarketPlugin = {
      id: `npm:${metadata.name}`,
      name: metadata.name,
      version: latestVersion,
      description: metadata.description || '',
      category: tuffMeta.category || 'npm',
      tags: tuffMeta.tags || metadata.keywords || [],
      author: authorName,
      icon: tuffMeta.icon,
      homepage: metadata.homepage,
      downloadUrl: versionData.dist.tarball,
      install,
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: 'npmPackage',
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      timestamp: metadata.time?.[latestVersion]
    }

    return plugin
  }
}
