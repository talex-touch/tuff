import { readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { getUserRoleInTeam } from '../../utils/creditsStore'
import { joinTeamWithInvite } from '../../utils/teamInviteValidation'

interface JoinBody {
  code?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody<JoinBody>(event)
  const code = (body?.code || '').trim()

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Invite code required' })
  }

  const result = await joinTeamWithInvite(event, userId, code)
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
