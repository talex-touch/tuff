import { scheduleExpiredAsrResultCleanup } from '../utils/asrCleanupSchedule'

/**
 * Keep private synchronous ASR results within their request-owned retention window. The ASR modules
 * are loaded only when this isolate has the cleanup to run (see `asrCleanupSchedule`).
 */
export default defineEventHandler((event) => {
  scheduleExpiredAsrResultCleanup(event, async () => {
    const { reconcileExpiredAsrSettlements } = await import('../utils/asrTranscriptionService')
    return reconcileExpiredAsrSettlements(event)
  })
})
