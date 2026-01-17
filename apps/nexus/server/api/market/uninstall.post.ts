import { readBody } from 'h3'
import { decrementPluginInstalls, getPluginBySlug } from '../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string }>(event)

  if (!body?.slug)
    return { success: false, message: 'Plugin slug is required.' }

  const plugin = await getPluginBySlug(event, body.slug, { forMarket: true })

  if (!plugin)
    return { success: false, message: 'Plugin not found.' }

  await decrementPluginInstalls(event, plugin.id)

  return {
    success: true,
    slug: body.slug,
  }
})
