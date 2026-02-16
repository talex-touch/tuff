import { requireAuth } from '../../../../utils/auth'
import { listCreditTrendByUsers, listTeamMembers } from '../../../../utils/creditsStore'
import { resolveActiveTeamContext } from '../../../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  const canViewAll = context.permissions.canViewUsage
  const memberIds = canViewAll
    ? (await listTeamMembers(event, context.team.id)).map(member => member.userId)
    : [userId]

  const result = await listCreditTrendByUsers(event, memberIds)

  return {
    days: result.days,
    values: result.values,
    totalUsed: result.totalUsed,
  }
})
