import { requireAdmin } from '../../../utils/auth'
import { listPlatformGovernanceConfigs } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const channels = await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })

  return {
    channels,
    generatedAt: new Date().toISOString(),
  }
})
