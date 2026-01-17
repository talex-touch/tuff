import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'
import { createInvite } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)
  const body = await readBody(event)

  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })

  if (!orgMemberships.data || orgMemberships.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'You must be in an organization to create invites' })
  }

  const membership = orgMemberships.data[0]
  if (!membership)
    throw createError({ statusCode: 400, statusMessage: 'You must be in an organization to create invites' })
  const organizationId = membership.organization.id

  // Only admins and owners can create invites
  if (!['admin', 'org:admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required' })
  }

  const { email, role, maxUses, expiresInDays } = body

  const invite = await createInvite(event, userId, {
    organizationId,
    email: email || undefined,
    role: role === 'admin' ? 'admin' : 'member',
    maxUses: typeof maxUses === 'number' ? Math.max(1, Math.min(100, maxUses)) : 1,
    expiresInDays: typeof expiresInDays === 'number' ? Math.max(1, Math.min(30, expiresInDays)) : 7,
  })

  return { invite }
})
