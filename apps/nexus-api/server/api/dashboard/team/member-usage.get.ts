import { requireAuth } from '../../../utils/auth'
import { isTeamRoleAdminLike, resolveActiveTeamContext } from '../../../utils/teamContext'
import { listTeamMemberUsage } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  const canViewAll = isTeamRoleAdminLike(context.role)
  const usageRows = await listTeamMemberUsage(
    event,
    context.team.id,
    canViewAll ? undefined : userId,
  )

  const usage = usageRows.map(row => ({
    userId: row.userId,
    name: row.name || row.email || row.userId,
    email: row.email || '',
    aiRequestsUsed: row.aiRequestsUsed,
    aiTokensUsed: row.aiTokensUsed,
    weekStartDate: row.weekStartDate,
    updatedAt: row.updatedAt,
  }))

  return {
    scope: canViewAll ? 'team' : 'self',
    usage,
  }
})
