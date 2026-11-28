import { defineEventHandler } from 'h3'
import { scheduleExpiredAsrResultCleanup } from '../utils/asrCleanupSchedule'

/**
 * Reconcile expired synchronous ASR results only on speech/audio endpoints.
 */
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/v1/speech') && !path.startsWith('/api/v1/ai/audio'))
    return

  scheduleExpiredAsrResultCleanup(event, async () => {
    const { reconcileExpiredAsrSettlements } = await import('../utils/asrTranscriptionService')
    return reconcileExpiredAsrSettlements(event)
  })
})
