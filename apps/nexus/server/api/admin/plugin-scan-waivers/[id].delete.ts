import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { logAdminAudit } from '../../../utils/adminAuditStore'
import { revokePluginSecurityScanWaiver } from '../../../utils/pluginSecurityScanWaiverStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Waiver id is required.' })
  const waiver = await revokePluginSecurityScanWaiver(event, id, userId)

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'plugin_scan_waiver.revoke',
    targetType: 'plugin_scan_waiver',
    targetId: waiver.id,
    targetLabel: `${waiver.ruleId} / ${waiver.artifactSha256}`,
    metadata: {
      after: {
        ruleId: waiver.ruleId,
        artifactSha256: waiver.artifactSha256,
        revokedAt: waiver.revokedAt,
      },
    },
  })

  return { waiver }
})
