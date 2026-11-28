import { defineEventHandler } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import {
  getLatestSyncSessionStatus,
  getOrInitQuota,
  listKeyrings,
} from '../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const [quota, keyrings, latestSession] = await Promise.all([
    getOrInitQuota(event, userId),
    listKeyrings(event, userId),
    getLatestSyncSessionStatus(event, userId),
  ])

  return {
    quota,
    keyrings,
    latestSession,
    generatedAt: new Date().toISOString(),
  }
})
