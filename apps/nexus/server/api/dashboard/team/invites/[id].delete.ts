import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../../utils/auth'
import { getInviteById, revokeInvite } from '../../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invite ID is required' })
  }

  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })

  if (!orgMemberships.data || orgMemberships.data.length === 0) {
    throw createError({ statusCode: 403, statusMessage: 'Not in an organization' })
  }

  const membership = orgMemberships.data[0]
  const organizationId = membership.organization.id

  // Only admins and owners can revoke invites
  if (!['admin', 'org:admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required' })
  }

  // Verify invite belongs to this organization
  const invite = await getInviteById(event, id)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }

  if (invite.organizationId !== organizationId) {
    throw createError({ statusCode: 403, statusMessage: 'Invite does not belong to your organization' })
  }

  await revokeInvite(event, id, userId)

  return { success: true }
})
