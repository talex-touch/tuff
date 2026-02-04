import { Buffer } from 'node:buffer'
import { createError, send, setResponseHeader } from 'h3'
import { getOptionalAuth } from '../../../utils/auth'
import { getPluginPackage } from '../../../utils/pluginPackageStorage'
import { getUserById } from '../../../utils/authStore'
import { findVersionByPackageKey } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const key = event.context.params?.key

  if (!key)
    throw createError({ statusCode: 400, statusMessage: 'Package key is required.' })

  const record = await findVersionByPackageKey(event, key)

  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  const { plugin, version } = record

  let viewerId: string | null = null
  let viewerIsAdmin = false

  const optionalAuth = await getOptionalAuth(event)

  if (optionalAuth) {
    viewerId = optionalAuth.userId
    const user = await getUserById(event, optionalAuth.userId)
    viewerIsAdmin = user?.role === 'admin'
  }

  const canAccessBeta = () => {
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

  const packageResult = await getPluginPackage(event, key)

  if (!packageResult)
    throw createError({ statusCode: 404, statusMessage: 'Package not found.' })

  // Ensure we have a proper Buffer for binary response
  const buffer = Buffer.isBuffer(packageResult.data)
    ? packageResult.data
    : Buffer.from(packageResult.data)

  setResponseHeader(event, 'Content-Type', packageResult.contentType)
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${version.version}.tpex"`)

  return send(event, buffer)
})
