import { requireAuth } from '../../../utils/auth'
import { resolveActiveTeamContext } from '../../../utils/teamContext'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  return {
    allowed: true,
    reason: context.collaborationEnabled ? 'enabled' : 'personal',
    permissions: context.permissions,
    upgrade: context.upgrade,
    teamType: context.team.type,
  }
})
