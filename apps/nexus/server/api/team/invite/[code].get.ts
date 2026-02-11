import { requireAuth } from '../../../utils/auth'
import { validateInviteForUser } from '../../../utils/teamInviteValidation'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const code = getRouterParam(event, 'code')

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Invite code required' })
  }

  const validation = await validateInviteForUser(event, userId, code)

  return {
    invite: {
      code: validation.invite.code,
      teamId: validation.team.id,
      teamName: validation.team.name,
      expiresAt: validation.invite.expiresAt,
      status: validation.invite.status,
      role: validation.invite.role,
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
