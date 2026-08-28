import type { IManifest } from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext
} from '@talex-touch/utils/plugin/providers'
import type { TpexDetailResponse } from '@talex-touch/utils/plugin/providers/tpex-provider'
import os from 'node:os'
import path from 'node:path'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import compressing from 'compressing'
import fse from 'fs-extra'
import { getEnabledApiSources } from '../../../service/store-api.service'
import { getNetworkService } from '../../network'
import { getRuntimeNexusBaseUrl } from '../../nexus/runtime-base'
import { createProviderLogger } from './logger'
import { downloadToTempFile, mergeHeadersCaseInsensitive, stripAuthorizationHeader } from './utils'

const tpexProviderLog = createProviderLogger(PluginProviderType.TPEX)

function hasAuthorizationHeader(headers: Readonly<Record<string, string>>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

/**
 * Get the primary tpexApi base URL from user-configured sources
 */
function getPrimaryApiBase(): string {
  try {
    const sources = getEnabledApiSources()
      .filter((s) => s.type === 'tpexApi')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    if (sources.length > 0 && sources[0]!.url) {
      return sources[0]!.url.replace(/\/$/, '')
    }
  } catch {
    // Storage not ready yet, use default
  }
  return getRuntimeNexusBaseUrl()
}

async function peekTpexManifest(tpexPath: string): Promise<IManifest | undefined> {
  const tempDir = path.join(os.tmpdir(), `talex-tpex-preview-${Date.now()}`)
  try {
    await fse.ensureDir(tempDir)
    await compressing.tar.uncompress(tpexPath, tempDir)
    const manifestPath = path.join(tempDir, 'manifest.json')
    if (!(await fse.pathExists(manifestPath))) return undefined
    const manifestContent = await fse.readJSON(manifestPath)
    return manifestContent as IManifest
  } catch (error) {
    tpexProviderLog.warn('Failed to peek manifest', { error })
    return undefined
  } finally {
    await fse.rm(tempDir, { recursive: true, force: true })
  }
}

function isTpexFile(source: string): boolean {
  const trimmed = source.trim()
  if (trimmed.toLowerCase().endsWith('.tpex')) return true

  try {
    const parsed = new URL(trimmed)
    return parsed.pathname.toLowerCase().endsWith('.tpex')
  } catch {
    return false
  }
}

function isRemote(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

function isTpexSlug(source: string): boolean {
  return source.startsWith('tpex:') || /^[a-z0-9][\w\-.]{1,62}[a-z0-9]$/i.test(source)
}

/**
 * Parse TPEX source string to extract slug and optional version
 * Formats: "tpex:slug", "tpex:slug@version", "slug" (when hintType is TPEX)
 */
function parseTpexSource(source: string): { slug: string; version?: string } | null {
  const tpexMatch = source.match(/^tpex:([a-z0-9][\w\-.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (tpexMatch) {
    return { slug: tpexMatch[1], version: tpexMatch[2] }
  }

  const slugMatch = source.match(/^([a-z0-9][\w\-.]{1,62}[a-z0-9])(?:@(.+))?$/i)
  if (slugMatch) {
    return { slug: slugMatch[1], version: slugMatch[2] }
  }

  return null
}

/**
 * TPEX Plugin Provider for core-app
 * Handles both .tpex files and tpex:slug format from official registry
 */
export interface TpexPluginProviderOptions {
  apiBase?: string
  channel?: 'RELEASE' | 'BETA'
  getRequestHeaders?: () => Record<string, string>
}

export class TpexPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.TPEX
  private readonly log = tpexProviderLog

  constructor(private readonly options: TpexPluginProviderOptions = {}) {}

  private getExplicitRequestHeaders(
    requestHeaders?: Readonly<Record<string, string>>
  ): Record<string, string> {
    return mergeHeadersCaseInsensitive(this.options.getRequestHeaders?.(), requestHeaders)
  }

  private async resolveRequestHeaders(
    requestUrl: URL,
    headers: Readonly<Record<string, string>>
  ): Promise<Record<string, string>> {
    const resolvedHeaders = mergeHeadersCaseInsensitive(headers)
    if (hasAuthorizationHeader(resolvedHeaders)) return resolvedHeaders
    if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return resolvedHeaders

    let runtimeUrl: URL
    try {
      runtimeUrl = new URL(getRuntimeNexusBaseUrl())
    } catch {
      return resolvedHeaders
    }
    if (runtimeUrl.protocol !== 'http:' && runtimeUrl.protocol !== 'https:') return resolvedHeaders
    if (requestUrl.origin !== runtimeUrl.origin) return resolvedHeaders

    const { getAuthToken } = await import('../../auth')
    const token = getAuthToken()
    if (token) resolvedHeaders.Authorization = `Bearer ${token}`
    return resolvedHeaders
  }

  /** Get the primary tpexApi base URL from user-configured sources */
  private get apiBase(): string {
    return this.options.apiBase?.replace(/\/$/, '') ?? getPrimaryApiBase()
  }

  canHandle(request: PluginInstallRequest): boolean {
    // Handle .tpex file paths
    if (isTpexFile(request.source)) {
      return true
    }
    // Handle tpex:slug format or hint type
    if (request.hintType === PluginProviderType.TPEX) {
      return isTpexSlug(request.source)
    }
    return request.source.startsWith('tpex:')
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    this.log.info('Processing TPEX plugin resource', {
      meta: { sourceType: isTpexFile(request.source) ? 'package' : 'registry' }
    })

    // Handle tpex:slug format - fetch from registry using Node.js stream download
    if (!isTpexFile(request.source)) {
      return this.installFromRegistry(request, context)
    }

    // Handle .tpex file directly
    try {
      let filePath = request.source

      if (isRemote(request.source)) {
        this.log.debug('Detected remote TPEX resource, starting download')
        const requestHeaders = this.getExplicitRequestHeaders(context?.downloadOptions?.headers)
        filePath = await downloadToTempFile(request.source, '.tpex', {
          ...context?.downloadOptions,
          headers: requestHeaders,
          resolveHeadersForUrl: (requestUrl, headers) =>
            this.resolveRequestHeaders(requestUrl, headers)
        })
      } else {
        filePath = path.resolve(request.source)
        const exists = await fse.pathExists(filePath)
        if (!exists) {
          this.log.error('Local TPEX file not found')
          throw new Error('Specified TPEX file does not exist')
        }
      }

      const manifest = await peekTpexManifest(filePath)
      if (!manifest) {
        this.log.warn('Failed to parse manifest from TPEX package')
      } else {
        this.log.debug('Successfully parsed TPEX manifest', {
          meta: {
            name: manifest.name ?? 'unknown',
            version: manifest.version ?? 'unknown'
          }
        })
      }

      const official = typeof manifest?.author === 'string' && /talex-touch/i.test(manifest.author)

      this.log.success('TPEX plugin prepared', {
        meta: { official: official ? 'true' : 'false' }
      })

      return {
        provider: this.type,
        official,
        filePath,
        manifest,
        metadata: {
          sourceType: 'file',
          icon: manifest?.icon,
          name: manifest?.name,
          version: manifest?.version
        }
      }
    } catch (error) {
      this.log.error('TPEX plugin processing failed', { error })
      throw error
    }
  }

  /**
   * Install from TPEX registry (tpex:slug format) using Node.js stream download
   */
  private async installFromRegistry(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult> {
    const parsed = parseTpexSource(request.source)
    if (!parsed) {
      throw new Error(`Invalid TPEX source format: ${request.source}`)
    }

    const { slug, version } = parsed

    this.log.debug('Detected TPEX registry format, fetching from source', {
      meta: { slug, version: version ?? 'latest' }
    })

    const detailUrl = new URL(`/api/store/plugins/${encodeURIComponent(slug)}`, `${this.apiBase}/`)
    const requestedChannel =
      request.metadata?.channel === 'BETA' ? 'BETA' : (this.options.channel ?? 'RELEASE')
    if (requestedChannel === 'BETA') detailUrl.searchParams.set('channel', 'BETA')
    const providerHeaders = this.getExplicitRequestHeaders()
    const requestHeaders = await this.resolveRequestHeaders(detailUrl, providerHeaders)
    this.log.debug('Fetching plugin details', {
      meta: { slug, channel: requestedChannel }
    })

    const detailRes = await getNetworkService().requestNoRedirect<TpexDetailResponse>({
      method: 'GET',
      url: detailUrl.toString(),
      timeoutMs: 30_000,
      responseType: 'json',
      headers: requestHeaders,
      validateStatus: [200, 404]
    })
    if (detailRes.status !== 200) {
      if (detailRes.status === 404) {
        throw new Error(`Plugin not found: ${slug}`)
      }
      throw new Error(`Failed to fetch plugin details: ${detailRes.statusText}`)
    }

    const detail: TpexDetailResponse = detailRes.data
    const plugin = detail.plugin

    let targetVersion = plugin.latestVersion
    if (version && plugin.versions) {
      targetVersion = plugin.versions.find((v) => v.version === version) ?? targetVersion
    }

    if (!targetVersion?.packageUrl) {
      throw new Error(`No downloadable version found for plugin: ${slug}`)
    }

    // Construct full download URL
    const parsedDownloadUrl = new URL(targetVersion.packageUrl, `${this.apiBase}/`)
    const downloadUrl = parsedDownloadUrl.toString()

    this.log.debug('Starting plugin package download', {
      meta: {
        slug,
        channel: targetVersion.channel,
        version: targetVersion.version,
        size: targetVersion.packageSize
      }
    })

    const packageProviderHeaders =
      parsedDownloadUrl.origin === detailUrl.origin
        ? providerHeaders
        : stripAuthorizationHeader(providerHeaders)
    const downloadHeaders = mergeHeadersCaseInsensitive(
      packageProviderHeaders,
      context?.downloadOptions?.headers
    )

    // Use Node.js stream download instead of fetch + arrayBuffer
    const filePath = await downloadToTempFile(downloadUrl, '.tpex', {
      ...context?.downloadOptions,
      headers: downloadHeaders,
      resolveHeadersForUrl: (requestUrl, headers) => this.resolveRequestHeaders(requestUrl, headers)
    })

    // Peek manifest from downloaded file
    let manifest = await peekTpexManifest(filePath)

    // If peek failed but we have manifest from API, use that
    if (!manifest && targetVersion.manifest) {
      manifest = {
        id: plugin.slug,
        name: plugin.name,
        version: targetVersion.version,
        description: plugin.summary,
        author: plugin.author?.name ?? 'Unknown',
        main: ((targetVersion.manifest as Record<string, unknown>).main as string) ?? 'index.js',
        icon: plugin.iconUrl ?? undefined,
        ...targetVersion.manifest
      } as IManifest
    }

    this.log.success('TPEX plugin fetched from registry', {
      meta: {
        slug,
        official: plugin.isOfficial ? 'true' : 'false',
        version: targetVersion.version
      }
    })

    return {
      provider: PluginProviderType.TPEX,
      filePath,
      official: plugin.isOfficial,
      manifest,
      metadata: {
        sourceType: 'registry',
        slug: plugin.slug,
        pluginId: targetVersion.nexusAttestation.payload.pluginId,
        pluginName: targetVersion.nexusAttestation.payload.pluginName,
        version: targetVersion.version,
        channel: targetVersion.channel,
        packageSize: targetVersion.packageSize,
        artifactSha256: targetVersion.artifactSha256,
        nexusAttestation: targetVersion.nexusAttestation,
        installs: plugin.installs
      }
    }
  }
}
