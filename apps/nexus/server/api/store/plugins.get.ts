import type { DashboardPlugin, DashboardPluginVersion } from '../../utils/pluginsStore'
import type { PluginReleaseAudience } from '../../utils/pluginReleaseEligibility'
import { openEdgeCache } from '../../utils/edgeCache'
import { listStorePlugins } from '../../utils/pluginsStore'
import { resolvePluginStoreAudience } from '../../utils/pluginStoreAccess'
import { projectPublicPluginManifest } from '../../utils/pluginManifestProjection'

/**
 * How long a copy of the public Store listing is served from the edge cache: review decisions, new
 * versions and install counts reach the listing this much later.
 */
const STORE_LIST_EDGE_TTL_SECONDS = 120

function buildStoreDownloadUrl(
  slug: string,
  version: string,
  audience: PluginReleaseAudience,
): string {
  const params = new URLSearchParams({ version })
  if (audience === 'beta') params.set('channel', 'BETA')
  return `/api/store/plugins/${slug}/download.tpex?${params.toString()}`
}

interface StoreListQuery {
  compact?: string | number | boolean
  channel?: string
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

/**
 * Whether the request is for the public Store, the audience `resolvePluginStoreAudience` grants without
 * asking who is calling: no channel, or RELEASE. Only that listing is the same for everyone.
 */
function isPublicStoreChannel(value: unknown): boolean {
  const channel = (Array.isArray(value) ? value[0] : value)?.toString().trim().toUpperCase()
  return !channel || channel === 'RELEASE'
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
  options: { compact: boolean, audience: PluginReleaseAudience },
) {
  const base = {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    artifactSha256: version.artifactSha256,
    nexusAttestation: version.nexusAttestation,
    availability: 'available' as const,
    packageUrl: buildStoreDownloadUrl(slug, version.version, options.audience),
    packageSize: version.packageSize,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    manifest: projectPublicPluginManifest(version.manifest),
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
function cleanPluginForStore(
  plugin: DashboardPlugin,
  options: { compact: boolean, audience: PluginReleaseAudience },
) {
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
    readmeUrl: (plugin.hasReadme ?? Boolean(plugin.readmeMarkdown)) ? `/api/store/plugins/${plugin.slug}/readme` : null,
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

  // Only the public listing is the same for everyone; the beta audience needs a moderator.
  const edge = isPublicStoreChannel(query.channel)
    ? await openEdgeCache(event, { name: 'store/plugins', params: { compact, limit, offset } })
    : null
  if (edge?.hit)
    return edge.hit

  const audience = await resolvePluginStoreAudience(event)

  const result = await listStorePlugins(event, {
    compact,
    limit,
    offset,
    audience,
  })

  const enriched = result.plugins
    .map(plugin => cleanPluginForStore(plugin, { compact, audience }))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  const body = {
    plugins: enriched,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
  if (edge)
    return edge.store({ body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, STORE_LIST_EDGE_TTL_SECONDS)
  return body
})
