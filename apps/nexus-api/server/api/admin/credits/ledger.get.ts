import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listCreditLedgerAdmin } from '../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 20))
  const search = typeof query.q === 'string'
    ? query.q.trim()
    : (typeof query.query === 'string' ? query.query.trim() : '')

  const result = await listCreditLedgerAdmin(event, {
    page,
    limit,
    search: search || undefined,
  })

  return {
    entries: result.entries,
    pagination: {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  }
})
