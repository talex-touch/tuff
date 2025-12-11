import type { IManifest } from '@talex-touch/utils/plugin'
import type { PluginInstallRequest, PluginInstallResult, PluginProvider, PluginProviderContext } from '@talex-touch/utils/plugin/providers'
import type { TpexDetailResponse } from '@talex-touch/utils/plugin/providers/tpex-provider'
import os from 'node:os'
import path from 'node:path'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import compressing from 'compressing'
import fse from 'fs-extra'
import { getEnabledApiSources } from '../../../service/market-api.service'
import { createProviderLogger } from './logger'
import { downloadToTempFile } from './utils'

const DEFAULT_TPEX_API = 'https://tuff.tagzxia.com'

/**
 * Get the primary tpexApi base URL from user-configured sources
 */
function getPrimaryApiBase(): string {
  try {
    const sources = getEnabledApiSources()
      .filter(s => s.type === 'tpexApi')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    if (sources.length > 0 && sources[0]!.url) {
      return sources[0]!.url.replace(/\/$/, '')
    }
  }
  catch {
    // Storage not ready yet, use default
  }
  return DEFAULT_TPEX_API
}

async function peekTpexManifest(tpexPath: string): Promise<IManifest | undefined> {
  const tempDir = path.join(os.tmpdir(), `talex-tpex-preview-${Date.now()}`)
  try {
    await fse.ensureDir(tempDir)
    await compressing.tar.uncompress(tpexPath, tempDir)
    const manifestPath = path.join(tempDir, 'manifest.json')
    if (!(await fse.pathExists(manifestPath)))
      return undefined
    const manifestContent = await fse.readJSON(manifestPath)
    return manifestContent as IManifest
  }
  catch (error) {
    console.warn('[TpexProvider] Failed to peek manifest:', error)
    return undefined
  }
  finally {
    await fse.rm(tempDir, { recursive: true, force: true })
  }
}

function isTpexFile(source: string): boolean {
  return source.trim().toLowerCase().endsWith('.tpex')
}

function isRemote(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

function isTpexSlug(source: string): boolean {
  return source.startsWith('tpex:') || /^[a-z0-9][a-z0-9\-_.]{1,62}[a-z0-9]$/i.test(source)
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

/**
 * TPEX Plugin Provider for core-app
 * Handles both .tpex files and tpex:slug format from official registry
 */
export class TpexPluginProvider implements PluginProvider {
  readonly type = PluginProviderType.TPEX
  private readonly log = createProviderLogger(this.type)

  /** Get API base URL dynamically from user-configured sources */
  private get apiBase(): string {
    return getPrimaryApiBase()
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
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    this.log.info('Processing TPEX plugin resource', {
      meta: { source: request.source },
    })

    // Handle tpex:slug format - fetch from registry using Node.js stream download
    if (!isTpexFile(request.source)) {
      return this.installFromRegistry(request, context)
    }

    // Handle .tpex file directly
    try {
      let filePath = request.source

      if (isRemote(request.source)) {
        this.log.debug('Detected remote TPEX resource, starting download', {
          meta: { url: request.source },
        })
        filePath = await downloadToTempFile(request.source, '.tpex', context?.downloadOptions)
      }
      else {
        filePath = path.resolve(request.source)
        const exists = await fse.pathExists(filePath)
        if (!exists) {
          this.log.error('Local TPEX file not found', {
            meta: { filePath },
          })
          throw new Error('Specified TPEX file does not exist')
        }
      }

      const manifest = await peekTpexManifest(filePath)
      if (!manifest) {
        this.log.warn('Failed to parse manifest from TPEX package', {
          meta: { filePath },
        })
      }
      else {
        this.log.debug('Successfully parsed TPEX manifest', {
          meta: {
            name: manifest.name ?? 'unknown',
            version: manifest.version ?? 'unknown',
          },
        })
      }

      const official = typeof manifest?.author === 'string' && /talex-touch/i.test(manifest.author)

      this.log.success('TPEX plugin prepared', {
        meta: {
          filePath,
          official: official ? 'true' : 'false',
        },
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
          version: manifest?.version,
        },
      }
    }
    catch (error) {
      this.log.error('TPEX plugin processing failed', {
        meta: { source: request.source },
        error,
      })
      throw error
    }
  }

  /**
   * Install from TPEX registry (tpex:slug format) using Node.js stream download
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

    this.log.debug('Detected TPEX registry format, fetching from source', {
      meta: { source: request.source, slug, version: version ?? 'latest' },
    })

    // Fetch plugin details from API
    const detailUrl = `${this.apiBase}/api/market/plugins/${slug}`
    this.log.debug('Fetching plugin details', { meta: { url: detailUrl } })

    const detailRes = await fetch(detailUrl)
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

    // Construct full download URL
    const downloadUrl = targetVersion.packageUrl.startsWith('http')
      ? targetVersion.packageUrl
      : `${this.apiBase}${targetVersion.packageUrl}`

    this.log.debug('Starting plugin package download', {
      meta: {
        url: downloadUrl,
        version: targetVersion.version,
        size: targetVersion.packageSize,
      },
    })

    // Use Node.js stream download instead of fetch + arrayBuffer
    const filePath = await downloadToTempFile(downloadUrl, '.tpex', context?.downloadOptions)

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
        main: (targetVersion.manifest as Record<string, unknown>).main as string ?? 'index.js',
        icon: plugin.iconUrl ?? undefined,
        ...targetVersion.manifest,
      } as IManifest
    }

    this.log.success('TPEX plugin fetched from registry', {
      meta: {
        filePath,
        official: plugin.isOfficial ? 'true' : 'false',
        version: targetVersion.version,
      },
    })

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
        signature: targetVersion.signature,
        installs: plugin.installs,
      },
    }
  }
}
