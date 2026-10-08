import { createError, send, sendStream, setResponseHeader } from 'h3'
import { getOptionalAuth } from '../../../utils/auth'
import { openPluginPackage } from '../../../utils/pluginPackageStorage'
import { getUserById } from '../../../utils/authStore'
import { buildPluginPackageGovernanceResourceId, findVersionByPackageKey } from '../../../utils/pluginsStore'
import { resolvePluginStoreAudience } from '../../../utils/pluginStoreAccess'

export default defineEventHandler(async (event) => {
  const key = event.context.params?.key

  if (!key)
    throw createError({ statusCode: 400, statusMessage: 'Package key is required.' })

  const record = await findVersionByPackageKey(event, key)

  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  const { plugin, version } = record
  const audience = await resolvePluginStoreAudience(event)

  let viewerId: string | null = null
  let viewerIsAdmin = false

  const optionalAuth = await getOptionalAuth(event)

  if (optionalAuth) {
    viewerId = optionalAuth.userId
    const user = await getUserById(event, optionalAuth.userId)
    viewerIsAdmin = user?.role === 'admin'
  }

  const canAccessBeta = () => {
    if (audience === 'beta')
      return true
    if (version.channel !== 'BETA')
      return true
    if (viewerIsAdmin)
      return true
    if (viewerId === plugin.userId)
      return true
    return false
  }

  if (!canAccessBeta()) {
    throw createError({ statusCode: 403, statusMessage: 'You are not allowed to download this package.' })
  }

  // Streamed: a package (up to 30 MB) is no longer read whole into the isolate on its way through.
  const packageResult = await openPluginPackage(event, key, {
    governanceResourceId: buildPluginPackageGovernanceResourceId(version),
  })

  if (!packageResult)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  setResponseHeader(event, 'Content-Type', packageResult.contentType)
  setResponseHeader(event, 'Content-Length', packageResult.size)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${version.version}.tpex"`)

  return packageResult.body instanceof ReadableStream
    ? sendStream(event, packageResult.body)
    : send(event, packageResult.body)
})
