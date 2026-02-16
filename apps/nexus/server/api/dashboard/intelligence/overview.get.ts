import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listAudits } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const limitRaw = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 50), 500) : 200

  const { audits } = await listAudits(event, { limit })

  let totalTokens = 0
  let totalLatency = 0
  let latencyCount = 0
  let successCount = 0

  const modelMap = new Map<string, { count: number; tokens: number }>()
  const providerMap = new Map<string, { count: number; tokens: number }>()
  const ipMap = new Map<string, { count: number }>()
  const countryMap = new Map<string, { count: number }>()

  for (const log of audits) {
    if (log.success)
      successCount += 1
    if (typeof log.latency === 'number') {
      totalLatency += log.latency
      latencyCount += 1
    }

    const tokens = typeof log.metadata?.tokens === 'number' ? log.metadata.tokens : 0
    totalTokens += tokens

    const modelEntry = modelMap.get(log.model) ?? { count: 0, tokens: 0 }
    modelEntry.count += 1
    modelEntry.tokens += tokens
    modelMap.set(log.model, modelEntry)

    const providerName = log.providerName || log.providerType
    const providerEntry = providerMap.get(providerName) ?? { count: 0, tokens: 0 }
    providerEntry.count += 1
    providerEntry.tokens += tokens
    providerMap.set(providerName, providerEntry)

    const ip = typeof log.metadata?.ip === 'string' ? log.metadata.ip : ''
    if (ip) {
      ipMap.set(ip, { count: (ipMap.get(ip)?.count ?? 0) + 1 })
    }

    const country = typeof log.metadata?.country === 'string' ? log.metadata.country : ''
    if (country) {
      countryMap.set(country, { count: (countryMap.get(country)?.count ?? 0) + 1 })
    }
  }

  const toSortedList = (map: Map<string, { count: number; tokens?: number }>, top = 8) => {
    return Array.from(map.entries())
      .map(([label, entry]) => ({ label, count: entry.count, tokens: entry.tokens ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, top)
  }

  return {
    summary: {
      totalRequests: audits.length,
      successRate: audits.length ? Math.round((successCount / audits.length) * 100) : 0,
      avgLatency: latencyCount ? Math.round(totalLatency / latencyCount) : 0,
      totalTokens,
      sampleSize: audits.length,
    },
    models: toSortedList(modelMap, 8),
    providers: toSortedList(providerMap, 6),
    ips: toSortedList(ipMap, 8),
    countries: toSortedList(countryMap, 8),
  }
})
