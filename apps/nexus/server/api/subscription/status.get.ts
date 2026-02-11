import { requireAuth } from '../../utils/auth'
import { getPlanFeatures, getUserSubscription } from '../../utils/subscriptionStore'
import { resolveActiveTeamContext } from '../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const subscription = await getUserSubscription(event, userId)
  const features = getPlanFeatures(subscription.plan)
  const teamContext = await resolveActiveTeamContext(event, userId)

  return {
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    activatedAt: subscription.activatedAt,
    isActive: subscription.isActive,
    features: {
      aiRequests: {
        limit: features.aiRequestsLimit,
        used: teamContext.quota.aiRequestsUsed,
      },
      aiTokens: {
        limit: features.aiTokensLimit,
        used: teamContext.quota.aiTokensUsed,
      },
      customModels: features.customModels,
      prioritySupport: features.prioritySupport,
      apiAccess: features.apiAccess,
    },
    team: {
      id: teamContext.team.id,
      name: teamContext.team.name,
      type: teamContext.team.type,
      role: teamContext.role,
      collaborationEnabled: teamContext.collaborationEnabled,
      seats: {
        used: teamContext.seatsUsed,
        total: teamContext.seatsLimit,
      },
      permissions: {
        canInvite: teamContext.permissions.canInvite,
        canManageMembers: teamContext.permissions.canManageMembers,
        canDisband: teamContext.permissions.canDisband,
        canCreateTeam: teamContext.permissions.canCreateTeam,
      },
      upgrade: teamContext.upgrade,
      manageUrl: '/dashboard/team',
      organization: teamContext.team.type === 'organization'
        ? {
            id: teamContext.team.id,
            role: teamContext.role,
          }
        : null,
    },
  }
})
