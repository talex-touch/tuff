import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { consumeLoginToken, getUserById } from '../../../../utils/authStore'
import { getUserRoleInTeam } from '../../../../utils/creditsStore'
import { joinTeamWithInvite } from '../../../../utils/teamInviteValidation'
import { getInviteById } from '../../../../utils/teamStore'

function normalizeEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

async function requirePasskeyStepUp(event: H3Event, userId: string) {
  const token = getHeader(event, 'x-login-token')
  if (!token) {
    throw createError({ statusCode: 403, statusMessage: 'Passkey step-up required.' })
  }

  const stepUpUser = await consumeLoginToken(event, token, 'passkey')
  if (!stepUpUser || stepUpUser.id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Passkey step-up required.' })
  }
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

  await requirePasskeyStepUp(event, userId)

  const result = await joinTeamWithInvite(event, userId, invite.id, 'id')
  const role = await getUserRoleInTeam(event, result.validation.team.id, userId)

  return {
    joined: true,
    team: {
      id: result.validation.team.id,
      name: result.validation.team.name,
      role: role || 'member',
      seats: {
        used: result.seatsUsed,
        total: result.seatsLimit,
      },
    },
  }
})
