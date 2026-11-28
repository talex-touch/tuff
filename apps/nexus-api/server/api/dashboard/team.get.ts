import { getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'
import { listTeamMembersWithProfiles } from '../../utils/creditsStore'
import { resolveActiveTeamContext } from '../../utils/teamContext'
import { listInvites, listPendingInvitesWithTeamsForEmail } from '../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  const { userId } = auth
  const context = await resolveActiveTeamContext(event, userId)

  // The dashboard nav reads only the team's kind and the viewer's role in it, on every visit to the
  // dashboard: it skips the members, the invites and the received invites.
  if (getQuery(event).view === 'summary') {
    return {
      team: {
        id: context.team.id,
        name: context.team.name,
        type: context.team.type,
        role: context.role,
      },
    }
  }

  const currentUser = auth.user ?? await getUserById(event, userId)

  // Members (with their profiles), the team's invites and the invites this user received are
  // independent: one round trip of latency for all three. Members and received invites used to read
  // each user and each inviting team one by one.
  const [members, teamInvites, pendingInvites] = await Promise.all([
    listTeamMembersWithProfiles(event, context.team.id),
    context.permissions.canInvite ? listInvites(event, context.team.id) : Promise.resolve([]),
    context.team.type === 'personal'
      ? listPendingInvitesWithTeamsForEmail(event, currentUser?.email || '')
      : Promise.resolve([]),
  ])

  const membersWithProfile = members.map(member => ({
    id: member.userId,
    userId: member.userId,
    name: member.name || member.email || member.userId,
    email: member.email || '',
    role: member.role,
    status: 'active',
    joinedAt: member.joinedAt,
  }))

  const invites = teamInvites.map(invite => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }))

  const receivedInvites = pendingInvites.map(invite => ({
    id: invite.id,
    teamId: invite.organizationId,
    teamName: invite.teamName || invite.organizationId,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }))

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
      receivedInvites,
      pendingInvites: invites.filter(invite => invite.status === 'pending').length,
      manageUrl: '/dashboard/team',
    },
  }
})
