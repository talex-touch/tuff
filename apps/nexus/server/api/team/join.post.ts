import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../utils/auth'
import { getInviteByCode, useInvite } from '../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)
  const body = await readBody(event)

  const { code } = body
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invite code is required' })
  }

  // Check if user is already in an organization
  const existingMemberships = await client.users.getOrganizationMembershipList({ userId })
  if (existingMemberships.data && existingMemberships.data.length > 0) {
    throw createError({ 
      statusCode: 400, 
      statusMessage: 'You are already a member of an organization. Leave your current organization first.' 
    })
  }

  // Validate and use the invite
  const invite = await getInviteByCode(event, code.toUpperCase())
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invalid invite code' })
  }

  // Check if invite is for specific email
  if (invite.email) {
    const user = await client.users.getUser(userId)
    const userEmail = user.primaryEmailAddress?.emailAddress
    if (userEmail?.toLowerCase() !== invite.email.toLowerCase()) {
      throw createError({ 
        statusCode: 403, 
        statusMessage: 'This invite is for a specific email address' 
      })
    }
  }

  // Use the invite (increments usage counter, checks expiration)
  const usedInvite = await useInvite(event, code)

  // Add user to the organization via Clerk
  try {
    await client.organizations.createOrganizationMembership({
      organizationId: usedInvite.organizationId,
      userId,
      role: usedInvite.role === 'admin' ? 'org:admin' : 'org:member',
    })
  } catch (error: any) {
    // If Clerk fails, the invite was already consumed - log error
    console.error('[team/join] Failed to add user to organization:', error)
    throw createError({ 
      statusCode: 500, 
      statusMessage: 'Failed to join organization. Please contact support.' 
    })
  }

  // Get updated organization info
  const org = await client.organizations.getOrganization({
    organizationId: usedInvite.organizationId,
  })

  return {
    success: true,
    organization: {
      id: org.id,
      name: org.name,
      role: usedInvite.role,
    },
  }
})
