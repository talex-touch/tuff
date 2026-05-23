import { requireAdmin } from '../../../utils/auth'
import { listNotificationChannelProfiles, resolveNotificationChannelProfile, resolveNotificationChannelReadiness } from '../../../utils/notificationChannelCatalog'
import { listPlatformGovernanceConfigs } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const channels = await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })

  return {
    channels,
    evaluations: channels.map((channel) => {
      const profile = resolveNotificationChannelProfile(channel)
      const readiness = resolveNotificationChannelReadiness(channel)
      return {
        configId: channel.id,
        profile,
        readiness,
      }
    }),
    profiles: listNotificationChannelProfiles(),
    generatedAt: new Date().toISOString(),
  }
})
