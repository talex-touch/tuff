import { requireAdmin } from '../../../utils/auth'
import { listPlatformGovernanceConfigs } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const policies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
  })

  return {
    policies,
    generatedAt: new Date().toISOString(),
  }
})
