import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listAudits } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limitRaw = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const limit = Number.isFinite(limitRaw) ? Number(limitRaw) : undefined
  const pageRaw = typeof query.page === 'string' ? Number(query.page) : undefined
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const providerId = typeof query.providerId === 'string' ? query.providerId.trim() : null
  const targetUserId = typeof query.userId === 'string' ? query.userId.trim() : null

  await requireAdmin(event)
  const offset = (page - 1) * (limit ?? 50)

  const { audits, total } = await listAudits(event, {
    limit,
    offset,
    providerId: providerId || null,
    userId: targetUserId || null,
  })

  return { audits, total, page, pageSize: limit ?? 50 }
})
