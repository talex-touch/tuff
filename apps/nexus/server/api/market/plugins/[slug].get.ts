import { createError, getRequestURL } from 'h3'
import { getPluginBySlug } from '../../../utils/pluginsStore'

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

  const requestUrl = getRequestURL(event)
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`

  return {
    plugin: {
      ...plugin,
      readmeUrl: plugin.readmeMarkdown ? `${baseUrl}/api/market/plugins/${plugin.slug}/readme` : null,
    },
  }
})
