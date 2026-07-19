import { getQuery } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { listPluginSecurityScanWaivers } from '../../utils/pluginSecurityScanWaiverStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const artifactSha256 = typeof query.artifactSha256 === 'string'
    ? query.artifactSha256
    : undefined
  const waivers = await listPluginSecurityScanWaivers(event, artifactSha256)
  return { waivers }
})
