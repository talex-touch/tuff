import type {
  BundledReleaseNotesCatalog,
  BundledReleaseNotesState,
  ReleaseNotesEntry,
  ReleaseNotesPage,
  UpdateReleaseNotesChannel
} from '@talex-touch/utils'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { normalizeBundledReleaseNotesCatalog, normalizeReleaseNotesEntry } from '@talex-touch/utils'
import { compareUpdateVersions } from '../../../shared/update/version'

interface ReleaseNotesStateRepository {
  getLastAcknowledgedVersion: () => Promise<string | null>
  acknowledge: (version: string) => Promise<void>
}

interface ReleaseNotesServiceDeps {
  currentVersion: string
  catalogPaths: string[]
  cachePath: string
  officialBaseUrl: string
  repository: ReleaseNotesStateRepository
  request: (url: string) => Promise<unknown>
}

interface ReleaseNotesCacheFile {
  schemaVersion: 1
  pages: Record<string, ReleaseNotesPage>
  details: Record<string, ReleaseNotesEntry>
}

export class ReleaseNotesService {
  private catalogPromise: Promise<BundledReleaseNotesCatalog> | null = null
  private cachePromise: Promise<ReleaseNotesCacheFile> | null = null

  constructor(private readonly deps: ReleaseNotesServiceDeps) {}

  async getBundledState(): Promise<BundledReleaseNotesState> {
    const [catalog, lastAcknowledgedVersion] = await Promise.all([
      this.loadCatalog(),
      this.deps.repository.getLastAcknowledgedVersion()
    ])
    return { catalog, lastAcknowledgedVersion }
  }

  async acknowledge(version: string): Promise<void> {
    if (version.trim() !== this.deps.currentVersion) {
      throw new Error('Release notes can only acknowledge the current app version')
    }
    await this.deps.repository.acknowledge(this.deps.currentVersion)
  }

  async list(input: {
    channel: UpdateReleaseNotesChannel
    cursor?: string
    limit?: number
  }): Promise<ReleaseNotesPage> {
    const limit = input.limit ?? 20
    const key = this.cacheKey(input.channel, input.cursor, limit)
    const url = new URL('/api/releases', this.deps.officialBaseUrl)
    url.searchParams.set('channel', input.channel)
    url.searchParams.set('status', 'published')
    url.searchParams.set('limit', String(limit))
    if (input.cursor) url.searchParams.set('cursor', input.cursor)

    try {
      const payload = await this.deps.request(url.toString())
      const page = await this.normalizePage(payload)
      const cache = await this.loadCache()
      cache.pages[key] = page
      for (const entry of page.entries) cache.details[entry.tag] = entry
      await this.saveCache(cache)
      return page
    } catch (error) {
      const cache = await this.loadCache()
      const cached = cache.pages[key]
      if (cached) return { ...cached, stale: true }
      throw error
    }
  }

  async get(tag: string): Promise<ReleaseNotesEntry> {
    const normalizedTag = tag.trim()
    if (!normalizedTag) throw new Error('Release notes tag is required')
    const url = new URL(
      `/api/releases/${encodeURIComponent(normalizedTag)}`,
      this.deps.officialBaseUrl
    )

    try {
      const payload = await this.deps.request(url.toString())
      if (!isRecord(payload)) throw new Error('Invalid release notes response')
      const release = normalizeReleaseNotesEntry(payload.release, {
        legacy: await this.isLegacy(payload.release)
      })
      if (!release) throw new Error('Invalid release notes entry')
      const cache = await this.loadCache()
      cache.details[release.tag] = release
      await this.saveCache(cache)
      return release
    } catch (error) {
      const cache = await this.loadCache()
      const cached = cache.details[normalizedTag]
      if (cached) return cached
      throw error
    }
  }

  private async normalizePage(payload: unknown): Promise<ReleaseNotesPage> {
    if (!isRecord(payload) || !Array.isArray(payload.releases) || !isRecord(payload.pageInfo)) {
      throw new Error('Invalid release notes page')
    }
    const hasMore = payload.pageInfo.hasMore
    const nextCursor = payload.pageInfo.nextCursor
    if (typeof hasMore !== 'boolean' || (nextCursor !== null && typeof nextCursor !== 'string')) {
      throw new Error('Invalid release notes page info')
    }

    const entries: ReleaseNotesEntry[] = []
    for (const rawRelease of payload.releases) {
      const entry = normalizeReleaseNotesEntry(rawRelease, {
        legacy: await this.isLegacy(rawRelease)
      })
      if (!entry) throw new Error('Invalid release notes entry')
      entries.push(entry)
    }

    return { entries, hasMore, nextCursor, stale: false }
  }

  private async isLegacy(value: unknown): Promise<boolean> {
    if (!isRecord(value) || typeof value.version !== 'string') return true
    const channel =
      value.channel === 'BETA' ? 'BETA' : value.channel === 'RELEASE' ? 'RELEASE' : null
    if (!channel) return true
    const catalog = await this.loadCatalog()
    return compareUpdateVersions(value.version, catalog.legacyThrough[channel]) <= 0
  }

  private async loadCatalog(): Promise<BundledReleaseNotesCatalog> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.readCatalog()
    }
    return this.catalogPromise
  }

  private async readCatalog(): Promise<BundledReleaseNotesCatalog> {
    for (const candidate of this.deps.catalogPaths) {
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(candidate, 'utf8'))
        const catalog = normalizeBundledReleaseNotesCatalog(parsed)
        if (!catalog) throw new Error(`Invalid release notes catalog: ${candidate}`)
        if (catalog.generatedForVersion !== this.deps.currentVersion) {
          throw new Error(
            `Release notes catalog version mismatch: expected ${this.deps.currentVersion}, received ${catalog.generatedForVersion}`
          )
        }
        return catalog
      } catch (error) {
        if (isMissingFile(error)) continue
        throw error
      }
    }
    throw new Error('Bundled release notes catalog is missing')
  }

  private async loadCache(): Promise<ReleaseNotesCacheFile> {
    if (!this.cachePromise) {
      this.cachePromise = (async () => {
        try {
          const parsed: unknown = JSON.parse(await fs.readFile(this.deps.cachePath, 'utf8'))
          const cache = normalizeReleaseNotesCache(parsed)
          if (cache) return cache
        } catch {
          // A remote catalog cache is rebuildable; malformed or missing files start empty.
        }
        return { schemaVersion: 1, pages: {}, details: {} }
      })()
    }
    return this.cachePromise
  }

  private async saveCache(cache: ReleaseNotesCacheFile): Promise<void> {
    await fs.mkdir(path.dirname(this.deps.cachePath), { recursive: true })
    await fs.writeFile(this.deps.cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  }

  private cacheKey(
    channel: UpdateReleaseNotesChannel,
    cursor: string | undefined,
    limit: number
  ): string {
    return `${channel}:${cursor ?? 'first'}:${limit}`
  }
}

function normalizeReleaseNotesCache(value: unknown): ReleaseNotesCacheFile | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.pages)) return null

  const pages: Record<string, ReleaseNotesPage> = {}
  const details: Record<string, ReleaseNotesEntry> = {}
  for (const [key, rawPage] of Object.entries(value.pages)) {
    const page = normalizeCachedPage(rawPage)
    if (page) pages[key] = page
  }
  if (isRecord(value.details)) {
    for (const [tag, rawEntry] of Object.entries(value.details)) {
      const entry = normalizeCachedEntry(rawEntry)
      if (entry && entry.tag === tag) details[tag] = entry
    }
  }

  return { schemaVersion: 1, pages, details }
}

function normalizeCachedPage(value: unknown): ReleaseNotesPage | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.entries) ||
    typeof value.hasMore !== 'boolean' ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string') ||
    typeof value.stale !== 'boolean'
  ) {
    return null
  }

  const entries: ReleaseNotesEntry[] = []
  for (const rawEntry of value.entries) {
    const entry = normalizeCachedEntry(rawEntry)
    if (!entry) return null
    entries.push(entry)
  }
  return {
    entries,
    hasMore: value.hasMore,
    nextCursor: value.nextCursor,
    stale: value.stale
  }
}

function normalizeCachedEntry(value: unknown): ReleaseNotesEntry | null {
  if (!isRecord(value) || !isRecord(value.notes)) return null
  const tag = typeof value.tag === 'string' ? value.tag : ''
  const version = typeof value.version === 'string' ? value.version : ''
  const channel = value.channel === 'RELEASE' || value.channel === 'BETA' ? value.channel : null
  if (
    !version ||
    tag !== `v${version}` ||
    !channel ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.notes.zh !== 'string' ||
    !value.notes.zh ||
    typeof value.notes.en !== 'string' ||
    !value.notes.en ||
    typeof value.publishedAt !== 'string' ||
    !value.publishedAt ||
    typeof value.legacy !== 'boolean'
  ) {
    return null
  }

  return {
    tag,
    version,
    name: value.name,
    channel,
    notes: { zh: value.notes.zh, en: value.notes.en },
    publishedAt: value.publishedAt,
    legacy: value.legacy
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}
