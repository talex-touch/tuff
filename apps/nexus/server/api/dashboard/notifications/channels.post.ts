import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { upsertPlatformGovernanceConfig } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const channel = await upsertPlatformGovernanceConfig(event, {
    ...(body ?? {}),
    configType: 'notification_channel',
  }, userId)

  return { channel }
})
