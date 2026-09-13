import { scheduleExpiredAsrResultCleanup } from '../utils/asrTranscriptionStore'
import { reconcileExpiredAsrSettlements } from '../utils/asrTranscriptionService'

/** Keep private synchronous ASR results within their request-owned retention window. */
export default defineEventHandler((event) => {
  scheduleExpiredAsrResultCleanup(event, () => reconcileExpiredAsrSettlements(event))
})
