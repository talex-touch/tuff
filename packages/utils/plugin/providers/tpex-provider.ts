import type { IManifest } from '..'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext,
} from './types'
import { PluginProviderType } from './types'

const DEFAULT_TPEX_API = 'https://tuff.tagzxia.com'

/**
 * Check if source is a .tpex file path or URL
 */
function isTpexFile(source: string): boolean {
  return source.trim().toLowerCase().endsWith('.tpex')
}

/**
 * Check if source is a remote URL
 */
function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

export interface TpexPluginInfo {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: { name: string, avatarColor?: string } | null
  iconUrl?: string | null
  latestVersion?: {
    id: string
    version: string
    channel: string
    packageUrl: string
    packageSize: number
    signature?: string
    manifest?: Record<string, unknown> | null
    changelog?: string | null
  }
}

export interface TpexListResponse {
  plugins: TpexPluginInfo[]
  total: number
}

export interface TpexDetailResponse {
  plugin: TpexPluginInfo & {
    versions?: Array<{
      id: string
      version: string
      channel: string
      packageUrl: string
      packageSize: number
      signature?: string
      manifest?: Record<string, unknown> | null
      changelog?: string | null
    }>
  }
}

/**
 * Parse TPEX source string to extract slug and optional version
 * Formats: "tpex:slug", "tpex:slug@version", "slug" (when hintType is TPEX)
 */
function parseTpexSource(source: string): { slug: string, version?: string } | null {
  const tpexMatch = source.match(/^tpex:([a-z0-9][a-z0-9\-_.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (tpexMatch) {
    return { slug: tpexMatch[1], version: tpexMatch[2] }
  }

  const slugMatch = source.match(/^([a-z0-9][a-z0-9\-_.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (slugMatch) {
    return { slug: slugMatch[1], version: slugMatch[2] }
  }

  return null
}

export class TpexProvider implements PluginProvider {
  readonly type = PluginProviderType.TPEX
  private apiBase: string

  constructor(apiBase: string = DEFAULT_TPEX_API) {
    this.apiBase = apiBase.replace(/\/$/, '')
  }

  canHandle(request: PluginInstallRequest): boolean {
    // Handle .tpex file paths (local or remote URL)
    if (isTpexFile(request.source)) {
      return true
    }

    if (request.hintType === PluginProviderType.TPEX) {
      return parseTpexSource(request.source) !== null
    }
    return request.source.startsWith('tpex:')
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    // Handle .tpex file directly (local path or remote URL)
    if (isTpexFile(request.source)) {
      return this.installFromFile(request, context)
    }

    // Handle tpex:slug format - fetch from API
    return this.installFromRegistry(request, context)
  }

  /**
   * Install from a .tpex file (local path or remote URL)
   */
  private async installFromFile(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    let filePath = request.source
    let arrayBuffer: ArrayBuffer | undefined

    if (isRemoteUrl(request.source)) {
      // Download remote .tpex file
      const downloadRes = await fetch(request.source)
      if (!downloadRes.ok) {
        throw new Error(`Failed to download TPEX file: ${downloadRes.statusText}`)
      }

      arrayBuffer = await downloadRes.arrayBuffer()
      const tempDir = context?.tempDir ?? '/tmp'
      const fileName = `tpex-${Date.now()}.tpex`
      filePath = `${tempDir}/${fileName}`

      if (typeof globalThis.process !== 'undefined') {
        const fs = await import('node:fs/promises')
        await fs.writeFile(filePath, Buffer.from(arrayBuffer))
      }
    }

    // For local files, just return the path - manifest extraction happens in core-app
    return {
      provider: PluginProviderType.TPEX,
      filePath,
      official: false,
      metadata: {
        sourceType: 'file',
        originalSource: request.source,
      },
    }
  }

  /**
   * Install from TPEX registry (tpex:slug format)
   */
  private async installFromRegistry(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    const parsed = parseTpexSource(request.source)
    if (!parsed) {
      throw new Error(`Invalid TPEX source format: ${request.source}`)
    }

    const { slug, version } = parsed

    const detailRes = await fetch(`${this.apiBase}/api/market/plugins/${slug}`)
    if (!detailRes.ok) {
      if (detailRes.status === 404) {
        throw new Error(`Plugin not found: ${slug}`)
      }
      throw new Error(`Failed to fetch plugin details: ${detailRes.statusText}`)
    }

    const detail: TpexDetailResponse = await detailRes.json()
    const plugin = detail.plugin

    let targetVersion = plugin.latestVersion
    if (version && plugin.versions) {
      targetVersion = plugin.versions.find(v => v.version === version) ?? targetVersion
    }

    if (!targetVersion?.packageUrl) {
      throw new Error(`No downloadable version found for plugin: ${slug}`)
    }

    const downloadUrl = targetVersion.packageUrl.startsWith('http')
      ? targetVersion.packageUrl
      : `${this.apiBase}${targetVersion.packageUrl}`

    const downloadRes = await fetch(downloadUrl)
    if (!downloadRes.ok) {
      throw new Error(`Failed to download plugin package: ${downloadRes.statusText}`)
    }

    const arrayBuffer = await downloadRes.arrayBuffer()
    const tempDir = context?.tempDir ?? '/tmp'
    const fileName = `${slug}-${targetVersion.version}.tpex`
    const filePath = `${tempDir}/${fileName}`

    if (typeof globalThis.process !== 'undefined') {
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, Buffer.from(arrayBuffer))
    }

    const manifest: IManifest | undefined = targetVersion.manifest
      ? {
          id: plugin.slug,
          name: plugin.name,
          version: targetVersion.version,
          description: plugin.summary,
          author: plugin.author?.name ?? 'Unknown',
          main: (targetVersion.manifest as Record<string, unknown>).main as string ?? 'index.js',
          icon: plugin.iconUrl ?? undefined,
          ...targetVersion.manifest,
        }
      : undefined

    return {
      provider: PluginProviderType.TPEX,
      filePath,
      official: plugin.isOfficial,
      manifest,
      metadata: {
        sourceType: 'registry',
        slug: plugin.slug,
        version: targetVersion.version,
        channel: targetVersion.channel,
        packageSize: targetVersion.packageSize,
        installs: plugin.installs,
      },
    }
  }

  /**
   * List all available plugins from TPEX registry
   */
  async listPlugins(): Promise<TpexPluginInfo[]> {
    const res = await fetch(`${this.apiBase}/api/market/plugins`)
    if (!res.ok) {
      throw new Error(`Failed to fetch plugin list: ${res.statusText}`)
    }

    const data: TpexListResponse = await res.json()
    return data.plugins
  }

  /**
   * Get plugin details by slug
   */
  async getPlugin(slug: string): Promise<TpexDetailResponse['plugin'] | null> {
    const res = await fetch(`${this.apiBase}/api/market/plugins/${slug}`)
    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`Failed to fetch plugin: ${res.statusText}`)
    }

    const data: TpexDetailResponse = await res.json()
    return data.plugin
  }

  /**
   * Search plugins by keyword
   */
  async searchPlugins(keyword: string): Promise<TpexPluginInfo[]> {
    const plugins = await this.listPlugins()
    const lowerKeyword = keyword.toLowerCase()

    return plugins.filter(plugin =>
      plugin.name.toLowerCase().includes(lowerKeyword)
      || plugin.slug.toLowerCase().includes(lowerKeyword)
      || plugin.summary.toLowerCase().includes(lowerKeyword),
    )
  }
}

export const tpexProvider = new TpexProvider()
