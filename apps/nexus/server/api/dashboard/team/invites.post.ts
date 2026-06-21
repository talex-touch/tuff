import { createError, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { getUserByEmail, getUserById } from '../../../utils/authStore'
import { isUserTeamMember, listUserTeams } from '../../../utils/creditsStore'
import { assertTeamCapability, resolveActiveTeamContext } from '../../../utils/teamContext'
import { createInvite, hasInviteForEmail } from '../../../utils/teamStore'

interface InviteBody {
  target?: string
  role?: 'admin' | 'member'
  expiresInDays?: number
}

function normalizeTarget(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const context = await resolveActiveTeamContext(event, userId)

  assertTeamCapability(context, 'canInvite', 'Only team owner/admin can create invites')

  const body = await readBody<InviteBody>(event)
  const rawRole = body?.role
  const role = rawRole === 'admin' ? 'admin' : 'member'
  const expiresInDays = Number(body?.expiresInDays || 7)
  const target = normalizeTarget(body?.target)

  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0 || expiresInDays > 365) {
    throw createError({ statusCode: 400, statusMessage: 'expiresInDays must be between 1 and 365' })
  }

  if (!target) {
    throw createError({ statusCode: 400, statusMessage: 'Invite target required' })
  }

  const targetUser = target.includes('@')
    ? await getUserByEmail(event, target)
    : await getUserById(event, target)

  if (!targetUser || targetUser.status !== 'active' || !targetUser.email) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (targetUser.id === userId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot invite yourself' })
  }

  if (await isUserTeamMember(event, context.team.id, targetUser.id)) {
    throw createError({ statusCode: 409, statusMessage: 'User is already a team member' })
  }

  const targetOrganizationTeam = (await listUserTeams(event, targetUser.id)).find(team => team.type === 'organization')
  if (targetOrganizationTeam) {
    throw createError({ statusCode: 409, statusMessage: 'User is already in an organization team' })
  }

  if (await hasInviteForEmail(event, targetUser.email, context.team.id)) {
    throw createError({ statusCode: 409, statusMessage: 'Invite already pending for this user' })
  }

  const invite = await createInvite(event, userId, {
    organizationId: context.team.id,
    email: targetUser.email,
    role,
    maxUses: 1,
    expiresInDays,
  })

  return {
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    },
  }
})
