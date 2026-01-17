import type { SubscriptionPlan } from '../../../utils/subscriptionStore'
import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'
import { getTeamQuota, PLAN_CONFIG } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)

  try {
    // Get user's organization memberships
    const memberships = await client.users.getOrganizationMembershipList({ userId })

    if (memberships.data.length === 0) {
      return {
        hasTeam: false,
        quota: null,
      }
    }

    const membership = memberships.data[0]
    const organizationId = membership.organization.id

    // Get organization details to find owner
    const orgMembers = await client.organizations.getOrganizationMembershipList({
      organizationId,
    })

    // Find the owner/admin to determine plan
    const owner = orgMembers.data.find(m => m.role === 'org:admin' || m.role === 'admin')
    let ownerPlan: SubscriptionPlan = 'FREE'

    if (owner?.publicUserData?.userId) {
      const ownerUser = await client.users.getUser(owner.publicUserData.userId)
      const planFromMeta = ownerUser.publicMetadata?.plan as string | undefined
      if (planFromMeta && ['FREE', 'PLUS', 'PRO', 'ENTERPRISE', 'TEAM'].includes(planFromMeta)) {
        ownerPlan = planFromMeta as SubscriptionPlan
      }
    }

    // Get team quota with weekly reset logic
    const quota = await getTeamQuota(event, organizationId, ownerPlan)

    return {
      hasTeam: true,
      quota: {
        ...quota,
        planConfig: PLAN_CONFIG[ownerPlan] || PLAN_CONFIG.FREE,
      },
    }
  }
  catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('[team/quota] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to get team quota',
    })
  }
})
