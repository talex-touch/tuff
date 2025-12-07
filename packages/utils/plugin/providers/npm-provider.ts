import type { IManifest } from '..'
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext,
} from './types'
import { PluginProviderType } from './types'

const NPM_REGISTRY = 'https://registry.npmjs.org'
const TUFF_PLUGIN_PREFIX = 'tuff-plugin-'
const TUFF_PLUGIN_SCOPE = '@tuff/'

export interface NpmPackageInfo {
  name: string
  version: string
  description?: string
  author?: string | { name: string, email?: string }
  main?: string
  keywords?: string[]
  dist: {
    tarball: string
    shasum: string
    integrity?: string
  }
  tuff?: {
    icon?: string
    activationKeywords?: string[]
  }
}

export interface NpmPackageVersions {
  name: string
  'dist-tags': {
    latest: string
    [tag: string]: string
  }
  versions: Record<string, NpmPackageInfo>
}

/**
 * Parse NPM source string to extract package name and optional version
 * Formats:
 * - "npm:package-name"
 * - "npm:package-name@version"
 * - "npm:@scope/package-name"
 * - "npm:@scope/package-name@version"
 * - "tuff-plugin-xxx" (when hintType is NPM)
 * - "@tuff/xxx" (when hintType is NPM)
 */
function parseNpmSource(source: string): { packageName: string, version?: string } | null {
  const npmMatch = source.match(/^npm:(@?[a-z0-9][\w\-.]*(?:\/[a-z0-9][\w\-.]*)?)(?:@(.+))?$/i)
  if (npmMatch) {
    return { packageName: npmMatch[1], version: npmMatch[2] }
  }

  const scopedMatch = source.match(/^(@tuff\/[a-z0-9][\w\-.]*)(?:@(.+))?$/i)
  if (scopedMatch) {
    return { packageName: scopedMatch[1], version: scopedMatch[2] }
  }

  const prefixMatch = source.match(/^(tuff-plugin-[a-z0-9][\w\-.]*)(?:@(.+))?$/i)
  if (prefixMatch) {
    return { packageName: prefixMatch[1], version: prefixMatch[2] }
  }

  return null
}

/**
 * Check if a package name looks like a Tuff plugin
 */
function isTuffPluginPackage(name: string): boolean {
  return name.startsWith(TUFF_PLUGIN_PREFIX) || name.startsWith(TUFF_PLUGIN_SCOPE)
}

export class NpmProvider implements PluginProvider {
  readonly type = PluginProviderType.NPM
  private registry: string

  constructor(registry: string = NPM_REGISTRY) {
    this.registry = registry.replace(/\/$/, '')
  }

  canHandle(request: PluginInstallRequest): boolean {
    if (request.hintType === PluginProviderType.NPM) {
      return parseNpmSource(request.source) !== null
    }

    if (request.source.startsWith('npm:')) {
      return true
    }

    const parsed = parseNpmSource(request.source)
    return parsed !== null && isTuffPluginPackage(parsed.packageName)
  }

  async install(
    request: PluginInstallRequest,
    context?: PluginProviderContext,
  ): Promise<PluginInstallResult> {
    const parsed = parseNpmSource(request.source)
    if (!parsed) {
      throw new Error(`Invalid NPM source format: ${request.source}`)
    }

    const { packageName, version } = parsed
    const packageInfo = await this.getPackageInfo(packageName, version)

    if (!packageInfo) {
      throw new Error(`Package not found: ${packageName}`)
    }

    const tarballUrl = packageInfo.dist.tarball
    const downloadRes = await fetch(tarballUrl)
    if (!downloadRes.ok) {
      throw new Error(`Failed to download package: ${downloadRes.statusText}`)
    }

    const arrayBuffer = await downloadRes.arrayBuffer()
    const tempDir = context?.tempDir ?? '/tmp'
    const safePackageName = packageName.replace(/[@/]/g, '-')
    const fileName = `${safePackageName}-${packageInfo.version}.tgz`
    const filePath = `${tempDir}/${fileName}`

    if (typeof globalThis.process !== 'undefined') {
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, Buffer.from(arrayBuffer))
    }

    const authorName = typeof packageInfo.author === 'string'
      ? packageInfo.author
      : packageInfo.author?.name ?? 'Unknown'

    const manifest: IManifest = {
      id: packageInfo.name,
      name: packageInfo.name.replace(TUFF_PLUGIN_PREFIX, '').replace(TUFF_PLUGIN_SCOPE, ''),
      version: packageInfo.version,
      description: packageInfo.description ?? '',
      author: authorName,
      main: packageInfo.main ?? 'index.js',
      icon: packageInfo.tuff?.icon,
      activationKeywords: packageInfo.tuff?.activationKeywords ?? packageInfo.keywords,
    }

    return {
      provider: PluginProviderType.NPM,
      filePath,
      official: packageName.startsWith(TUFF_PLUGIN_SCOPE),
      manifest,
      metadata: {
        packageName: packageInfo.name,
        version: packageInfo.version,
        tarball: tarballUrl,
        shasum: packageInfo.dist.shasum,
        integrity: packageInfo.dist.integrity,
      },
    }
  }

  /**
   * Get package info from npm registry
   */
  async getPackageInfo(packageName: string, version?: string): Promise<NpmPackageInfo | null> {
    const encodedName = encodeURIComponent(packageName).replace('%40', '@')
    const res = await fetch(`${this.registry}/${encodedName}`)

    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`Failed to fetch package info: ${res.statusText}`)
    }

    const data: NpmPackageVersions = await res.json()
    const targetVersion = version ?? data['dist-tags'].latest

    return data.versions[targetVersion] ?? null
  }

  /**
   * Search for Tuff plugins on npm
   */
  async searchPlugins(keyword?: string): Promise<NpmPackageInfo[]> {
    const searchTerms = [
      `keywords:tuff-plugin`,
      keyword ? `${keyword}` : '',
    ].filter(Boolean).join('+')

    const res = await fetch(
      `${this.registry}/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=100`,
    )

    if (!res.ok) {
      throw new Error(`Failed to search packages: ${res.statusText}`)
    }

    const data = await res.json() as {
      objects: Array<{ package: NpmPackageInfo }>
    }

    return data.objects
      .map(obj => obj.package)
      .filter(pkg => isTuffPluginPackage(pkg.name))
  }

  /**
   * List all available Tuff plugins from npm
   */
  async listPlugins(): Promise<NpmPackageInfo[]> {
    return this.searchPlugins()
  }
}

export const npmProvider = new NpmProvider()
