import type { H3Event } from 'h3'
import { defineTask } from 'nitropack/runtime'
import { refreshUsdRates } from '../../utils/exchangeRateService'

/**
 * Scheduled Cloudflare Workers Cron Task (`0 *\/8 * * *`):
 * Refreshes the USD exchange rate snapshot into D1 + KV (`TUFF_INTELLIGENCE_RUNTIME`).
 */
export default defineTask({
  meta: {
    name: 'exchange:refresh',
    description: 'Refresh USD exchange rates every 8 hours into D1 and KV cache.',
  },
  async run({ context }) {
    const env = ((context as Record<string, unknown> | undefined)?.cloudflare as { env?: TuffCloudflareBindings } | undefined)?.env
      ?? (globalThis as { __env__?: TuffCloudflareBindings }).__env__

    const syntheticEvent = {
      context: {
        cloudflare: env ? { env } : undefined,
      },
      node: {
        req: { headers: {} },
        res: {},
      },
    } as unknown as H3Event

    const { snapshot, source } = await refreshUsdRates(syntheticEvent, { force: true })
    return {
      result: {
        ok: true,
        source,
        snapshotId: snapshot.id,
        base: snapshot.baseCurrency,
        currencyCount: Object.keys(snapshot.rates).length,
        fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      },
    }
  },
})
