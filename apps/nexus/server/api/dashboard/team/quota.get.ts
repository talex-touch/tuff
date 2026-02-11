import { requireAuth } from '../../../utils/auth'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canViewUsage', 'Only team owner/admin can view team quota')

  return {
    quota: {
      organizationId: context.quota.organizationId,
      plan: context.quota.plan,
      aiRequests: {
        used: context.quota.aiRequestsUsed,
        limit: context.quota.aiRequestsLimit,
      },
      aiTokens: {
        used: context.quota.aiTokensUsed,
        limit: context.quota.aiTokensLimit,
      },
      seats: {
        used: context.seatsUsed,
        total: context.seatsLimit,
      },
      weekStartDate: context.quota.weekStartDate,
      updatedAt: context.quota.updatedAt,
    },
  }
})
