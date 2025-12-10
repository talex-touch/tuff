import type { DashboardPlugin, DashboardPluginVersion } from '../../utils/pluginsStore'
import { listPlugins } from '../../utils/pluginsStore'

/**
 * Clean version object for market API response
 * Remove redundant fields that should only exist at plugin level
 */
function cleanVersionForMarket(version: DashboardPluginVersion) {
  return {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    signature: version.signature,
    packageUrl: version.packageUrl,
    packageSize: version.packageSize,
    manifest: version.manifest,
    changelog: version.changelog,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

/**
 * Clean plugin object for market API response
 */
function cleanPluginForMarket(plugin: DashboardPlugin) {
  const versions = plugin.versions ?? []
  const latest = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

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
    latestVersion: cleanVersionForMarket(latest),
    versions: versions.map(cleanVersionForMarket),
    // Use relative path for readme URL
    readmeUrl: plugin.readmeMarkdown ? `/api/market/plugins/${plugin.slug}/readme` : null,
  }
}

export default defineEventHandler(async (event) => {
  const plugins = await listPlugins(event, {
    includeVersions: true,
    forMarket: true,
  })

  const enriched = plugins
    .map(plugin => cleanPluginForMarket(plugin))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return {
    plugins: enriched,
    total: enriched.length,
  }
})
