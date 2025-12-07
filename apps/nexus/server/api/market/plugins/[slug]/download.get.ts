import { createError, sendRedirect } from 'h3'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug
  const query = getQuery(event)
  const version = query.version as string | undefined

  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forMarket: true,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const versions = plugin.versions ?? []
  let targetVersion = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

  if (version) {
    const specificVersion = versions.find(v => v.version === version)
    if (specificVersion) {
      targetVersion = specificVersion
    }
  }

  if (!targetVersion?.packageUrl)
    throw createError({ statusCode: 404, statusMessage: 'No downloadable version available.' })

  return sendRedirect(event, targetVersion.packageUrl, 302)
})
