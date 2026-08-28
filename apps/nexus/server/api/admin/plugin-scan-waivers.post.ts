import type { PluginSecurityFindingCode } from '@talex-touch/utils/plugin'
import { readBody } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { logAdminAudit } from '../../utils/adminAuditStore'
import { createPluginSecurityScanWaiver } from '../../utils/pluginSecurityScanWaiverStore'

interface CreateWaiverBody {
  artifactSha256: string
  ruleId: PluginSecurityFindingCode
  reason: string
  expiresAt: string
  ticket?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<CreateWaiverBody>(event)
  const waiver = await createPluginSecurityScanWaiver(event, userId, body)

  // A waiver suppresses a security scan finding for a specific artifact, so the
  // rule it silences and the artifact it applies to both belong in the trail.
  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'plugin_scan_waiver.create',
    targetType: 'plugin_scan_waiver',
    targetId: waiver.id,
    targetLabel: `${waiver.ruleId} / ${waiver.artifactSha256}`,
    metadata: {
      after: {
        ruleId: waiver.ruleId,
        artifactSha256: waiver.artifactSha256,
        reason: waiver.reason,
        expiresAt: waiver.expiresAt,
        ticket: waiver.ticket ?? null,
      },
    },
  })

  return { waiver }
})
