import { requireAdmin } from '../../../utils/auth'
import { getPlatformGovernanceD1Readiness } from '../../../utils/platformGovernanceD1Readiness'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await getPlatformGovernanceD1Readiness(event)
})
