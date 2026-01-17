import type { DashboardPluginVersion } from '../../../utils/pluginsStore'
import { createError } from 'h3'
import { getPluginBySlug } from '../../../utils/pluginsStore'

function buildMarketDownloadUrl(slug: string, version: string): string {
  return `/api/market/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

/**
 * Clean version object for market API response
 */
function cleanVersionForMarket(slug: string, version: DashboardPluginVersion) {
  return {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    signature: version.signature,
    packageUrl: buildMarketDownloadUrl(slug, version.version),
    packageSize: version.packageSize,
    manifest: version.manifest,
    changelog: version.changelog,
    status: version.status,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }
}

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forMarket: true,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const versions = plugin.versions ?? []
  const latest = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

  return {
    plugin: {
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
      latestVersion: latest ? cleanVersionForMarket(plugin.slug, latest) : null,
      versions: versions.map(version => cleanVersionForMarket(plugin.slug, version)),
      // Use relative path for readme URL
      readmeUrl: plugin.readmeMarkdown ? `/api/market/plugins/${plugin.slug}/readme` : null,
    },
  }
})
