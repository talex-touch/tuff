import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'
import { deleteTeamQuota } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)

  try {
    // Get user's organization memberships
    const memberships = await client.users.getOrganizationMembershipList({ userId })
    
    if (memberships.data.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'You are not part of any team' })
    }

    // Find the organization where user is admin/owner
    const adminMembership = memberships.data.find(m => 
      m.role === 'org:admin' || m.role === 'admin'
    )

    if (!adminMembership) {
      throw createError({ statusCode: 403, statusMessage: 'Only team owner can disband the team' })
    }

    const organizationId = adminMembership.organization.id

    // Get all members of the organization
    const orgMembers = await client.organizations.getOrganizationMembershipList({
      organizationId,
    })

    // Remove all members first
    for (const member of orgMembers.data) {
      if (member.publicUserData?.userId !== userId) {
        await client.organizations.deleteOrganizationMembership({
          organizationId,
          userId: member.publicUserData?.userId!,
        })
      }
    }

    // Delete team quota and invites from our database
    await deleteTeamQuota(event, organizationId)

    // Delete the organization
    await client.organizations.deleteOrganization(organizationId)

    return {
      success: true,
      message: 'Team has been disbanded',
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('[team/disband] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.errors?.[0]?.message || error.message || 'Failed to disband team',
    })
  }
})
