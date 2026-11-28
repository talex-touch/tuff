import { defineEventHandler, readBody } from 'h3'
import { decrementPluginInstalls, getPluginBySlug } from '../../utils/pluginsStore'
import { enforceRateLimit } from '../../utils/rateLimit'
import { hashIpForRateLimit, resolveRequestIp } from '../../utils/requestIp'

const UNINSTALL_RATE_LIMIT = {
  perIp: { limit: 30, windowMs: 10 * 60_000 },
  perIpPlugin: { limit: 5, windowMs: 10 * 60_000 },
} as const

export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string }>(event)

  if (!body?.slug)
    return { success: false, message: 'Plugin slug is required.' }

  const ip = resolveRequestIp(event)
  if (ip) {
    const ipHash = hashIpForRateLimit(ip)
    await Promise.all([
      enforceRateLimit(event, {
        key: `store-uninstall:ip:${ipHash}`,
        ...UNINSTALL_RATE_LIMIT.perIp,
      }),
      enforceRateLimit(event, {
        key: `store-uninstall:ip-plugin:${ipHash}:${body.slug}`,
        ...UNINSTALL_RATE_LIMIT.perIpPlugin,
      }),
    ])
  }

  const plugin = await getPluginBySlug(event, body.slug, { forStore: true })
  if (!plugin)
    return { success: false, message: 'Plugin not found.' }

  await decrementPluginInstalls(event, plugin.id)

  return {
    success: true,
    slug: body.slug,
  }
})
