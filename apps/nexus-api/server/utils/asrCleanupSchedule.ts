import type { H3Event } from 'h3'
import { runAfterResponse } from './afterResponse'
import { readCloudflareBindings } from './cloudflare'
import { claimMaintenanceRun } from './maintenanceLease'

export const ASR_RESULT_CLEANUP_LEASE_KEY = 'asr_result_cleanup'
const ASR_RESULT_CLEANUP_THROTTLE_MS = 60 * 1000

let nextCheckAt = 0
let scheduled = false

/**
 * The cleanup: expired settlements converge first (their private results are the only evidence
 * left), then expired results and released requests go. The store is imported here, when there is
 * work, rather than by the module that schedules it: that module sits in a middleware every request
 * runs, and middlewares are evaluated on every cold isolate.
 */
export async function runExpiredAsrResultCleanup(event: H3Event, reconcileSettlements?: () => Promise<unknown>) {
  const store = await import('./asrTranscriptionStore')
  await reconcileSettlements?.()
  const [results, released] = await Promise.all([
    store.cleanupExpiredAsrResultObjects(event),
    store.cleanupExpiredReleasedAsrRequests(event),
  ])
  return { results, released }
}

/**
 * Schedules the ASR retention work from ordinary traffic without extending request latency.
 *
 * Any request can schedule it; a global lease gives each run to one isolate, and the others pay one
 * round trip for the claim and then stay away until the lease is due. While the scheduled maintenance
 * Worker runs the cleanup it holds the lease well ahead, so traffic schedules nothing; if it stops,
 * the lease lapses and this resumes.
 */
export function scheduleExpiredAsrResultCleanup(
  event: H3Event,
  reconcileSettlements?: () => Promise<unknown>,
): void {
  const now = Date.now()
  if (scheduled || now < nextCheckAt)
    return
  scheduled = true
  nextCheckAt = now + ASR_RESULT_CLEANUP_THROTTLE_MS

  runAfterResponse(event, 'asr result cleanup', async () => {
    try {
      const db = readCloudflareBindings(event)?.DB
      if (!db)
        throw new Error('Database not available')
      const lease = await claimMaintenanceRun(db, ASR_RESULT_CLEANUP_LEASE_KEY, new Date(now), ASR_RESULT_CLEANUP_THROTTLE_MS)
      const dueAt = lease.nextRunAt ? Date.parse(lease.nextRunAt) : Number.NaN
      if (Number.isFinite(dueAt))
        nextCheckAt = Math.max(nextCheckAt, dueAt)
      if (lease.claimed)
        await runExpiredAsrResultCleanup(event, reconcileSettlements)
    }
    finally {
      scheduled = false
    }
  })
}
