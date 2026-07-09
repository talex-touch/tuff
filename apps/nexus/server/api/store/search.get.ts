import type { DashboardPluginVersion, StorePluginSearchPlugin } from '../../utils/pluginsStore'
import { searchStorePlugins } from '../../utils/pluginsStore'

interface StoreSearchQuery {
  q?: string
  category?: string
  compact?: string | number | boolean
  limit?: string | number
  offset?: string | number
}

function buildStoreDownloadUrl(slug: string, version: string): string {
  return `/api/store/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

function isCompactEnabled(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value

  if (typeof value === 'number')
    return value === 1

  if (typeof value !== 'string')
    return true

  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function readBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function cleanVersionForSearch(slug: string, version: DashboardPluginVersion) {
  return {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    signature: version.signature,
    packageUrl: buildStoreDownloadUrl(slug, version.version),
    packageSize: version.packageSize,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

function cleanPluginForSearch(plugin: StorePluginSearchPlugin) {
  const latest = plugin.latestVersion ?? plugin.versions.find(version => version.id === plugin.latestVersionId) ?? plugin.versions[0]
  if (!latest)
    return null

  return {
    id: plugin.id,
    slug: plugin.slug,
    name: plugin.name,
    summary: plugin.summary,
    category: plugin.category,
    installs: plugin.installs,
    homepage: plugin.homepage,
    isOfficial: plugin.isOfficial,
    badges: plugin.badges,
    author: plugin.author,
    iconUrl: plugin.iconUrl,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    latestVersion: cleanVersionForSearch(plugin.slug, latest),
    readmeUrl: plugin.readmeMarkdown ? `/api/store/plugins/${plugin.slug}/readme` : null,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as StoreSearchQuery
  const keyword = typeof query.q === 'string' ? query.q.trim() : ''
  const category = typeof query.category === 'string' ? query.category.trim() : ''
  const compact = isCompactEnabled(query.compact)
  const limit = readBoundedInteger(query.limit, 50, 1, 100)
  const offset = readBoundedInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)

  const result = await searchStorePlugins(event, {
    keyword,
    category: category || undefined,
    limit,
    offset,
  })

  const plugins = compact
    ? result.plugins
        .map(cleanPluginForSearch)
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
    : result.plugins

  return {
    plugins,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
})
