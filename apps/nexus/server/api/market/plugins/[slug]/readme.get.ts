import { createError, setHeader } from 'h3'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: false,
    forMarket: true,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const readme = plugin.readmeMarkdown || ''

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=300')

  return readme
})
