import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../../utils/auth'
import { getOrInitTeamMemberUsage } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)

  // Determine user's current team
  const memberships = await client.users.getOrganizationMembershipList({ userId })
  if (memberships.data.length === 0) {
    return { hasTeam: false, members: [] }
  }

  const membership = memberships.data[0]
  if (!membership)
    return { hasTeam: false, members: [] }
  const organizationId = membership.organization.id

  // Fetch members from Clerk
  const orgMembers = await client.organizations.getOrganizationMembershipList({ organizationId })

  const members = [] as Array<{
    userId: string
    name: string
    email?: string
    role: string
    usage: {
      aiRequestsUsed: number
      aiTokensUsed: number
      weekStartDate: string
    }
  }>

  for (const member of orgMembers.data) {
    const id = member.publicUserData?.userId
    if (!id)
      continue

    const usage = await getOrInitTeamMemberUsage(event, organizationId, id)

    members.push({
      userId: id,
      name: member.publicUserData?.firstName
        ? `${member.publicUserData.firstName}${member.publicUserData.lastName ? ` ${member.publicUserData.lastName}` : ''}`
        : member.publicUserData?.identifier || 'Unknown',
      email: member.publicUserData?.identifier,
      role: member.role,
      usage: {
        aiRequestsUsed: usage.aiRequestsUsed,
        aiTokensUsed: usage.aiTokensUsed,
        weekStartDate: usage.weekStartDate,
      },
    })
  }

  return {
    hasTeam: true,
    organizationId,
    members,
  }
})
