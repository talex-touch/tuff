import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listCreditUsageAdmin } from '../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 20))
  const search = typeof query.q === 'string'
    ? query.q.trim()
    : (typeof query.query === 'string' ? query.query.trim() : '')

  const result = await listCreditUsageAdmin(event, {
    page,
    limit,
    search: search || undefined,
  })

  return {
    month: result.month,
    totalUsed: result.totalUsed,
    totalQuota: result.totalQuota,
    users: result.users,
    pagination: {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  }
})
