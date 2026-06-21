import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { validateInviteForUser } from '../../../utils/teamInviteValidation'
import { getInviteById } from '../../../utils/teamStore'

function normalizeEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const invitationId = getRouterParam(event, 'id')
  if (!invitationId) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation ID required' })
  }

  const user = await getUserById(event, userId)
  const invite = await getInviteById(event, invitationId)
  if (!user?.email || !invite || normalizeEmail(invite.email) !== normalizeEmail(user.email)) {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  }

  const validation = await validateInviteForUser(event, userId, invite.id, 'id')

  return {
    invitation: {
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
    },
    validation: {
      canJoin: validation.canJoin,
      reason: validation.reason,
    },
  }
})
