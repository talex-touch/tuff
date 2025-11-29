import type { H3Event } from 'h3'
import { clerkClient } from '@clerk/nuxt/server'
import { createError } from 'h3'
import { getPluginPackage } from '../../../utils/pluginPackageStorage'
import { findVersionByPackageKey } from '../../../utils/pluginsStore'

async function getOptionalAuth(event: H3Event) {
  const authFn = event.context.auth
  if (!authFn)
    return null

  try {
    const auth = await authFn()
    return auth?.userId ?? null
  }
  catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const key = event.context.params?.key

  if (!key)
    throw createError({ statusCode: 400, statusMessage: 'Package key is required.' })

  const record = await findVersionByPackageKey(event, key)

  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  const { plugin, version } = record

  let viewerId: string | null = null
  let viewerOrgIds: string[] = []
  let viewerIsAdmin = false

  const optionalUserId = await getOptionalAuth(event)

  if (optionalUserId) {
    viewerId = optionalUserId
    const client = clerkClient(event)
    const user = await client.users.getUser(viewerId)
    viewerIsAdmin = user.publicMetadata?.role === 'admin'

    const orgMemberships = await client.users.getOrganizationMembershipList({ userId: viewerId })
    viewerOrgIds = orgMemberships.data?.map(membership => membership.organization.id) ?? []
  }

  const canAccessBeta = () => {
    if (version.channel !== 'BETA')
      return true
    if (viewerIsAdmin)
      return true
    if (viewerId === plugin.userId)
      return true
    if (plugin.ownerOrgId && viewerOrgIds.includes(plugin.ownerOrgId))
      return true
    return false
  }

  if (!canAccessBeta()) {
    throw createError({ statusCode: 403, statusMessage: 'You are not allowed to download this package.' })
  }

  const packageResult = await getPluginPackage(event, key)

  if (!packageResult)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  event.node.res.setHeader('Content-Type', packageResult.contentType)
  event.node.res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
  event.node.res.setHeader('Content-Disposition', `attachment; filename="${version.version}.tpex"`)

  return packageResult.data
})
