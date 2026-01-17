import { clerkClient } from '@clerk/nuxt/server'
import { getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { listPlugins } from '../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)
  const isAdmin = user.publicMetadata?.role === 'admin'

  const orgMemberships = await client.users.getOrganizationMembershipList({ userId })
  const viewerOrgIds = orgMemberships.data?.map(membership => membership.organization.id) ?? []

  const pluginStatusIds = ['draft', 'pending', 'approved', 'rejected'] as const
  type PluginStatus = typeof pluginStatusIds[number]

  const query = getQuery(event)
  const statusQuery = typeof query.status === 'string' ? query.status : undefined
  const statusFilter = statusQuery
    ? statusQuery
        .split(',')
        .map(item => item.trim())
        .filter((item): item is PluginStatus => pluginStatusIds.includes(item as PluginStatus))
    : undefined

  // Admin 可以看到所有 plugins，普通用户只能看到自己的
  const plugins = await listPlugins(event, {
    includeVersions: true,
    viewerId: userId,
    viewerOrgIds,
    viewerIsAdmin: isAdmin,
    ownerId: isAdmin ? undefined : userId,
    statuses: isAdmin ? statusFilter : undefined,
  })

  const enriched = plugins.map((plugin) => {
    const versions = plugin.versions ?? []
    const latest = versions.find(version => version.id === plugin.latestVersionId) ?? versions[0] ?? null
    return {
      ...plugin,
      latestVersion: latest,
    }
  })

  return {
    featured: enriched.filter(plugin => plugin.badges.includes('featured')),
    plugins: enriched,
    total: enriched.length,
  }
})
