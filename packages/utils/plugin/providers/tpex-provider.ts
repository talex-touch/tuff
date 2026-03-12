import type { IManifest } from '..'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext,
} from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { NEXUS_BASE_URL } from '../../env'
import { networkClient } from '../../network'
import { PluginProviderType } from './types'

const DEFAULT_TPEX_API = NEXUS_BASE_URL
const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

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
  const tpexMatch = source.match(/^tpex:([a-z0-9][\w\-.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (tpexMatch) {
    const slug = tpexMatch[1]
    if (!slug)
      return null
    const version = tpexMatch[2]
    return version ? { slug, version } : { slug }
  }

  const slugMatch = source.match(/^([a-z0-9][\w\-.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (slugMatch) {
    const slug = slugMatch[1]
    if (!slug)
      return null
    const version = slugMatch[2]
    return version ? { slug, version } : { slug }
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
      const downloadRes = await networkClient.request<ArrayBuffer>({
        method: 'GET',
        url: request.source,
        responseType: 'arrayBuffer'
      })
      arrayBuffer = downloadRes.data
      const tempDir = context?.tempDir ?? '/tmp'
      const fileName = `tpex-${Date.now()}.tpex`
      filePath = `${tempDir}/${fileName}`

      if (typeof process !== 'undefined') {
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

    const detailRes = await networkClient.request<TpexDetailResponse>({
      method: 'GET',
      url: `${this.apiBase}/api/store/plugins/${slug}`,
      validateStatus: ALL_HTTP_STATUS
    })
    if (detailRes.status < 200 || detailRes.status >= 300) {
      if (detailRes.status === 404) {
        throw new Error(`Plugin not found: ${slug}`)
      }
      throw new Error(`Failed to fetch plugin details: HTTP ${detailRes.status}`)
    }

    const detail = detailRes.data
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

    const downloadRes = await networkClient.request<ArrayBuffer>({
      method: 'GET',
      url: downloadUrl,
      responseType: 'arrayBuffer'
    })
    const arrayBuffer = downloadRes.data
    const tempDir = context?.tempDir ?? '/tmp'
    const fileName = `${slug}-${targetVersion.version}.tpex`
    const filePath = `${tempDir}/${fileName}`

    if (typeof process !== 'undefined') {
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
    const listUrl = new URL(`${this.apiBase}/api/store/plugins`)
    listUrl.searchParams.set('compact', '1')

    const res = await networkClient.request<TpexListResponse>({
      method: 'GET',
      url: listUrl.toString()
    })
    const data = res.data
    return data.plugins
  }

  /**
   * Get plugin details by slug
   */
  async getPlugin(slug: string): Promise<TpexDetailResponse['plugin'] | null> {
    const res = await networkClient.request<TpexDetailResponse>({
      method: 'GET',
      url: `${this.apiBase}/api/store/plugins/${slug}`,
      validateStatus: ALL_HTTP_STATUS
    })
    if (res.status < 200 || res.status >= 300) {
      if (res.status === 404)
        return null
      throw new Error(`Failed to fetch plugin: HTTP ${res.status}`)
    }

    const data = res.data
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
