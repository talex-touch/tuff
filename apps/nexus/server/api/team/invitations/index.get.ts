import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { validateInviteForUser } from '../../../utils/teamInviteValidation'
import { listPendingInvitesForEmail } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const user = await getUserById(event, userId)

  if (!user?.email) {
    return { invitations: [] }
  }

  const invites = await listPendingInvitesForEmail(event, user.email)
  const invitations = await Promise.all(invites.map(async (invite) => {
    const validation = await validateInviteForUser(event, userId, invite.id, 'id')

    return {
      id: invite.id,
      teamId: validation.team.id,
      teamName: validation.team.name,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      seats: {
        used: validation.seatsUsed,
        total: validation.seatsLimit,
      },
      validation: {
        canJoin: validation.canJoin,
        reason: validation.reason,
      },
    }
  }))

  return { invitations }
})
