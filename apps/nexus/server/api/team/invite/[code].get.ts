import { clerkClient } from '@clerk/nuxt/server'
import { getInviteByCode } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Invite code is required' })
  }

  const invite = await getInviteByCode(event, code.toUpperCase())
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invalid invite code' })
  }

  // Check if expired
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Invite has expired' })
  }

  if (invite.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: `Invite is ${invite.status}` })
  }

  if (invite.uses >= invite.maxUses) {
    throw createError({ statusCode: 400, statusMessage: 'Invite has reached max uses' })
  }

  // Get organization info
  const client = clerkClient(event)
  let organizationName = 'Unknown Organization'

  try {
    const org = await client.organizations.getOrganization({
      organizationId: invite.organizationId,
    })
    organizationName = org.name
  } catch {
    // Organization might not be accessible
  }

  return {
    invite: {
      code: invite.code,
      organizationName,
      role: invite.role,
      expiresAt: invite.expiresAt,
      requiresEmail: !!invite.email,
    },
  }
})
