import { readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { createOrganizationTeam } from '../../../utils/creditsStore'
import { resolveActiveTeamContext } from '../../../utils/teamContext'
import { getTeamQuota, updateTeamSeats } from '../../../utils/teamStore'

interface CreateTeamBody {
  name?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  if (context.team.type === 'organization') {
    return {
      created: false,
      team: {
        id: context.team.id,
        name: context.team.name,
        type: context.team.type,
        role: context.role,
        plan: context.ownerPlan,
        seats: {
          used: context.seatsUsed,
          total: context.seatsLimit,
        },
      },
    }
  }

  if (!context.permissions.canCreateTeam) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Upgrade to TEAM to create organization team',
      data: {
        upgrade: context.upgrade,
      },
    })
  }

  const body = await readBody<CreateTeamBody>(event)
  const team = await createOrganizationTeam(event, userId, body?.name)
  const quota = await getTeamQuota(event, team.id, context.ownerPlan)
  await updateTeamSeats(event, team.id, 1)

  return {
    created: true,
    team: {
      id: team.id,
      name: team.name,
      type: team.type,
      role: 'owner',
      plan: context.ownerPlan,
      seats: {
        used: 1,
        total: quota.seatsLimit,
      },
    },
  }
})
