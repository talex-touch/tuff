import type { TuffNpmLocalizedText, TuffNpmPackageMetadata } from '@talex-touch/utils/plugin'
import type {
  StoreInstallInstruction,
  StorePlugin,
  StoreProviderDefinition,
  StoreProviderListOptions
} from '@talex-touch/utils/store'
import {
  DEFAULT_NPM_REGISTRY_URL,
  encodeNpmPackagePath,
  extractTuffPackageMetadata,
  hasTuffNpmDiscoveryKeyword,
  inferPluginNameFromNpmPackage,
  isOfficialNpmPluginPackageName,
  isTuffNpmDiscoveryKeyword,
  isTuffNpmPluginPackageName,
  isValidNpmPackageName,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT,
  NPM_PLUGIN_CANONICAL_KEYWORD,
  resolveNpmRegistryUrl
} from '@talex-touch/utils/plugin'
import { createRendererLogger } from '~/utils/renderer-log'
import { BaseStoreProvider } from './base-provider'
import { normalizeStoreIcon } from './store-icon-normalizer'

const npmPackageProviderLog = createRendererLogger('NpmPackageProvider')

const MAX_PACKUMENT_CONCURRENCY = 6
const MAX_SEARCH_PACKAGES = 50
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const SEARCH_TIMEOUT_MS = 15_000
const PACKUMENT_TIMEOUT_MS = 10_000

type NpmStoreInstallInstruction = Extract<StoreInstallInstruction, { type: 'npm' }> & {
  distTag?: string
}

interface NpmPackageAuthor {
  name?: string
  email?: string
}

interface NpmRepositoryInfo {
  type?: string
  url?: string
}

interface NpmVersionMetadata {
  name?: string
  version: string
  description?: string
  author?: string | NpmPackageAuthor
  keywords?: string[]
  homepage?: string
  repository?: string | NpmRepositoryInfo
  deprecated?: string | boolean
  tuff?: TuffNpmPackageMetadata | Record<string, unknown>
  tuffPlugin?: Record<string, unknown>
  dist?: {
    tarball?: string
    integrity?: string
    shasum?: string
    unpackedSize?: number
  }
}

interface NpmPackument {
  name?: string
  description?: string
  modified?: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmVersionMetadata>
  time?: Record<string, string>
  author?: string | NpmPackageAuthor
  keywords?: string[]
  homepage?: string
  repository?: string | NpmRepositoryInfo
  tuff?: TuffNpmPackageMetadata | Record<string, unknown>
  tuffPlugin?: Record<string, unknown>
}

interface NpmSearchPackage {
  name: string
  version: string
  description?: string
  keywords?: string[]
  date?: string
  author?: string | NpmPackageAuthor
  publisher?: {
    username?: string
    email?: string
  }
  links?: {
    npm?: string
    homepage?: string
    repository?: string
  }
}

interface NpmSearchResult {
  objects?: Array<{
    package?: NpmSearchPackage
    score?: {
      final?: number
    }
  }>
  total?: number
}

interface CachedListEntry {
  expiresAt: number
  plugins: StorePlugin[]
}

interface CachedPackumentEntry {
  expiresAt: number
  data: NpmPackument | null
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function extractAuthorName(
  author?: string | NpmPackageAuthor,
  publisher?: { username?: string }
): string {
  if (typeof author === 'string') {
    return author.trim()
  }
  if (author && typeof author.name === 'string' && author.name.trim()) {
    return author.name.trim()
  }
  if (publisher && typeof publisher.username === 'string' && publisher.username.trim()) {
    return publisher.username.trim()
  }
  return ''
}

function extractRepositoryUrl(repo?: string | NpmRepositoryInfo): string | undefined {
  if (typeof repo === 'string') {
    return readTrimmedString(repo)
  }
  if (repo && typeof repo.url === 'string') {
    return readTrimmedString(repo.url)
  }
  return undefined
}

function resolveDisplayName(displayName: TuffNpmLocalizedText | undefined): string | undefined {
  if (!displayName) return undefined
  if (typeof displayName === 'string') {
    return readTrimmedString(displayName)
  }
  if (typeof displayName !== 'object' || Array.isArray(displayName)) {
    return undefined
  }

  const record = displayName as Record<string, unknown>
  const defaultValue = readTrimmedString(record.default)
  if (defaultValue) return defaultValue

  if (record.locales && typeof record.locales === 'object' && !Array.isArray(record.locales)) {
    const locales = record.locales as Record<string, unknown>
    for (const key of ['en-US', 'en', 'zh-CN', 'zh']) {
      const value = readTrimmedString(locales[key])
      if (value) return value
    }
    for (const value of Object.values(locales)) {
      const candidate = readTrimmedString(value)
      if (candidate) return candidate
    }
  }

  for (const key of ['en', 'en-US', 'zh', 'zh-CN']) {
    const value = readTrimmedString(record[key])
    if (value) return value
  }
  for (const value of Object.values(record)) {
    const candidate = readTrimmedString(value)
    if (candidate) return candidate
  }

  return undefined
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

function resolveAllowLocalHttp(definition: StoreProviderDefinition): boolean {
  if (definition.config?.allowLocalHttp === false) {
    return false
  }
  const env = (import.meta as { env?: Record<string, unknown> }).env
  return Boolean(env?.DEV) || env?.MODE === 'test'
}

function resolveCacheTtlMs(definition: StoreProviderDefinition): number {
  const configured = definition.config?.cacheTtlMs
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return configured
  }
  return DEFAULT_CACHE_TTL_MS
}

/**
 * NPM Package Provider
 *
 * Fetches Tuff plugins from an NPM registry using abbreviated packuments,
 * bounded concurrency (max 6), and TTL caching.
 *
 * Configuration:
 * - config.registryUrl || url: NPM registry URL (default: https://registry.npmjs.org)
 * - config.scope: Optional npm scope to filter (e.g. `@talex-touch` or `talex-touch`)
 * - config.keyword: Discovery keyword (default: `tuff-plugin`)
 * - config.distTag: Preferred dist-tag (default: `latest`)
 * - config.cacheTtlMs: Optional TTL cache duration in ms (default: 300000)
 */
export class NpmPackageProvider extends BaseStoreProvider {
  private readonly listCache = new Map<string, CachedListEntry>()
  private readonly packumentCache = new Map<string, CachedPackumentEntry>()

  private resolveRegistryUrl(): string {
    const configRegistry = readTrimmedString(this.definition.config?.registryUrl)
    const definitionUrl = readTrimmedString(this.definition.url)
    return resolveNpmRegistryUrl([configRegistry, definitionUrl, DEFAULT_NPM_REGISTRY_URL], {
      allowLocalHttp: resolveAllowLocalHttp(this.definition)
    })
  }

  private resolveDistTag(): string {
    return readTrimmedString(this.definition.config?.distTag) ?? 'latest'
  }

  private resolveDiscoveryKeyword(): string {
    return readTrimmedString(this.definition.config?.keyword) ?? NPM_PLUGIN_CANONICAL_KEYWORD
  }

  private resolveScope(): string | undefined {
    const raw = readTrimmedString(this.definition.config?.scope)
    if (!raw) return undefined
    const stripped = raw.replace(/^@/, '').trim()
    return stripped || undefined
  }

  /**
   * List plugins from NPM registry.
   */
  async list(options: StoreProviderListOptions = {}): Promise<StorePlugin[]> {
    const registry = this.resolveRegistryUrl()
    const discoveryKeyword = this.resolveDiscoveryKeyword()
    const queryKeyword = readTrimmedString(options.keyword)
    const scope = this.resolveScope()
    const distTag = this.resolveDistTag()
    const force = options.force === true
    const ttlMs = resolveCacheTtlMs(this.definition)

    const cacheKey = JSON.stringify({
      registry,
      discoveryKeyword,
      queryKeyword: queryKeyword ?? '',
      scope: scope ?? '',
      distTag
    })

    const now = Date.now()
    if (!force) {
      const cached = this.listCache.get(cacheKey)
      if (cached && cached.expiresAt > now) {
        return [...cached.plugins]
      }
    }

    const packages = await this.searchPackages({
      registry,
      discoveryKeyword,
      queryKeyword,
      scope
    })

    const limitedPackages = packages.slice(0, MAX_SEARCH_PACKAGES)
    const resolvedPlugins = await mapWithConcurrency(
      limitedPackages,
      MAX_PACKUMENT_CONCURRENCY,
      async (pkg) => {
        try {
          return await this.fetchPackageAsPlugin(pkg, {
            registry,
            distTag,
            force,
            ttlMs
          })
        } catch (error) {
          npmPackageProviderLog.warn(`Failed to fetch ${pkg.name}:`, error)
          return null
        }
      }
    )

    const plugins = resolvedPlugins.filter((plugin): plugin is StorePlugin => plugin !== null)

    this.listCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      plugins
    })

    return [...plugins]
  }

  /**
   * Search NPM registry for candidate Tuff plugin packages.
   */
  private async searchPackages(params: {
    registry: string
    discoveryKeyword: string
    queryKeyword?: string
    scope?: string
  }): Promise<NpmSearchPackage[]> {
    const { registry, discoveryKeyword, queryKeyword, scope } = params
    const effectiveDiscoveryKeyword =
      queryKeyword && isTuffNpmDiscoveryKeyword(queryKeyword) ? queryKeyword : discoveryKeyword
    const extraQuery =
      queryKeyword && !isTuffNpmDiscoveryKeyword(queryKeyword) ? queryKeyword : undefined

    const searchTerms = [
      scope ? `scope:${scope}` : '',
      `keywords:${effectiveDiscoveryKeyword}`,
      extraQuery ?? ''
    ]
      .filter(Boolean)
      .join(' ')

    const searchUrl = `${registry}/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=100`

    const response = await this.request<NpmSearchResult>({
      url: searchUrl,
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      timeout: SEARCH_TIMEOUT_MS
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`STORE_NPM_SEARCH_FAILED: HTTP ${response.status}`)
    }

    const objects = Array.isArray(response.data?.objects) ? response.data.objects : []
    const isStandardDiscovery = isTuffNpmDiscoveryKeyword(effectiveDiscoveryKeyword)
    const normalizedDiscoveryLower = effectiveDiscoveryKeyword.toLowerCase()
    const seen = new Set<string>()
    const packages: NpmSearchPackage[] = []

    for (const entry of objects) {
      const pkg = entry?.package
      if (!pkg?.name || !isValidNpmPackageName(pkg.name) || seen.has(pkg.name)) {
        continue
      }

      const matchesKeyword = isStandardDiscovery
        ? isTuffNpmPluginPackageName(pkg.name) || hasTuffNpmDiscoveryKeyword(pkg.keywords)
        : isTuffNpmPluginPackageName(pkg.name) ||
          hasTuffNpmDiscoveryKeyword(pkg.keywords) ||
          (Array.isArray(pkg.keywords) &&
            pkg.keywords.some(
              (kw) => typeof kw === 'string' && kw.trim().toLowerCase() === normalizedDiscoveryLower
            ))

      if (!matchesKeyword) {
        continue
      }

      seen.add(pkg.name)
      packages.push(pkg)
    }

    return packages
  }

  /**
   * Fetch abbreviated packument with TTL caching.
   */
  private async fetchPackument(
    packageName: string,
    registry: string,
    force: boolean,
    ttlMs: number
  ): Promise<NpmPackument | null> {
    const cacheKey = `${registry}::${packageName}`
    const now = Date.now()
    if (!force) {
      const cached = this.packumentCache.get(cacheKey)
      if (cached && cached.expiresAt > now) {
        return cached.data
      }
    }

    const metadataUrl = `${registry}/${encodeNpmPackagePath(packageName)}`
    const response = await this.request<NpmPackument>({
      url: metadataUrl,
      method: 'GET',
      headers: {
        Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT
      },
      timeout: PACKUMENT_TIMEOUT_MS
    })

    if (response.status < 200 || response.status >= 300) {
      return null
    }

    const data = response.data && typeof response.data === 'object' ? response.data : null
    this.packumentCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      data
    })
    return data
  }

  /**
   * Fetch package metadata and normalize into a StorePlugin item.
   */
  private async fetchPackageAsPlugin(
    searchEntry: NpmSearchPackage,
    options: {
      registry: string
      distTag: string
      force: boolean
      ttlMs: number
    }
  ): Promise<StorePlugin | null> {
    const packument = await this.fetchPackument(
      searchEntry.name,
      options.registry,
      options.force,
      options.ttlMs
    )
    if (!packument) {
      return null
    }

    const distTags = packument['dist-tags'] ?? {}
    const resolvedDistTag = distTags[options.distTag]
      ? options.distTag
      : distTags.latest
        ? 'latest'
        : options.distTag
    const resolvedVersion = distTags[resolvedDistTag] ?? distTags.latest ?? searchEntry.version
    if (!resolvedVersion) {
      return null
    }

    const versionData = packument.versions?.[resolvedVersion]
    if (!versionData) {
      return null
    }

    const packageName =
      readTrimmedString(versionData.name) ?? readTrimmedString(packument.name) ?? searchEntry.name
    if (!isValidNpmPackageName(packageName)) {
      return null
    }

    const tuffMeta =
      extractTuffPackageMetadata(versionData) ?? extractTuffPackageMetadata(packument)
    const officialScope = isOfficialNpmPluginPackageName(packageName)
    const inferredPluginName = inferPluginNameFromNpmPackage(packageName)
    const manifestName = tuffMeta?.name || inferredPluginName || packageName
    const manifestId = tuffMeta?.id || packageName
    const displayName = resolveDisplayName(tuffMeta?.displayName)

    const manifest: StorePlugin['manifest'] = {
      id: manifestId,
      name: manifestName,
      ...(tuffMeta?.sdkapi !== undefined ? { sdkapi: tuffMeta.sdkapi } : {})
    }

    const install: NpmStoreInstallInstruction = {
      type: 'npm',
      packageName,
      version: resolvedVersion,
      registry: options.registry,
      distTag: resolvedDistTag
    }

    const normalizedIcon = normalizeStoreIcon(tuffMeta?.icon)
    const authorName = extractAuthorName(
      versionData.author ?? packument.author ?? searchEntry.author,
      searchEntry.publisher
    )
    const description =
      readTrimmedString(versionData.description) ??
      readTrimmedString(packument.description) ??
      readTrimmedString(searchEntry.description) ??
      ''
    const homepage =
      readTrimmedString(versionData.homepage) ??
      readTrimmedString(packument.homepage) ??
      readTrimmedString(searchEntry.links?.homepage)
    const repository =
      extractRepositoryUrl(versionData.repository ?? packument.repository) ??
      readTrimmedString(searchEntry.links?.repository)
    const keywords = versionData.keywords ?? packument.keywords ?? searchEntry.keywords ?? []
    const tags = tuffMeta?.tags ?? keywords
    const badges = officialScope ? ['official-scope', 'npm'] : ['npm']

    const plugin: StorePlugin = {
      id: `npm:${packageName}`,
      name: displayName || manifestName || packageName,
      version: resolvedVersion,
      description,
      category: tuffMeta?.category || 'npm',
      deprecated: Boolean(versionData.deprecated),
      tags,
      author: authorName,
      icon: normalizedIcon.icon,
      iconUrl: normalizedIcon.iconUrl,
      homepage,
      downloadUrl: versionData.dist?.tarball ?? '',
      manifest,
      install,
      metadata: {
        packageName,
        version: resolvedVersion,
        distTag: resolvedDistTag,
        registry: options.registry,
        officialScope,
        trustTier: 'npm-community',
        badges,
        ...(versionData.dist?.integrity ? { integrity: versionData.dist.integrity } : {}),
        ...(versionData.dist?.shasum ? { shasum: versionData.dist.shasum } : {}),
        ...(tuffMeta ? { tuff: tuffMeta } : {}),
        ...(tuffMeta?.displayName ? { displayName: tuffMeta.displayName } : {}),
        ...(tuffMeta?.permissions ? { permissions: tuffMeta.permissions } : {}),
        ...(tuffMeta?.platforms ? { platforms: tuffMeta.platforms } : {}),
        ...(tuffMeta?.surface ? { surface: tuffMeta.surface } : {}),
        ...(searchEntry.links?.npm ? { npmUrl: searchEntry.links.npm } : {}),
        ...(repository ? { repository } : {})
      },
      providerId: this.definition.id,
      providerName: this.definition.name,
      providerType: 'npmPackage',
      providerTrustLevel: this.trustLevel,
      trusted: this.isTrusted,
      // Security invariant: naming scope never confers cryptographic official trust without Nexus attestation.
      official: false,
      timestamp: packument.time?.[resolvedVersion] ?? packument.modified ?? searchEntry.date
    }

    return plugin
  }
}
