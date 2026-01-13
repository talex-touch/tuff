import { createError, sendRedirect } from 'h3'
import { getPluginBySlug, incrementPluginInstalls } from '../../../../utils/pluginsStore'

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

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: true,
    forMarket: true,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const versions = plugin.versions ?? []
  let targetVersion = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

  if (version) {
    const specificVersion = versions.find(v => v.version === version)
    if (specificVersion) {
      targetVersion = specificVersion
    }
  }

  if (!targetVersion?.packageUrl)
    throw createError({ statusCode: 404, statusMessage: 'No downloadable version available.' })

  // region debug [H1]
  await dbgLog(
    'H1',
    'nexus/server/api/market/plugins/[slug]/download.get.ts',
    'market plugin download requested',
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

  return sendRedirect(event, targetVersion.packageUrl, 302)
})
