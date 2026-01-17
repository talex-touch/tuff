import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)
  const body = await readBody(event)

  const { name } = body
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Team name must be at least 2 characters' })
  }

  try {
    // Check if user already has an organization
    const memberships = await client.users.getOrganizationMembershipList({ userId })
    if (memberships.data.length > 0) {
      throw createError({ statusCode: 400, statusMessage: 'You are already part of a team' })
    }

    // Create organization via Clerk (createdBy auto-adds creator as admin)
    const organization = await client.organizations.createOrganization({
      name: name.trim(),
      createdBy: userId,
    })

    return {
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    }
  }
  catch (error: any) {
    // Handle Clerk API errors
    if (error.statusCode) {
      throw error
    }
    console.error('[team/create] Clerk API error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.errors?.[0]?.message || error.message || 'Failed to create team',
    })
  }
})
