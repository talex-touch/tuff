import type {
  GitHubRelease,
  UpdateCheckResult,
  UpdateProviderOutcome,
  UpdateSettings as SharedUpdateSettings
} from '@talex-touch/utils'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppPreviewChannel,
  UpdateProviderType,
  UPDATE_GITHUB_RELEASES_API,
  UPDATE_GITHUB_REPO,
  UPDATE_RELEASE_MANIFEST_NAME
} from '@talex-touch/utils'
import {
  compareUpdateVersions,
  parseComparableUpdateVersion,
  selectLatestUpdateRelease
} from '../../../../shared/update/version'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'
import { getNetworkService } from '../../network'
import { shouldDowngradeRemoteFailure } from '../../../utils/network-log-noise'
import type { LogOptions } from '../../../utils/logger'

interface ReleaseCacheRateLimit {
  remaining?: number
  resetAt?: number
}

interface ReleaseCacheEntry {
  releases: GitHubRelease[]
  fetchedAt: number
  ttlMinutes: number
  etag?: string
  lastModified?: string
  rateLimit?: ReleaseCacheRateLimit
  cooldownUntil?: number
  failureCount?: number
}

interface ReleaseCacheStore {
  version: 2
  entries: Record<string, ReleaseCacheEntry>
}

interface OfficialReleaseAsset {
  filename: string
  downloadUrl: string
  size: number
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'x64' | 'arm64' | 'universal'
  sha256?: string | null
  signatureUrl?: string | null
}

interface OfficialRelease {
  tag: string
  name: string
  channel: AppPreviewChannel
  version: string
  notes: { zh: string; en: string }
  notesHtml?: { zh: string; en: string } | null
  status: string
  publishedAt?: string | null
  createdAt: string
  assets?: OfficialReleaseAsset[]
}

export interface ReleaseFetchSettings {
  source?: SharedUpdateSettings['source']
  cacheEnabled: boolean
  cacheTTL: number
  rateLimitEnabled: boolean
  maxRetries: number
  retryDelay: number
}

export interface UpdateFetchResult {
  result: UpdateCheckResult
  usedNetwork: boolean
  outcome: UpdateProviderOutcome
}

export interface ReleaseFetchServiceDeps {
  getSettings: () => ReleaseFetchSettings
  log: {
    warn: (message: string, options?: LogOptions) => void
  }
}

/** Fetches releases and owns persisted provider cache, validators, retry, and cooldown policy. */
export class ReleaseFetchService {
  private store: ReleaseCacheStore = { version: 2, entries: {} }

  constructor(private readonly deps: ReleaseFetchServiceDeps) {
    this.store = this.buildStore()
  }

  async load(rootPath: string): Promise<void> {
    const cacheFile = path.join(rootPath, 'config', 'update-cache.json')
    try {
      if (!fs.existsSync(cacheFile)) {
        return
      }
      const parsed = JSON.parse(
        await fs.promises.readFile(cacheFile, 'utf8')
      ) as Partial<ReleaseCacheStore>
      this.store =
        parsed.version === 2 && parsed.entries && typeof parsed.entries === 'object'
          ? this.buildStore(parsed.entries)
          : this.buildStore()
    } catch (error) {
      this.deps.log.warn('Failed to load update cache', { error })
    }
  }

  async flush(rootPath: string): Promise<void> {
    const cacheFile = path.join(rootPath, 'config', 'update-cache.json')
    try {
      await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true })
      await fs.promises.writeFile(cacheFile, JSON.stringify(this.store, null, 2))
    } catch (error) {
      this.deps.log.warn('Failed to save update cache', { error })
    }
  }

  clear(): void {
    this.store = this.buildStore()
  }

  async fetch(channel: AppPreviewChannel, force = false): Promise<UpdateFetchResult> {
    if (this.deps.getSettings().source?.type !== UpdateProviderType.OFFICIAL) {
      return this.fetchGitHub(channel, force)
    }

    try {
      return await this.fetchOfficial(channel, force)
    } catch (nexusError) {
      if (!this.isOfficialFallbackEligible(nexusError)) {
        throw nexusError
      }
      this.deps.log.warn('Nexus update lookup failed transiently; falling back to GitHub', {
        error: nexusError
      })

      try {
        return await this.fetchGitHub(channel, force, false)
      } catch (githubError) {
        const stale =
          this.staleResult('nexus', channel, 'Official Releases') ??
          this.staleResult('github', channel, 'GitHub')
        if (stale) {
          return stale
        }
        throw githubError
      }
    }
  }

  private async fetchGitHub(
    channel: AppPreviewChannel,
    force: boolean,
    allowStale = true
  ): Promise<UpdateFetchResult> {
    const settings = this.deps.getSettings()
    const source =
      settings.source?.type === UpdateProviderType.GITHUB
        ? (settings.source.name ?? 'GitHub')
        : 'GitHub'
    const cacheEntry = this.entry('github', channel)
    const cached = (): GitHubRelease | null => selectLatestUpdateRelease(cacheEntry?.releases ?? [])
    const now = Date.now()
    const cachedResult = this.getFreshOrCooledResult(
      'github',
      cacheEntry,
      cached,
      source,
      force,
      now,
      allowStale
    )
    if (cachedResult) {
      if (!allowStale && cachedResult.result.error) {
        throw new Error(cachedResult.result.error)
      }
      return cachedResult
    }

    let lastError: unknown
    const maxRetries = Math.max(1, settings.maxRetries || 1)
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TalexTouch-Updater/1.0'
        }
        if (settings.cacheEnabled && cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag
        if (settings.cacheEnabled && cacheEntry?.lastModified)
          headers['If-Modified-Since'] = cacheEntry.lastModified
        const response = await getNetworkService().request<GitHubRelease[]>({
          method: 'GET',
          url: UPDATE_GITHUB_RELEASES_API,
          timeoutMs: 8000,
          headers,
          responseType: 'json',
          validateStatus: [200, 304, 403, 429]
        })
        if (response.status === 403 || response.status === 429) {
          const error = Object.assign(new Error(`NETWORK_HTTP_STATUS_${response.status}`), {
            headers: response.headers
          })
          throw error
        }
        const rateLimit = this.rateLimit(response.headers)
        const etag = this.header(response.headers, 'etag')
        const lastModified = this.header(response.headers, 'last-modified')
        if (response.status === 304) {
          const release = cached()
          if (!release || !cacheEntry) return this.noCachedRelease('github', source, true)
          this.setEntry('github', channel, {
            ...cacheEntry,
            fetchedAt: now,
            ttlMinutes: settings.cacheTTL,
            rateLimit: rateLimit ?? cacheEntry.rateLimit,
            etag: etag ?? cacheEntry.etag,
            lastModified: lastModified ?? cacheEntry.lastModified,
            cooldownUntil: this.cooldownUntil(rateLimit),
            failureCount: 0
          })
          return this.releaseResult(release, source, true)
        }
        if (!Array.isArray(response.data)) {
          throw new Error('Invalid response format from GitHub API')
        }
        const releases = response.data
          .filter((release) => parseComparableUpdateVersion(release.tag_name).channel === channel)
          .map((release) => ({ ...release, source: 'github' as const }))
          .sort((a, b) => compareUpdateVersions(b.tag_name, a.tag_name))
        if (releases.length === 0) {
          return this.noneResult(
            'github',
            source,
            `No releases found for channel: ${channel}`,
            true,
            false
          )
        }
        const release = releases[0]
        this.setEntry('github', channel, {
          releases,
          fetchedAt: now,
          ttlMinutes: settings.cacheTTL,
          etag: etag ?? cacheEntry?.etag,
          lastModified: lastModified ?? cacheEntry?.lastModified,
          rateLimit,
          cooldownUntil: this.cooldownUntil(rateLimit),
          failureCount: 0
        })
        return this.releaseResult(release, source, true)
      } catch (error) {
        lastError = error
        if (!this.isRetryable(error) || attempt >= maxRetries - 1) break
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay(attempt, settings.retryDelay || 2000))
        )
      }
    }

    if (lastError) this.recordFailure('github', channel, lastError)
    if (allowStale) {
      const release = cached()
      if (release) return this.releaseResult(release, source, false)
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to fetch latest release')
  }

  private async fetchOfficial(
    channel: AppPreviewChannel,
    force: boolean
  ): Promise<UpdateFetchResult> {
    const settings = this.deps.getSettings()
    const source = settings.source?.name ?? 'Official Releases'
    const cacheEntry = this.entry('nexus', channel)
    const cached = (): GitHubRelease | null => selectLatestUpdateRelease(cacheEntry?.releases ?? [])
    const cachedResult = this.getFreshOrCooledResult(
      'nexus',
      cacheEntry,
      cached,
      source,
      force,
      Date.now(),
      false
    )
    if (cachedResult) {
      if (cachedResult.result.error === 'Rate limit cooldown in effect') {
        throw new Error('NETWORK_HTTP_STATUS_429')
      }
      return cachedResult
    }

    try {
      const url = new URL('/api/releases/latest', this.officialBaseUrl())
      url.searchParams.set('channel', channel)
      const response = await getNetworkService().request<{
        release?: OfficialRelease | null
        message?: string
      }>({
        method: 'GET',
        url: url.toString(),
        timeoutMs: 8000,
        responseType: 'json'
      })
      if (!response.data?.release) {
        return this.noneResult(
          'nexus',
          source,
          response.data?.message ?? 'No official release available',
          true,
          true
        )
      }
      if (
        response.data.release.status &&
        response.data.release.status.toUpperCase() !== 'PUBLISHED'
      ) {
        return this.policyBlockResult(
          source,
          `Official release is not published: ${response.data.release.status}`
        )
      }
      const release = this.mapOfficialRelease(response.data.release)
      this.setEntry('nexus', channel, {
        releases: [release],
        fetchedAt: Date.now(),
        ttlMinutes: settings.cacheTTL,
        failureCount: 0
      })
      return this.releaseResult(release, source, true)
    } catch (error) {
      this.recordFailure('nexus', channel, error)
      throw error instanceof Error ? error : new Error('Failed to fetch official release')
    }
  }

  private getFreshOrCooledResult(
    provider: 'nexus' | 'github',
    entry: ReleaseCacheEntry | null,
    cached: () => GitHubRelease | null,
    source: string,
    force: boolean,
    now: number,
    allowCooled: boolean
  ): UpdateFetchResult | null {
    const settings = this.deps.getSettings()
    if (
      !force &&
      settings.cacheEnabled &&
      entry?.releases.length &&
      now - entry.fetchedAt <= settings.cacheTTL * 60_000
    ) {
      const release = cached()
      return release
        ? this.releaseResult(release, source, false)
        : this.noCachedRelease(provider, source, false)
    }
    if (settings.rateLimitEnabled && entry?.cooldownUntil && now < entry.cooldownUntil) {
      const release = allowCooled ? cached() : null
      if (release) {
        return this.releaseResult(release, source, false)
      }
      const message = 'Rate limit cooldown in effect'
      return {
        usedNetwork: false,
        result: { hasUpdate: false, error: message, source },
        outcome: { kind: 'transient-failure', source: provider, reason: message }
      }
    }
    return null
  }

  private releaseResult(
    release: GitHubRelease,
    source: string,
    usedNetwork: boolean
  ): UpdateFetchResult {
    if (release.source !== 'nexus' && release.source !== 'github') {
      throw new Error('Update release source is missing')
    }
    return {
      usedNetwork,
      result: { hasUpdate: true, release, source },
      outcome: { kind: 'candidate', source: release.source, release, usedNetwork }
    }
  }

  private noCachedRelease(
    provider: 'nexus' | 'github',
    source: string,
    usedNetwork: boolean
  ): UpdateFetchResult {
    const message = 'No cached release available'
    return {
      usedNetwork,
      result: { hasUpdate: false, error: message, source },
      outcome: { kind: 'transient-failure', source: provider, reason: message }
    }
  }

  private noneResult(
    provider: 'nexus' | 'github',
    source: string,
    message: string,
    usedNetwork: boolean,
    authoritative: boolean
  ): UpdateFetchResult {
    return {
      usedNetwork,
      result: { hasUpdate: false, error: message, source },
      outcome: { kind: 'none', source: provider, authoritative, message }
    }
  }

  private policyBlockResult(source: string, reason: string): UpdateFetchResult {
    return {
      usedNetwork: true,
      result: { hasUpdate: false, error: reason, source },
      outcome: { kind: 'policy-block', source: 'nexus', reason }
    }
  }

  private entry(
    provider: 'nexus' | 'github',
    channel: AppPreviewChannel
  ): ReleaseCacheEntry | null {
    return this.store.entries[this.cacheKey(provider, channel)] ?? null
  }

  private setEntry(
    provider: 'nexus' | 'github',
    channel: AppPreviewChannel,
    entry: ReleaseCacheEntry
  ): void {
    this.store.entries[this.cacheKey(provider, channel)] = entry
  }

  private buildStore(entries: ReleaseCacheStore['entries'] = {}): ReleaseCacheStore {
    return { version: 2, entries }
  }

  private cacheKey(provider: 'nexus' | 'github', channel: AppPreviewChannel): string {
    const source = this.deps.getSettings().source
    const identity =
      provider === 'nexus'
        ? this.officialBaseUrl()
        : source?.type === UpdateProviderType.GITHUB
          ? (source.url ?? UPDATE_GITHUB_REPO)
          : UPDATE_GITHUB_REPO
    return `${provider}:${identity}:${channel}`
  }

  private staleResult(
    provider: 'nexus' | 'github',
    channel: AppPreviewChannel,
    source: string
  ): UpdateFetchResult | null {
    const release = selectLatestUpdateRelease(this.entry(provider, channel)?.releases ?? [])
    return release ? this.releaseResult(release, source, false) : null
  }

  private isOfficialFallbackEligible(error: unknown): boolean {
    const status = this.status(error)
    if (status !== undefined) {
      return status === 429 || status >= 500
    }
    return (
      error instanceof Error &&
      /NETWORK_TIMEOUT|timeout|etimedout|enotfound|econnreset|eai_again|fetch failed|socket hang up/i.test(
        error.message
      )
    )
  }

  private officialBaseUrl(): string {
    return this.deps.getSettings().source?.url?.replace(/\/$/, '') ?? NEXUS_BASE_URL
  }

  private mapOfficialRelease(release: OfficialRelease): GitHubRelease {
    const body =
      release.notesHtml?.en || release.notes?.en || release.notesHtml?.zh || release.notes?.zh || ''
    const assets: GitHubRelease['assets'] = (release.assets ?? []).flatMap((asset) => {
      const url = this.officialAssetUrl(asset.downloadUrl)
      if (!url) return []
      return [
        {
          name: asset.filename,
          url,
          size: asset.size,
          platform: asset.platform,
          arch: asset.arch === 'arm64' ? 'arm64' : 'x64',
          checksum: asset.sha256 ?? undefined,
          signatureUrl: this.officialAssetUrl(asset.signatureUrl ?? undefined) ?? undefined
        }
      ]
    })
    assets.push({
      name: UPDATE_RELEASE_MANIFEST_NAME,
      url: `https://github.com/${UPDATE_GITHUB_REPO}/releases/download/${encodeURIComponent(release.tag)}/${UPDATE_RELEASE_MANIFEST_NAME}`,
      size: 0
    })
    return {
      tag_name: release.tag,
      name: release.name || release.tag,
      published_at: release.publishedAt ?? release.createdAt,
      body,
      assets,
      source: 'nexus'
    }
  }

  private officialAssetUrl(assetPath?: string | null): string | null {
    if (!assetPath) return null
    if (/^https?:\/\//i.test(assetPath)) return assetPath
    return `${this.officialBaseUrl()}${assetPath.startsWith('/') ? assetPath : `/${assetPath}`}`
  }

  private cooldownUntil(rateLimit?: ReleaseCacheRateLimit): number | undefined {
    return this.deps.getSettings().rateLimitEnabled &&
      rateLimit?.remaining !== undefined &&
      rateLimit.remaining <= 0
      ? rateLimit.resetAt
      : undefined
  }

  private recordFailure(
    provider: 'nexus' | 'github',
    channel: AppPreviewChannel,
    error: unknown
  ): void {
    const settings = this.deps.getSettings()
    const entry = this.entry(provider, channel) ?? {
      releases: [],
      fetchedAt: 0,
      ttlMinutes: settings.cacheTTL
    }
    const status = this.status(error)
    const headers = this.headers(error)
    if (settings.rateLimitEnabled && (status === 403 || status === 429)) {
      const rateLimit = headers ? this.rateLimit(headers) : undefined
      this.setEntry(provider, channel, {
        ...entry,
        rateLimit: rateLimit ?? entry.rateLimit,
        cooldownUntil: rateLimit?.resetAt ?? Date.now() + 3_600_000,
        failureCount: (entry.failureCount ?? 0) + 1
      })
      return
    }
    const nextCount = Math.min((entry.failureCount ?? 0) + 1, 4)
    this.setEntry(provider, channel, {
      ...entry,
      failureCount: nextCount,
      cooldownUntil: Date.now() + [60_000, 300_000, 900_000, 3_600_000][nextCount - 1]
    })
  }

  describeExpectedFailure(error: unknown): {
    message: string
    meta: Record<string, string | number | boolean | null | undefined>
  } | null {
    const status = this.status(error)
    const rateLimit = this.headers(error) ? this.rateLimit(this.headers(error)!) : undefined
    if (status === 403 || status === 429) {
      return {
        message: 'Update check deferred by upstream rate limit',
        meta: {
          status,
          remaining: rateLimit?.remaining,
          retryAt: rateLimit?.resetAt ? new Date(rateLimit.resetAt).toISOString() : undefined
        }
      }
    }
    if (!(error instanceof Error) || !shouldDowngradeRemoteFailure(error.message)) {
      return null
    }
    return {
      message: 'Update check deferred by remote service availability',
      meta: { error: error.message }
    }
  }

  private isRetryable(error: unknown): boolean {
    const status = this.status(error)
    if (status !== undefined) {
      return status >= 500 || status === 403 || status === 429
    }
    return (
      error instanceof Error &&
      /NETWORK_TIMEOUT|timeout|etimedout|enotfound|econnreset|eai_again|fetch failed|socket hang up/i.test(
        error.message
      )
    )
  }

  private retryDelay(attempt: number, baseDelay: number): number {
    const delay = Math.min(baseDelay * 2 ** attempt, 60_000)
    return delay + Math.random() * 0.1 * delay
  }

  private status(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      const candidate = error as {
        status?: unknown
        statusCode?: unknown
        response?: { status?: unknown }
      }
      const value = candidate.status ?? candidate.statusCode ?? candidate.response?.status
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value
      }
    }
    const matched =
      error instanceof Error ? error.message.match(/NETWORK_HTTP_STATUS_(\d{3})/) : null
    return matched ? Number.parseInt(matched[1], 10) : undefined
  }

  private headers(error: unknown): Record<string, unknown> | undefined {
    const headers =
      error && typeof error === 'object' ? (error as { headers?: unknown }).headers : undefined
    return headers && typeof headers === 'object' ? (headers as Record<string, unknown>) : undefined
  }

  private rateLimit(headers: Record<string, unknown>): ReleaseCacheRateLimit | undefined {
    const remaining = this.headerNumber(headers, 'x-ratelimit-remaining')
    const reset = this.headerNumber(headers, 'x-ratelimit-reset')
    return remaining === undefined && reset === undefined
      ? undefined
      : { remaining, resetAt: reset ? reset * 1000 : undefined }
  }

  private headerNumber(headers: Record<string, unknown>, name: string): number | undefined {
    const value = this.header(headers, name)
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN
    return Number.isNaN(parsed) ? undefined : parsed
  }

  private header(headers: Record<string, unknown>, name: string): string | undefined {
    const value = headers[name.toLowerCase()]
    return Array.isArray(value)
      ? typeof value[0] === 'string'
        ? value[0]
        : undefined
      : typeof value === 'string'
        ? value
        : undefined
  }
}
