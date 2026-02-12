import { requireAuth } from '../../../utils/auth'
import { getLatestSyncSessionStatus, getOrInitQuota, listKeyrings } from '../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const [quota, keyrings, session] = await Promise.all([
    getOrInitQuota(event, userId),
    listKeyrings(event, userId),
    getLatestSyncSessionStatus(event, userId),
  ])

  return {
    plan_tier: quota.plan_tier,
    quotas: quota,
    keyring_count: keyrings.length,
    keyrings: keyrings.slice(0, 20),
    session,
    generated_at: new Date().toISOString(),
  }
})
