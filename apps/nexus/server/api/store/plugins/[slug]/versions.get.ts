import { createError } from 'h3'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

function buildStoreDownloadUrl(slug: string, version: string): string {
  return `/api/store/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forStore: true,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const versions = (plugin.versions ?? []).map(v => ({
    id: v.id,
    version: v.version,
    channel: v.channel,
    packageUrl: buildStoreDownloadUrl(plugin.slug, v.version),
    packageSize: v.packageSize,
    changelog: v.changelog,
    createdAt: v.createdAt,
  }))

  return {
    slug: plugin.slug,
    versions,
    latestVersionId: plugin.latestVersionId,
  }
})
