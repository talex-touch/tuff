import { requireAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'
import { listTeamMembers } from '../../utils/creditsStore'
import { resolveActiveTeamContext } from '../../utils/teamContext'
import { listInvites } from '../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  const members = await listTeamMembers(event, context.team.id)
  const membersWithProfile = await Promise.all(members.map(async (member) => {
    const profile = await getUserById(event, member.userId)
    return {
      id: member.userId,
      userId: member.userId,
      name: profile?.name || profile?.email || member.userId,
      email: profile?.email || '',
      role: member.role,
      status: 'active',
      joinedAt: member.joinedAt,
    }
  }))

  const invites = context.permissions.canInvite
    ? await listInvites(event, context.team.id)
    : []

  return {
    team: {
      id: context.team.id,
      name: context.team.name,
      type: context.team.type,
      role: context.role,
      plan: context.ownerPlan,
      collaborationEnabled: context.collaborationEnabled,
      seats: {
        used: context.seatsUsed,
        total: context.seatsLimit,
      },
      quota: {
        aiRequests: {
          used: context.quota.aiRequestsUsed,
          limit: context.quota.aiRequestsLimit,
        },
        aiTokens: {
          used: context.quota.aiTokensUsed,
          limit: context.quota.aiTokensLimit,
        },
        weekStartDate: context.quota.weekStartDate,
      },
      permissions: context.permissions,
      upgrade: context.upgrade,
      members: membersWithProfile,
      invites,
      pendingInvites: invites.filter(invite => invite.status === 'pending').length,
      manageUrl: '/dashboard/team',
    },
  }
})
