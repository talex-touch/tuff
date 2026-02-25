import type { DashboardPlugin, DashboardPluginVersion } from '../../utils/pluginsStore'
import { listPlugins } from '../../utils/pluginsStore'

function buildStoreDownloadUrl(slug: string, version: string): string {
  return `/api/store/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

interface StoreListQuery {
  compact?: string | number | boolean
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
    signature: version.signature,
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

  const plugins = await listPlugins(event, {
    includeVersions: true,
    forStore: true,
  })

  const enriched = plugins
    .map(plugin => cleanPluginForStore(plugin, { compact }))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return {
    plugins: enriched,
    total: enriched.length,
  }
})
