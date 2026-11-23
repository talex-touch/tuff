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

    const tarballUrl = packageInfo.dist?.tarball
    if (!tarballUrl) {
      throw new Error(`Package tarball unavailable: ${packageName}@${packageInfo.version}`)
    }

    const downloadRes = await networkClient.request<ArrayBuffer>({
      method: 'GET',
      url: tarballUrl,
      responseType: 'arrayBuffer',
    })
    const arrayBuffer = downloadRes.data
    const tempDir = context?.tempDir ?? '/tmp'
    const safePackageName = packageName.replace(/[@/]/g, '-')
    const fileName = `${safePackageName}-${packageInfo.version}.tgz`
    const filePath = `${tempDir}/${fileName}`

    if (typeof process !== 'undefined') {
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, Buffer.from(arrayBuffer))
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
    const distTags = data['dist-tags'] ?? {}
    const targetVersion = !versionOrSpec
      ? distTags.latest
      : distTags[versionOrSpec] ?? versionOrSpec

    if (!targetVersion)
      return null

    return data.versions?.[targetVersion] ?? null
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
