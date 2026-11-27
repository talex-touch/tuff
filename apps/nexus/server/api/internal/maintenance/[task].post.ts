import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { ASR_RESULT_CLEANUP_LEASE_KEY, runExpiredAsrResultCleanup } from '../../../utils/asrCleanupSchedule'
import { reconcileExpiredAsrSettlements } from '../../../utils/asrTranscriptionService'
import { readCloudflareBindings } from '../../../utils/cloudflare'
import { cleanupDocEngagementRecords } from '../../../utils/docAnalyticsStore'
import { holdMaintenanceRun } from '../../../utils/maintenanceLease'
import { finalizeExpiredAccountDeletions } from '../../../utils/privacyDataStore'
import { runTelemetryRetentionMaintenanceIfDue } from '../../../utils/telemetryRetentionMaintenance'

/**
 * Maintenance the scheduled maintenance Worker (`apps/nexus/maintenance-worker`) runs on its own
 * clock, instead of ordinary traffic carrying it. Answers only to that Worker's shared secret; any
 * other caller, or a deployment without the secret, gets a 404.
 *
 * - `asr`: holds the ASR cleanup lease for two of the Worker's periods, so traffic stays away, then
 *   runs the cleanup.
 * - `retention`: telemetry and governance retention, when its lease says it is due.
 * - `docs`: engagement sessions, nonces and challenges past their retention.
 */
const ASR_CRON_HOLD_MS = 10 * 60 * 1000

function secretMatches(expected: string, presented: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(presented)
  return left.length === right.length && timingSafeEqual(left, right)
}

export default defineEventHandler(async (event) => {
  const bindings = readCloudflareBindings(event)
  const secret = bindings?.MAINTENANCE_SECRET
  const presented = getHeader(event, 'x-maintenance-secret')
  if (!secret || !presented || !secretMatches(secret, presented))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const db = bindings?.DB
  if (!db)
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })

  const task = getRouterParam(event, 'task')
  const startedAt = Date.now()
  switch (task) {
    case 'asr': {
      await holdMaintenanceRun(db, ASR_RESULT_CLEANUP_LEASE_KEY, new Date(startedAt), ASR_CRON_HOLD_MS)
      const result = await runExpiredAsrResultCleanup(event, () => reconcileExpiredAsrSettlements(event))
      return { task, durationMs: Date.now() - startedAt, result }
    }
    case 'retention':
      return { task, durationMs: Date.now() - startedAt, result: await runTelemetryRetentionMaintenanceIfDue(db) }
    case 'docs':
      return { task, durationMs: Date.now() - startedAt, result: await cleanupDocEngagementRecords(db) }
    case 'privacy-deletions': {
      const result = await finalizeExpiredAccountDeletions(event)
      if (result.failed > 0) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Account deletion finalization incomplete',
          data: { task, durationMs: Date.now() - startedAt, result },
        })
      }
      return { task, durationMs: Date.now() - startedAt, result }
    }
    default:
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
})
