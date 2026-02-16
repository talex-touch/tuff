import { requireAdmin } from '../../../utils/auth'
import { listAdminAudits } from '../../../utils/adminAuditStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const search = typeof query.q === 'string'
    ? query.q.trim()
    : (typeof query.query === 'string' ? query.query.trim() : '')
  const action = typeof query.action === 'string' ? query.action.trim() : ''
  const targetType = typeof query.targetType === 'string' ? query.targetType.trim() : ''
  const adminUserId = typeof query.adminUserId === 'string' ? query.adminUserId.trim() : ''

  const { audits, total } = await listAdminAudits(event, {
    page,
    limit,
    search: search || undefined,
    action: action || undefined,
    targetType: targetType || undefined,
    adminUserId: adminUserId || undefined,
  })

  return {
    audits,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})
