import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'
import { listInvites } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)

  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })

  if (!orgMemberships.data || orgMemberships.data.length === 0) {
    return { invites: [] }
  }

  const membership = orgMemberships.data[0]
  const organizationId = membership.organization.id

  // Only admins and owners can view invites
  if (!['admin', 'org:admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required' })
  }

  const invites = await listInvites(event, organizationId)

  return { invites }
})
