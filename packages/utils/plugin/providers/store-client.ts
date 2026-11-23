import type { TuffNpmPackageIcon } from '../npm-contract'
import type { NpmPackageInfo } from './npm-provider'
import type { TpexPluginInfo } from './tpex-provider'
import {
  extractTuffPackageMetadata,
  formatNpmPluginSource,
  inferPluginNameFromNpmPackage,
  isOfficialNpmPluginPackageName,
  isValidNpmPackageName,
  parseNpmPluginSource,
} from '../npm-contract'
import { NpmProvider } from './npm-provider'
import { TpexProvider } from './tpex-provider'
import { PluginProviderType } from './types'

export type PluginSourceType = 'tpex' | 'npm' | 'all'

export interface StorePluginInfo {
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

export interface StoreSearchOptions {
  keyword?: string
  source?: PluginSourceType
  category?: string
  limit?: number
  offset?: number
}

export interface StoreSearchResult {
  plugins: StorePluginInfo[]
  total: number
  sources: {
    tpex: number
    npm: number
  }
}

function normalizeTpexPlugin(plugin: TpexPluginInfo): StorePluginInfo {
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

function resolveIconString(icon: string | TuffNpmPackageIcon | undefined): string | undefined {
  if (!icon)
    return undefined
  return typeof icon === 'string' ? icon : icon.value
}

function normalizeNpmPlugin(pkg: NpmPackageInfo): StorePluginInfo {
  const authorName = typeof pkg.author === 'string'
    ? pkg.author
    : pkg.author?.name ?? 'Unknown'
  const tuffMeta = extractTuffPackageMetadata(pkg)

  return {
    id: pkg.name,
    name: tuffMeta?.name ?? inferPluginNameFromNpmPackage(pkg.name) ?? pkg.name,
    slug: pkg.name,
    version: pkg.version,
    description: pkg.description ?? '',
    author: authorName,
    icon: resolveIconString(tuffMeta?.icon),
    source: 'npm',
    isOfficial: isOfficialNpmPluginPackageName(pkg.name),
    category: tuffMeta?.category,
    keywords: tuffMeta?.tags ?? pkg.keywords,
    homepage: pkg.homepage,
    packageUrl: pkg.dist?.tarball,
    raw: pkg,
  }
}

/**
 * Unified plugin market client supporting multiple sources
 */
export class PluginStoreClient {
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
  async search(options: StoreSearchOptions = {}): Promise<StoreSearchResult> {
    const { keyword, source = 'all', limit = 50, offset = 0 } = options
    const results: StorePluginInfo[] = []
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
        console.warn('[StoreClient] TPEX search failed:', error)
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
        console.warn('[StoreClient] NPM search failed:', error)
      }
    }

    const sorted = results.sort((a, b) => {
      if (a.isOfficial !== b.isOfficial)
        return a.isOfficial ? -1 : 1
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
  async getPlugin(identifier: string, source?: PluginSourceType): Promise<StorePluginInfo | null> {
    const parsedNpm = parseNpmPluginSource(identifier, {
      allowAnyBarePackageName: source === 'npm',
    })

    if (source === 'tpex' || (!source && !parsedNpm && !identifier.includes('/'))) {
      try {
        const plugin = await this.tpexProvider.getPlugin(identifier)
        if (plugin)
          return normalizeTpexPlugin(plugin)
      }
      catch {
        // Fall through to npm
      }
    }

    if (source === 'npm' || !source) {
      try {
        const pkg = parsedNpm
          ? await this.npmProvider.getPackageInfo(parsedNpm.packageName, parsedNpm.spec)
          : await this.npmProvider.getPackageInfo(identifier)
        if (pkg)
          return normalizeNpmPlugin(pkg)
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
  getInstallSource(plugin: StorePluginInfo): string {
    if (plugin.source === 'tpex') {
      return `tpex:${plugin.slug}`
    }
    return isValidNpmPackageName(plugin.id)
      ? formatNpmPluginSource(plugin.id)
      : `npm:${plugin.id}`
  }

  /**
   * Get provider type for a plugin
   */
  getProviderType(plugin: StorePluginInfo): PluginProviderType {
    return plugin.source === 'tpex'
      ? PluginProviderType.TPEX
      : PluginProviderType.NPM
  }

  /**
   * List all plugins from official source (TPEX)
   */
  async listOfficialPlugins(): Promise<StorePluginInfo[]> {
    const plugins = await this.tpexProvider.listPlugins()
    return plugins.map(normalizeTpexPlugin)
  }

  /**
   * List all plugins from npm
   */
  async listNpmPlugins(): Promise<StorePluginInfo[]> {
    const plugins = await this.npmProvider.listPlugins()
    return plugins.map(normalizeNpmPlugin)
  }
}

export const defaultStoreClient = new PluginStoreClient()
