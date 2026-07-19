import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { revokePluginSecurityScanWaiver } from '../../../utils/pluginSecurityScanWaiverStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Waiver id is required.' })
  const waiver = await revokePluginSecurityScanWaiver(event, id, userId)
  return { waiver }
})
