import type { NpmPackageInfo } from './npm-provider'
import type { TpexPluginInfo } from './tpex-provider'
import { NpmProvider } from './npm-provider'
import { TpexProvider } from './tpex-provider'
import { PluginProviderType } from './types'

export type PluginSourceType = 'tpex' | 'npm' | 'all'

export interface MarketPluginInfo {
  id: string
  name: string
  slug: string
  version: string
  description: string
  author: string
  icon?: string
  source: PluginSourceType
  isOfficial: boolean
  downloads?: number
  category?: string
  keywords?: string[]
  homepage?: string
  packageUrl?: string
  raw: TpexPluginInfo | NpmPackageInfo
}

export interface MarketSearchOptions {
  keyword?: string
  source?: PluginSourceType
  category?: string
  limit?: number
  offset?: number
}

export interface MarketSearchResult {
  plugins: MarketPluginInfo[]
  total: number
  sources: {
    tpex: number
    npm: number
  }
}

function normalizeTpexPlugin(plugin: TpexPluginInfo): MarketPluginInfo {
  return {
    id: plugin.id,
    name: plugin.name,
    slug: plugin.slug,
    version: plugin.latestVersion?.version ?? '0.0.0',
    description: plugin.summary,
    author: plugin.author?.name ?? 'Unknown',
    icon: plugin.iconUrl ?? undefined,
    source: 'tpex',
    isOfficial: plugin.isOfficial,
    downloads: plugin.installs,
    category: plugin.category,
    homepage: plugin.homepage ?? undefined,
    packageUrl: plugin.latestVersion?.packageUrl,
    raw: plugin,
  }
}

function normalizeNpmPlugin(pkg: NpmPackageInfo): MarketPluginInfo {
  const authorName = typeof pkg.author === 'string'
    ? pkg.author
    : pkg.author?.name ?? 'Unknown'

  return {
    id: pkg.name,
    name: pkg.name.replace(/^tuff-plugin-/, '').replace(/^@tuff\//, ''),
    slug: pkg.name,
    version: pkg.version,
    description: pkg.description ?? '',
    author: authorName,
    icon: pkg.tuff?.icon,
    source: 'npm',
    isOfficial: pkg.name.startsWith('@tuff/'),
    keywords: pkg.keywords,
    packageUrl: pkg.dist.tarball,
    raw: pkg,
  }
}

/**
 * Unified plugin market client supporting multiple sources
 */
export class PluginMarketClient {
  private tpexProvider: TpexProvider
  private npmProvider: NpmProvider

  constructor(options?: {
    tpexApiBase?: string
    npmRegistry?: string
  }) {
    this.tpexProvider = new TpexProvider(options?.tpexApiBase)
    this.npmProvider = new NpmProvider(options?.npmRegistry)
  }

  /**
   * Search plugins from all sources
   */
  async search(options: MarketSearchOptions = {}): Promise<MarketSearchResult> {
    const { keyword, source = 'all', limit = 50, offset = 0 } = options
    const results: MarketPluginInfo[] = []
    let tpexCount = 0
    let npmCount = 0

    if (source === 'all' || source === 'tpex') {
      try {
        const tpexPlugins = keyword
          ? await this.tpexProvider.searchPlugins(keyword)
          : await this.tpexProvider.listPlugins()

        const normalized = tpexPlugins.map(normalizeTpexPlugin)
        results.push(...normalized)
        tpexCount = normalized.length
      }
      catch (error) {
        console.warn('[MarketClient] TPEX search failed:', error)
      }
    }

    if (source === 'all' || source === 'npm') {
      try {
        const npmPlugins = await this.npmProvider.searchPlugins(keyword)
        const normalized = npmPlugins.map(normalizeNpmPlugin)
        results.push(...normalized)
        npmCount = normalized.length
      }
      catch (error) {
        console.warn('[MarketClient] NPM search failed:', error)
      }
    }

    const sorted = results.sort((a, b) => {
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1
      return (b.downloads ?? 0) - (a.downloads ?? 0)
    })

    const paginated = sorted.slice(offset, offset + limit)

    return {
      plugins: paginated,
      total: results.length,
      sources: {
        tpex: tpexCount,
        npm: npmCount,
      },
    }
  }

  /**
   * Get plugin details by identifier
   */
  async getPlugin(identifier: string, source?: PluginSourceType): Promise<MarketPluginInfo | null> {
    if (source === 'tpex' || (!source && !identifier.includes('/'))) {
      try {
        const plugin = await this.tpexProvider.getPlugin(identifier)
        if (plugin) return normalizeTpexPlugin(plugin)
      }
      catch {
        // Fall through to npm
      }
    }

    if (source === 'npm' || !source) {
      try {
        const pkg = await this.npmProvider.getPackageInfo(identifier)
        if (pkg) return normalizeNpmPlugin(pkg)
      }
      catch {
        // Not found
      }
    }

    return null
  }

  /**
   * Get install source string for a plugin
   */
  getInstallSource(plugin: MarketPluginInfo): string {
    if (plugin.source === 'tpex') {
      return `tpex:${plugin.slug}`
    }
    return `npm:${plugin.id}`
  }

  /**
   * Get provider type for a plugin
   */
  getProviderType(plugin: MarketPluginInfo): PluginProviderType {
    return plugin.source === 'tpex'
      ? PluginProviderType.TPEX
      : PluginProviderType.NPM
  }

  /**
   * List all plugins from official source (TPEX)
   */
  async listOfficialPlugins(): Promise<MarketPluginInfo[]> {
    const plugins = await this.tpexProvider.listPlugins()
    return plugins.map(normalizeTpexPlugin)
  }

  /**
   * List all plugins from npm
   */
  async listNpmPlugins(): Promise<MarketPluginInfo[]> {
    const plugins = await this.npmProvider.listPlugins()
    return plugins.map(normalizeNpmPlugin)
  }
}

export const defaultMarketClient = new PluginMarketClient()
