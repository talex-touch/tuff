import type { PluginReleaseAudience } from '../../../utils/pluginReleaseEligibility'
import type { DashboardPluginVersion } from '../../../utils/pluginsStore'
import { createError } from 'h3'
import { getPluginBySlug } from '../../../utils/pluginsStore'
import { resolvePluginStoreAudience } from '../../../utils/pluginStoreAccess'

function buildStoreDownloadUrl(slug: string, version: string, audience: PluginReleaseAudience): string {
  const url = `/api/store/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
  return audience === 'beta' ? `${url}&channel=BETA` : url
}

/**
 * Clean version object for store API response
 */
function cleanVersionForStore(slug: string, version: DashboardPluginVersion, audience: PluginReleaseAudience) {
  return {
    id: version.id,
    pluginId: version.pluginId,
    channel: version.channel,
    version: version.version,
    artifactSha256: version.artifactSha256,
    nexusAttestation: version.nexusAttestation,
    availability: 'available' as const,
    packageUrl: buildStoreDownloadUrl(slug, version.version, audience),
    packageSize: version.packageSize,
    readmeMarkdown: version.readmeMarkdown ?? null,
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

  const audience = await resolvePluginStoreAudience(event)
  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forStore: true,
    audience,
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
      readmeMarkdown: plugin.readmeMarkdown ?? null,
      latestVersion: latest ? cleanVersionForStore(plugin.slug, latest, audience) : null,
      versions: versions.map(version => cleanVersionForStore(plugin.slug, version, audience)),
      // Use relative path for readme URL
      readmeUrl: plugin.readmeMarkdown ? `/api/store/plugins/${plugin.slug}/readme` : null,
    },
  }
})
