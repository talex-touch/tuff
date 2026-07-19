import type { DashboardPlugin, DashboardPluginVersion } from '../../utils/pluginsStore'
import { listStorePlugins } from '../../utils/pluginsStore'

function buildStoreDownloadUrl(slug: string, version: string): string {
  return `/api/store/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

interface StoreListQuery {
  compact?: string | number | boolean
  limit?: string | number
  offset?: string | number
}

function isCompactEnabled(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value

  if (typeof value === 'number')
    return value === 1

  if (typeof value !== 'string')
    return false

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function readBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

/**
 * Clean version object for store API response
 * Remove redundant fields that should only exist at plugin level
 */
function cleanVersionForStore(
  slug: string,
  version: DashboardPluginVersion,
  options: { compact: boolean },
) {
  const base = {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    artifactSha256: version.artifactSha256,
    nexusAttestation: version.nexusAttestation,
    availability: 'available' as const,
    packageUrl: buildStoreDownloadUrl(slug, version.version),
    packageSize: version.packageSize,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }

  if (options.compact) {
    return base
  }

  return {
    ...base,
    manifest: version.manifest,
    changelog: version.changelog,
  }
}

/**
 * Clean plugin object for store API response
 */
function cleanPluginForStore(plugin: DashboardPlugin, options: { compact: boolean }) {
  const versions = plugin.versions ?? []
  const latest = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

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
    latestVersion: cleanVersionForStore(plugin.slug, latest, options),
    // Use relative path for readme URL
    readmeUrl: plugin.readmeMarkdown ? `/api/store/plugins/${plugin.slug}/readme` : null,
  }

  if (options.compact) {
    return base
  }

  return {
    ...base,
    versions: versions.map(version => cleanVersionForStore(plugin.slug, version, options)),
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as StoreListQuery
  const compact = isCompactEnabled(query.compact)
  const limit = readBoundedInteger(query.limit, 100, 1, 100)
  const offset = readBoundedInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)

  const result = await listStorePlugins(event, {
    compact,
    limit,
    offset,
  })

  const enriched = result.plugins
    .map(plugin => cleanPluginForStore(plugin, { compact }))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return {
    plugins: enriched,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
})
