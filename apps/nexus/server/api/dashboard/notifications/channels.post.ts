import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { resolveNotificationChannelProfile, resolveNotificationChannelReadiness } from '../../../utils/notificationChannelCatalog'
import { upsertPlatformGovernanceConfig } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const channel = await upsertPlatformGovernanceConfig(event, {
    ...(body ?? {}),
    configType: 'notification_channel',
  }, userId)
  const profile = resolveNotificationChannelProfile(channel)
  const readiness = resolveNotificationChannelReadiness(channel)

  return {
    channel,
    profile,
    readiness,
  }
})
