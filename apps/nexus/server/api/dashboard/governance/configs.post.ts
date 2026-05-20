import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { upsertPlatformGovernanceConfig } from '../../../utils/platformGovernanceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)
  const config = await upsertPlatformGovernanceConfig(event, body ?? {}, userId)

  return { config }
})
