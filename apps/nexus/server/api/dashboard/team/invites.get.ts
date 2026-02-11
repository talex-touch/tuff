import { requireAuth } from '../../../utils/auth'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../utils/teamContext'
import { listInvites } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canInvite', 'Only team owner/admin can view invites')

  const invites = await listInvites(event, context.team.id)
  return { invites }
})
