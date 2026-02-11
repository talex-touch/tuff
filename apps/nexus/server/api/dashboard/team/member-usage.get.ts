import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
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

  const usage = await Promise.all(usageRows.map(async (row) => {
    const profile = await getUserById(event, row.userId)
    return {
      userId: row.userId,
      name: profile?.name || profile?.email || row.userId,
      email: profile?.email || '',
      aiRequestsUsed: row.aiRequestsUsed,
      aiTokensUsed: row.aiTokensUsed,
      weekStartDate: row.weekStartDate,
      updatedAt: row.updatedAt,
    }
  }))

  return {
    scope: canViewAll ? 'team' : 'self',
    usage,
  }
})
