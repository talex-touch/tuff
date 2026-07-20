import type { DashboardPluginVersion, StorePluginSearchPlugin } from '../../utils/pluginsStore'
import type { PluginReleaseAudience } from '../../utils/pluginReleaseEligibility'
import { searchStorePlugins } from '../../utils/pluginsStore'
import { resolvePluginStoreAudience } from '../../utils/pluginStoreAccess'

interface StoreSearchQuery {
  q?: string
  category?: string
  channel?: string
  compact?: string | number | boolean
  limit?: string | number
  offset?: string | number
}

function buildStoreDownloadUrl(
  slug: string,
  version: string,
  audience: PluginReleaseAudience,
): string {
  const params = new URLSearchParams({ version })
  if (audience === 'beta') params.set('channel', 'BETA')
  return `/api/store/plugins/${slug}/download.tpex?${params.toString()}`
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

function cleanVersionForSearch(
  slug: string,
  version: DashboardPluginVersion,
  compact: boolean,
  audience: PluginReleaseAudience,
) {
  const base = {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    artifactSha256: version.artifactSha256,
    nexusAttestation: version.nexusAttestation,
    availability: 'available' as const,
    packageUrl: buildStoreDownloadUrl(slug, version.version, audience),
    packageSize: version.packageSize,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
  if (compact)
    return base

  return {
    ...base,
    readmeMarkdown: version.readmeMarkdown ?? null,
    manifest: version.manifest,
    changelog: version.changelog,
  }
}

function cleanPluginForSearch(
  plugin: StorePluginSearchPlugin,
  compact: boolean,
  audience: PluginReleaseAudience,
) {
  const latest = plugin.latestVersion ?? plugin.versions.find(version => version.id === plugin.latestVersionId) ?? plugin.versions[0]
  if (!latest)
    return null

  const base = {
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
    latestVersion: cleanVersionForSearch(plugin.slug, latest, compact, audience),
    readmeUrl: plugin.readmeMarkdown ? `/api/store/plugins/${plugin.slug}/readme` : null,
  }
  if (compact)
    return base

  return {
    ...base,
    readmeMarkdown: plugin.readmeMarkdown ?? null,
    versions: plugin.versions.map(version => cleanVersionForSearch(plugin.slug, version, false, audience)),
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as StoreSearchQuery
  const keyword = typeof query.q === 'string' ? query.q.trim() : ''
  const category = typeof query.category === 'string' ? query.category.trim() : ''
  const compact = isCompactEnabled(query.compact)
  const limit = readBoundedInteger(query.limit, 50, 1, 100)
  const offset = readBoundedInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  const audience = await resolvePluginStoreAudience(event)

  const result = await searchStorePlugins(event, {
    keyword,
    category: category || undefined,
    limit,
    offset,
    audience,
  })

  const plugins = result.plugins
    .map(plugin => cleanPluginForSearch(plugin, compact, audience))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
  return {
    plugins,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
})
