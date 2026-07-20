import { createHash } from 'node:crypto'
import { createError, sendRedirect } from 'h3'
import { getPluginPackage } from '../../../../utils/pluginPackageStorage'
import {
  blockPluginVersionAdmission,
  buildPluginPackageGovernanceResourceId,
  getPluginBySlug,
  getPluginVersionEligibility,
  incrementPluginInstalls,
} from '../../../../utils/pluginsStore'
import { recordPlatformGovernanceEvent } from '../../../../utils/platformGovernanceStore'
import { resolvePluginStoreAudience } from '../../../../utils/pluginStoreAccess'
import { resolveRequestGeo } from '../../../../utils/requestGeo'

// region debug [DBG-nexus-coreapp-planprd-2026-01-12]
const DBG_SID = 'DBG-nexus-coreapp-planprd-2026-01-12'
const DBG_ENABLED = process.env.TALEX_WORKFLOW_DEBUG === DBG_SID
const DBG_LOG_PATH = '.workflow/.debug/DBG-nexus-coreapp-planprd-2026-01-12/debug.log'

async function dbgLog(
  hid: string,
  loc: string,
  msg: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!DBG_ENABLED)
    return

  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    fs.mkdirSync(path.dirname(DBG_LOG_PATH), { recursive: true })
    fs.appendFileSync(
      DBG_LOG_PATH,
      `${JSON.stringify({ sid: DBG_SID, hid, loc, msg, data, ts: Date.now() })}\n`,
    )
  }
  catch {}
}
// endregion

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
  let targetVersion = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

  if (version) {
    targetVersion = versions.find(candidate => candidate.version === version)
    if (!targetVersion)
      throw createError({ statusCode: 404, statusMessage: 'Plugin version not found.' })
  }

  if (!targetVersion?.packageUrl)
    throw createError({ statusCode: 404, statusMessage: 'No downloadable version available.' })
  if (!getPluginVersionEligibility(plugin, targetVersion, audience).eligible)
    throw createError({ statusCode: 404, statusMessage: 'No admitted version available.' })

  const artifact = await getPluginPackage(event, targetVersion.packageKey, {
    governanceResourceId: buildPluginPackageGovernanceResourceId(targetVersion),
  })
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

  // region debug [H1]
  await dbgLog(
    'H1',
    'nexus/server/api/store/plugins/[slug]/download.get.ts',
    'store plugin download requested',
    {
      slug,
      requestedVersion: version ?? null,
      selectedVersion: targetVersion.version ?? null,
      pluginId: plugin.id,
      packageUrl: targetVersion.packageUrl,
    },
  )
  // endregion

  // Track install count (fire and forget to avoid blocking redirect)
  incrementPluginInstalls(event, plugin.id).catch(() => {})
  const geo = resolveRequestGeo(event)
  recordPlatformGovernanceEvent(event, {
    scope: 'plugin',
    action: 'download',
    resourceType: 'plugin',
    resourceId: plugin.id,
    channel: targetVersion.channel,
    unit: 'download',
    quantity: 1,
    metadata: {
      slug: plugin.slug,
      version: targetVersion.version,
      artifactType: plugin.artifactType,
      packageSize: targetVersion.packageSize,
      countryCode: geo.countryCode,
      regionCode: geo.regionCode,
      timezone: geo.timezone,
    },
  }).catch(() => {})
  recordPlatformGovernanceEvent(event, {
    scope: 'plugin',
    action: 'install',
    resourceType: 'plugin',
    resourceId: plugin.id,
    channel: targetVersion.channel,
    unit: 'install',
    quantity: 1,
    metadata: {
      slug: plugin.slug,
      version: targetVersion.version,
      artifactType: plugin.artifactType,
      packageSize: targetVersion.packageSize,
      countryCode: geo.countryCode,
      regionCode: geo.regionCode,
      timezone: geo.timezone,
    },
  }).catch(() => {})

  const packageUrl = audience === 'beta'
    ? `${targetVersion.packageUrl}?channel=BETA`
    : targetVersion.packageUrl
  return sendRedirect(event, packageUrl, 302)
})
