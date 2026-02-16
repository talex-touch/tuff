import { getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { listCreditUsageByUsers, listTeamMembers } from '../../../../utils/creditsStore'
import { resolveActiveTeamContext } from '../../../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 20))
  const search = typeof query.q === 'string'
    ? query.q.trim()
    : (typeof query.query === 'string' ? query.query.trim() : '')

  const canViewAll = context.permissions.canViewUsage
  const memberIds = canViewAll
    ? (await listTeamMembers(event, context.team.id)).map(member => member.userId)
    : [userId]

  const result = await listCreditUsageByUsers(event, memberIds, {
    page,
    limit,
    search: search || undefined,
  })

  return {
    scope: canViewAll ? 'team' : 'self',
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
