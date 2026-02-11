import { requireAuth } from '../../../../utils/auth'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../../utils/teamContext'
import { deleteInvite, getInviteById } from '../../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canInvite', 'Only team owner/admin can remove invites')

  const inviteId = getRouterParam(event, 'id')
  if (!inviteId) {
    throw createError({ statusCode: 400, statusMessage: 'Invite ID required' })
  }

  const invite = await getInviteById(event, inviteId)
  if (!invite || invite.organizationId !== context.team.id) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }

  await deleteInvite(event, inviteId)
  return { success: true }
})
