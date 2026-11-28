import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError, defineEventHandler, getQuery, send, setResponseHeader } from 'h3'
import { runAfterResponse } from '../../../../utils/afterResponse'
import { getPluginPackage } from '../../../../utils/pluginPackageStorage'
import {
  blockPluginVersionAdmission,
  getPluginBySlug,
  getPluginVersionEligibility,
  incrementPluginInstalls,
} from '../../../../utils/pluginsStore'
import { resolvePluginStoreAudience } from '../../../../utils/pluginStoreAccess'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug
  const query = getQuery(event)
  const version = query.version as string | undefined

  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })
  const audience = await resolvePluginStoreAudience(event)

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forStore: true,
    audience,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const versions = plugin.versions ?? []
  let targetVersion: (typeof versions)[number] | undefined = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

  if (version) {
    targetVersion = versions.find(candidate => candidate.version === version)
    if (!targetVersion)
      throw createError({ statusCode: 404, statusMessage: 'Plugin version not found.' })
  }

  if (!targetVersion?.packageUrl)
    throw createError({ statusCode: 404, statusMessage: 'No downloadable version available.' })
  if (!getPluginVersionEligibility(plugin, targetVersion, audience).eligible)
    throw createError({ statusCode: 404, statusMessage: 'No admitted version available.' })

  const artifact = await getPluginPackage(event, targetVersion.packageKey)
  if (!artifact) {
    await blockPluginVersionAdmission(event, plugin.id, targetVersion.id, 'artifact-missing')
    throw createError({ statusCode: 404, statusMessage: 'Plugin artifact is unavailable.' })
  }
  const artifactBytes = artifact.data instanceof ArrayBuffer
    ? new Uint8Array(artifact.data)
    : artifact.data
  const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex')
  if (artifactSha256 !== targetVersion.artifactSha256) {
    await blockPluginVersionAdmission(event, plugin.id, targetVersion.id, 'artifact-digest-mismatch')
    throw createError({ statusCode: 409, statusMessage: 'Plugin artifact is quarantined.' })
  }

  runAfterResponse(event, 'plugin download accounting', () => incrementPluginInstalls(event, plugin.id))

  const buffer = Buffer.isBuffer(artifact.data) ? artifact.data : Buffer.from(artifactBytes)
  setResponseHeader(event, 'Content-Type', artifact.contentType || 'application/octet-stream')
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${targetVersion.version}.tpex"`)
  return send(event, buffer)
})
