import { createError, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../utils/teamContext'
import { createInvite } from '../../../utils/teamStore'

interface InviteBody {
  email?: string
  role?: 'admin' | 'member'
  maxUses?: number
  expiresInDays?: number
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canInvite', 'Only team owner/admin can create invites')

  const body = await readBody<InviteBody>(event)
  const rawRole = body?.role
  const role = rawRole === 'admin' ? 'admin' : 'member'
  const expiresInDays = Number(body?.expiresInDays || 7)

  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0 || expiresInDays > 365) {
    throw createError({ statusCode: 400, statusMessage: 'expiresInDays must be between 1 and 365' })
  }

  const invite = await createInvite(event, userId, {
    organizationId: context.team.id,
    email: typeof body?.email === 'string' ? body.email : undefined,
    role,
    maxUses: Number(body?.maxUses || 1),
    expiresInDays,
  })

  return {
    invite,
    inviteUrl: `/team/join?code=${encodeURIComponent(invite.code)}`,
  }
})
