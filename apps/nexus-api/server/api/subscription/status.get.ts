import { requireAuth } from '../../utils/auth'
import { getPlanFeatures, getUserSubscription } from '../../utils/subscriptionStore'
import { resolveActiveTeamContext } from '../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  // Independent reads, side by side: the team context's two round trips cover the subscription's one.
  const [subscription, teamContext] = await Promise.all([
    getUserSubscription(event, userId),
    resolveActiveTeamContext(event, userId),
  ])
  const features = getPlanFeatures(subscription.plan)

  return {
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    activatedAt: subscription.activatedAt,
    isActive: subscription.isActive,
    features: {
      // The week's usage is counted on the active team, so its limits are the team's too: the
      // owner's plan for an organization, the caller's own for the personal team.
      aiRequests: {
        limit: teamContext.quota.aiRequestsLimit,
        used: teamContext.quota.aiRequestsUsed,
      },
      aiTokens: {
        limit: teamContext.quota.aiTokensLimit,
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
