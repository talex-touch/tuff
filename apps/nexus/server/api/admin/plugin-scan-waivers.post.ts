import type { PluginSecurityFindingCode } from '@talex-touch/utils/plugin'
import { readBody } from 'h3'
import { requireAdmin } from '../../utils/auth'
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
  return { waiver }
})
