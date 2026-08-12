import { readBody } from 'h3'
import { hashIpValue } from '../../utils/adminEmergencyStore'
import { enforceAdminRateLimit } from '../../utils/adminRateLimitStore'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import { decrementPluginInstalls, getPluginBySlug } from '../../utils/pluginsStore'

/**
 * Rate limits for the anonymous install-counter decrement.
 *
 * The endpoint has no auth guard and no proof the caller ever installed the plugin, so an
 * anonymous loop of POST {"slug":"competitor-plugin"} could drive any plugin's publicly
 * displayed install count to 0 within seconds (#922).
 *
 * Authentication is deliberately NOT added here. The shipped client
 * (core-app store-api.service.ts reportPluginUninstall) posts only `{ slug }` with no
 * credentials and ignores the response, so requiring a session would silently stop every
 * genuine uninstall from being counted. Closing that properly means changing the client and
 * recording uninstalls per identity, which needs its own task; until then these limits blunt
 * the described attack without breaking the real caller.
 *
 * A real user uninstalls a handful of plugins in a sitting, never hundreds, so these ceilings
 * sit far above legitimate traffic.
 */
const UNINSTALL_RATE_LIMIT = {
  /** Total decrements one address may report. */
  perIp: { limit: 30, windowMs: 10 * 60_000 },
  /** Decrements one address may report against a single plugin -- the targeted-attack shape. */
  perIpPlugin: { limit: 5, windowMs: 10 * 60_000 },
} as const

export default defineEventHandler(async (event) => {
  const body = await readBody<{ slug?: string }>(event)

  if (!body?.slug)
    return { success: false, message: 'Plugin slug is required.' }

  const ip = resolveRequestIp(event)
  if (ip) {
    const ipHash = hashIpValue(event, ip)

    await enforceAdminRateLimit(event, {
      key: `store-uninstall:ip:${ipHash}`,
      ...UNINSTALL_RATE_LIMIT.perIp,
    })
    await enforceAdminRateLimit(event, {
      key: `store-uninstall:ip-plugin:${ipHash}:${body.slug}`,
      ...UNINSTALL_RATE_LIMIT.perIpPlugin,
    })
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
