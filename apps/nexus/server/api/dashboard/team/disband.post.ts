import { requireAuth } from '../../../utils/auth'
import { deleteTeam, ensurePersonalTeam } from '../../../utils/creditsStore'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../utils/teamContext'
import { deleteTeamQuota } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canDisband', 'Only team owner can disband organization team')

  if (context.team.type !== 'organization') {
    throw createError({ statusCode: 400, statusMessage: 'Personal team cannot be disbanded' })
  }

  await deleteTeamQuota(event, context.team.id)
  await deleteTeam(event, context.team.id)
  await ensurePersonalTeam(event, userId)

  return { success: true }
})
