import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listAudits } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const targetUserId = typeof query.userId === 'string' ? query.userId.trim() : ''
  if (!targetUserId) {
    return { ok: false, error: 'Missing userId' }
  }

  const limitRaw = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 50), 500) : 200

  const { audits, total } = await listAudits(event, { limit, userId: targetUserId })

  let totalTokens = 0
  let successCount = 0
  let lastSeenAt: string | null = null
  const modelMap = new Map<string, { count: number; tokens: number }>()

  for (const log of audits) {
    if (!lastSeenAt)
      lastSeenAt = log.createdAt
    if (log.success)
      successCount += 1
    const tokens = typeof log.metadata?.tokens === 'number' ? log.metadata.tokens : 0
    totalTokens += tokens
    const entry = modelMap.get(log.model) ?? { count: 0, tokens: 0 }
    entry.count += 1
    entry.tokens += tokens
    modelMap.set(log.model, entry)
  }

  const models = Array.from(modelMap.entries())
    .map(([label, entry]) => ({ label, count: entry.count, tokens: entry.tokens }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return {
    ok: true,
    result: {
      userId: targetUserId,
      totalRequests: total,
      sampleSize: audits.length,
      totalTokens,
      successRate: audits.length ? Math.round((successCount / audits.length) * 100) : 0,
      lastSeenAt,
      models,
    },
  }
})
