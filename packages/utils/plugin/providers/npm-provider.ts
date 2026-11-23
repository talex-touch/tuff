import type { IManifest } from '..'
import type { NpmRegistryUrlOptions, TuffNpmPackageIcon, TuffNpmPackageMetadata } from '../npm-contract'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext,
} from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { networkClient } from '../../network'
import {
  DEFAULT_NPM_REGISTRY_URL,
  encodeNpmPackagePath,
  extractTuffPackageMetadata,
  hasTuffNpmDiscoveryKeyword,
  inferPluginNameFromNpmPackage,
  isAllowedNpmRegistryUrl,
  isOfficialNpmPluginPackageName,
  isTuffNpmPluginPackageName,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT,
  NPM_PLUGIN_CANONICAL_KEYWORD,
  parseNpmPluginSource,
  resolveNpmRegistryUrl,
} from '../npm-contract'
import { PluginProviderType } from './types'

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

export interface NpmPackageInfo {
  name: string
  version: string
  description?: string
  author?: string | { name: string, email?: string }
  main?: string
  keywords?: string[]
  homepage?: string
  dist?: {
    tarball: string
    shasum?: string
    integrity?: string
    unpackedSize?: number
  }
  tuff?: TuffNpmPackageMetadata | Record<string, unknown>
  tuffPlugin?: Record<string, unknown>
}

export interface NpmPackageVersions {
  'name': string
  'dist-tags': {
    latest: string
    [tag: string]: string
  }
  'versions': Record<string, NpmPackageInfo>
}

export interface NpmProviderSearchOptions {
  scope?: string
  discoveryKeyword?: string
  registry?: string
}

function resolveIconString(icon: string | TuffNpmPackageIcon | undefined): string | undefined {
  if (!icon)
    return undefined
  return typeof icon === 'string' ? icon : icon.value
}

export class NpmProvider implements PluginProvider {
  readonly type = PluginProviderType.NPM
  private registry: string
  private registryOptions: NpmRegistryUrlOptions

  constructor(
    registry: string = DEFAULT_NPM_REGISTRY_URL,
    options: NpmRegistryUrlOptions = {},
  ) {
    this.registryOptions = options
    this.registry = resolveNpmRegistryUrl([registry], options)
  }

  getRegistryUrl(): string {
    return this.registry
  }

  canHandle(request: PluginInstallRequest): boolean {
    return parseNpmPluginSource(request.source, {
      allowAnyBarePackageName: request.hintType === PluginProviderType.NPM,
    }) !== null
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    const parsed = parseNpmPluginSource(request.source, {
      allowAnyBarePackageName: request.hintType === PluginProviderType.NPM,
    })
    if (!parsed) {
      throw new Error(`Invalid NPM source format: ${request.source}`)
    }

    const requestRegistry = typeof request.metadata?.registry === 'string'
      ? request.metadata.registry
      : undefined
    const registry = resolveNpmRegistryUrl([requestRegistry, this.registry], this.registryOptions)

    const { packageName, spec } = parsed
    const packageInfo = await this.getPackageInfo(packageName, spec, registry)

    if (!packageInfo) {
      throw new Error(`Package not found: ${packageName}`)
    }

    const rawTarballUrl = typeof packageInfo.dist?.tarball === 'string'
      ? packageInfo.dist.tarball.trim()
      : ''
    if (!rawTarballUrl) {
      throw new Error(`Package tarball unavailable: ${packageName}@${packageInfo.version}`)
    }

    let parsedTarballUrl: URL
    try {
      parsedTarballUrl = new URL(rawTarballUrl)
    }
    catch {
      throw new Error('PLUGIN_NPM_TARBALL_URL_INVALID')
    }
    if (parsedTarballUrl.username || parsedTarballUrl.password) {
      throw new Error('PLUGIN_NPM_TARBALL_URL_INVALID')
    }
    if (!isAllowedNpmRegistryUrl(parsedTarballUrl.origin, this.registryOptions)) {
      throw new Error('PLUGIN_NPM_TARBALL_URL_DISALLOWED')
    }
    const tarballUrl = parsedTarballUrl.toString()

    const downloadRes = await networkClient.request<ArrayBuffer>({
      method: 'GET',
      url: tarballUrl,
      responseType: 'arrayBuffer',
    })
    const arrayBuffer = downloadRes.data
    const tarballBuffer = Buffer.from(arrayBuffer)

    // Verify SRI integrity (sha512/sha384/sha256) or shasum (sha1) fail-closed before writing to disk.
    if (typeof process !== 'undefined') {
      const crypto = await import('node:crypto')
      const rawIntegrity = typeof packageInfo.dist?.integrity === 'string'
        ? packageInfo.dist.integrity.trim()
        : ''
      const rawShasum = typeof packageInfo.dist?.shasum === 'string'
        ? packageInfo.dist.shasum.trim().toLowerCase()
        : ''

      if (rawIntegrity) {
        const sriTokens = rawIntegrity.split(/\s+/).filter(Boolean)
        const rank: Record<string, number> = { sha512: 3, sha384: 2, sha256: 1 }
        const candidates: Array<{ algo: 'sha512' | 'sha384' | 'sha256', digest: Buffer }> = []
        for (const token of sriTokens) {
          const match = /^(sha512|sha384|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(token)
          if (!match)
            continue
          candidates.push({
            algo: match[1] as 'sha512' | 'sha384' | 'sha256',
            digest: Buffer.from(match[2]!, 'base64'),
          })
        }
        if (candidates.length === 0) {
          throw new Error('PLUGIN_NPM_INTEGRITY_MISMATCH')
        }
        const maxRank = Math.max(...candidates.map(c => rank[c.algo] ?? 0))
        const strongest = candidates.filter(c => (rank[c.algo] ?? 0) === maxRank)
        const matched = strongest.some((candidate) => {
          const actual = crypto.createHash(candidate.algo).update(tarballBuffer).digest()
          return actual.length === candidate.digest.length && crypto.timingSafeEqual(actual, candidate.digest)
        })
        if (!matched) {
          throw new Error('PLUGIN_NPM_INTEGRITY_MISMATCH')
        }
      }
      else if (rawShasum) {
        if (!/^[a-f0-9]{40}$/.test(rawShasum)) {
          throw new Error('PLUGIN_NPM_INTEGRITY_MISMATCH')
        }
        const expected = Buffer.from(rawShasum, 'hex')
        const actual = crypto.createHash('sha1').update(tarballBuffer).digest()
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
          throw new Error('PLUGIN_NPM_INTEGRITY_MISMATCH')
        }
      }
      else {
        throw new Error('PLUGIN_NPM_INTEGRITY_MISMATCH')
      }
    }

    const tempDir = context?.tempDir ?? '/tmp'
    const safePackageName = packageName.replace(/[@/]/g, '-')
    const fileName = `${safePackageName}-${packageInfo.version}.tgz`
    const filePath = `${tempDir}/${fileName}`

    if (typeof process !== 'undefined') {
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, tarballBuffer)
    }

    const authorName = typeof packageInfo.author === 'string'
      ? packageInfo.author
      : packageInfo.author?.name ?? 'Unknown'
    const tuffMeta = extractTuffPackageMetadata(packageInfo)

    const manifest: IManifest = {
      id: tuffMeta?.id ?? packageInfo.name,
      name: tuffMeta?.name ?? inferPluginNameFromNpmPackage(packageInfo.name) ?? packageInfo.name,
      version: packageInfo.version,
      ...(tuffMeta?.sdkapi !== undefined ? { sdkapi: tuffMeta.sdkapi } : {}),
      ...(tuffMeta?.category ? { category: tuffMeta.category } : {}),
      description: packageInfo.description ?? '',
      author: authorName,
      main: packageInfo.main ?? 'index.js',
      icon: resolveIconString(tuffMeta?.icon),
      activationKeywords: tuffMeta?.activationKeywords ?? packageInfo.keywords,
    }

    return {
      provider: PluginProviderType.NPM,
      filePath,
      // Naming scope alone never confers cryptographic official trust; Nexus attestation is required.
      official: false,
      manifest,
      metadata: {
        packageName: packageInfo.name,
        version: packageInfo.version,
        ...(spec ? { requestedSpec: spec } : {}),
        registry,
        officialScope: isOfficialNpmPluginPackageName(packageInfo.name),
        tarball: tarballUrl,
        ...(packageInfo.dist?.shasum ? { shasum: packageInfo.dist.shasum } : {}),
        ...(packageInfo.dist?.integrity ? { integrity: packageInfo.dist.integrity } : {}),
        ...(tuffMeta ? { tuff: tuffMeta } : {}),
      },
    }
  }

  /**
   * Get package info from npm registry
   */
  async getPackageInfo(
    packageName: string,
    versionOrSpec?: string,
    registryOverride?: string,
  ): Promise<NpmPackageInfo | null> {
    const encodedName = encodeNpmPackagePath(packageName)
    const registry = resolveNpmRegistryUrl([registryOverride, this.registry], this.registryOptions)

    const res = await networkClient.request<NpmPackageVersions>({
      method: 'GET',
      url: `${registry}/${encodedName}`,
      headers: {
        Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT,
      },
      validateStatus: ALL_HTTP_STATUS,
    })

    if (res.status < 200 || res.status >= 300) {
      if (res.status === 404)
        return null
      throw new Error(`Failed to fetch package info: HTTP ${res.status}`)
    }

    const data = res.data
    const rawDistTags = data?.['dist-tags']
    const distTags: Record<string, unknown> = rawDistTags && typeof rawDistTags === 'object'
      ? (rawDistTags as Record<string, unknown>)
      : {}
    const resolveTag = (tag: string): string | undefined => {
      if (!Object.prototype.hasOwnProperty.call(distTags, tag))
        return undefined
      const value = distTags[tag]
      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    }

    const targetVersion = !versionOrSpec
      ? resolveTag('latest')
      : (resolveTag(versionOrSpec) ?? versionOrSpec)

    if (!targetVersion)
      return null

    const versions = data?.versions
    if (!versions || typeof versions !== 'object' || !Object.prototype.hasOwnProperty.call(versions, targetVersion))
      return null

    return versions[targetVersion] ?? null
  }

  /**
   * Search for Tuff plugins on npm
   */
  async searchPlugins(
    keyword?: string,
    options: NpmProviderSearchOptions = {},
  ): Promise<NpmPackageInfo[]> {
    const registry = resolveNpmRegistryUrl([options.registry, this.registry], this.registryOptions)
    const discoveryKeyword = options.discoveryKeyword?.trim() || NPM_PLUGIN_CANONICAL_KEYWORD
    const scope = options.scope?.trim().replace(/^@/, '')
    const searchTerms = [
      scope ? `scope:${scope}` : '',
      `keywords:${discoveryKeyword}`,
      keyword?.trim() ?? '',
    ].filter(Boolean).join(' ')

    const res = await networkClient.request<{
      objects?: Array<{ package: NpmPackageInfo }>
    }>({
      method: 'GET',
      url: `${registry}/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=100`,
      validateStatus: ALL_HTTP_STATUS,
    })

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to search packages: HTTP ${res.status}`)
    }

    const objects = Array.isArray(res.data?.objects) ? res.data.objects : []
    return objects
      .map(obj => obj.package)
      .filter(pkg =>
        Boolean(pkg?.name)
        && (isTuffNpmPluginPackageName(pkg.name) || hasTuffNpmDiscoveryKeyword(pkg.keywords)),
      )
  }

  /**
   * List all available Tuff plugins from npm
   */
  async listPlugins(options: NpmProviderSearchOptions = {}): Promise<NpmPackageInfo[]> {
    return this.searchPlugins(undefined, options)
  }
}

export const npmProvider = new NpmProvider()
