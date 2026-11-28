import { scheduleExpiredAsrResultCleanup } from '../utils/asrCleanupSchedule'

/**
 * Keep private synchronous ASR results within their request-owned retention window. The ASR modules
 * are loaded only when this isolate has the cleanup to run (see `asrCleanupSchedule`), and the
 * middleware is gated to speech/intelligence endpoints so docs and public APIs never trigger
 * `waitUntil` D1 maintenance-lease round trips.
 */
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/v1/speech') && !path.startsWith('/api/dashboard/intelligence'))
    return

  scheduleExpiredAsrResultCleanup(event, async () => {
    const { reconcileExpiredAsrSettlements } = await import('../utils/asrTranscriptionService')
    return reconcileExpiredAsrSettlements(event)
  })
})
