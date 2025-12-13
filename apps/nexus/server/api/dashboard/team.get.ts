import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../utils/auth'
import { listInvites } from '../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)

  // 获取用户的组织成员信息
  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })

  let organizationData: {
    id: string
    name: string
    role: string
    membersCount?: number
    members?: Array<{
      id: string
      name: string
      role: string
      status: string
      email?: string
    }>
  } | null = null

  // 如果用户属于组织，获取第一个组织的信息
  if (orgMemberships.data && orgMemberships.data.length > 0) {
    const membership = orgMemberships.data[0]
    const org = membership.organization

    try {
      // 获取组织成员列表
      const orgMembers = await client.organizations.getOrganizationMembershipList({
        organizationId: org.id,
      })

      // 转换成员数据
      const members = orgMembers.data.map((member) => {
        const publicUser = member.publicUserData
        return {
          id: member.id,
          name: publicUser?.firstName
            ? `${publicUser.firstName} ${publicUser.lastName || ''}`.trim()
            : publicUser?.identifier || 'Unknown',
          role: member.role,
          status: 'active',
          email: publicUser?.identifier,
        }
      })

      organizationData = {
        id: org.id,
        name: org.name,
        role: membership.role,
        membersCount: orgMembers.totalCount || 0,
        members,
      }
    }
    catch (error) {
      console.error('Error fetching org members:', error)
      organizationData = {
        id: org.id,
        name: org.name,
        role: membership.role,
      }
    }
  }

  // 获取团队邀请列表
  let invitations: Array<{
    id: string
    code: string
    email: string | null
    role: string
    status: string
    expiresAt: string | null
    createdAt: string
  }> = []

  if (organizationData) {
    try {
      const invites = await listInvites(event, organizationData.id)
      invitations = invites
        .filter(inv => inv.status === 'pending')
        .map(inv => ({
          id: inv.id,
          code: inv.code,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        }))
    } catch (error) {
      console.error('Error fetching invites:', error)
    }
  }

  // 如果有组织，使用组织数据；否则只返回当前用户数据
  const team = organizationData
    ? {
        name: organizationData.name,
        plan: 'organization',
        slots: {
          total: organizationData.membersCount || 1,
          used: organizationData.membersCount || 1,
        },
        members: organizationData.members || [],
        invitations,
        organization: organizationData,
      }
    : {
        name: 'Personal Account',
        plan: 'free',
        slots: {
          total: 1,
          used: 1,
        },
        members: [
          {
            id: userId,
            name: user.firstName || user.username || 'You',
            role: 'Owner',
            status: 'active',
            email: user.primaryEmailAddress?.emailAddress,
          },
        ],
        invitations: [],
        organization: null,
      }

  return {
    team,
  }
})
