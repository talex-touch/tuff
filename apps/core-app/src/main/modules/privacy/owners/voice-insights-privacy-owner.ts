import type {
  PrivacyDataOwner,
  PrivacyOwnerDeleteRequest,
  PrivacyOwnerExportRequest
} from '../data-owner'
import {
  definePrivacyDataOwner,
  privacyOwnerCompletedDelete,
  privacyOwnerCompletedExport
} from '../data-owner'
import type { PrivacyOwnerExportWriter } from '../data-owner'
import type { VoiceInsightsStore } from '../../voice/voice-insights-store'
import type { VoiceRecognitionStore } from '../../voice/voice-recognition-store'

const CATEGORY = 'voice-insights' as const

function emptyInspect() {
  return {
    ok: true as const,
    code: 'PRIVACY_OWNER_COMPLETED' as const,
    retryable: false,
    category: CATEGORY,
    itemCount: 0,
    byteCount: 0,
    retentionMs: null
  }
}

function emptyPreview() {
  return {
    ok: true as const,
    code: 'PRIVACY_OWNER_COMPLETED' as const,
    retryable: false,
    category: CATEGORY,
    eligibleItemCount: 0,
    eligibleByteCount: 0,
    protectedItemCount: 0,
    bounded: false
  }
}
/** Privacy lifecycle for local voice aggregates and optional detailed recognition records. */
export function createVoiceInsightsPrivacyOwner(
  store: VoiceInsightsStore,
  recordsStore?: VoiceRecognitionStore
): PrivacyDataOwner {
  return definePrivacyDataOwner({
    categories: [CATEGORY],
    inspect: async (request) => {
      if (request.category !== CATEGORY) return emptyInspect()
      const insights = await store.getInsights(request.nowMs)
      return {
        ...emptyInspect(),
        itemCount: insights.sessionCount > 0 ? 1 : 0,
        byteCount: 0
      }
    },
    previewDelete: async (request) => {
      if (request.category !== CATEGORY) return emptyPreview()
      const insights = await store.getInsights(request.nowMs)
      return {
        ...emptyPreview(),
        eligibleItemCount: insights.sessionCount > 0 ? 1 : 0
      }
    },
    delete: async (request: PrivacyOwnerDeleteRequest) => {
      if (request.category !== CATEGORY || request.mode !== 'manual-delete') {
        return {
          ...privacyOwnerCompletedDelete(CATEGORY),
          ok: false as const,
          code: 'PRIVACY_OWNER_INVALID_REQUEST' as const,
          retryable: false
        }
      }
      const insights = await store.getInsights(request.nowMs)
      const records = recordsStore ? await recordsStore.list() : []
      await store.clearInsights(request.nowMs)
      await recordsStore?.clear()
      return privacyOwnerCompletedDelete(CATEGORY, {
        deletedItemCount: (insights.sessionCount > 0 ? 1 : 0) + records.length,
        deletedByteCount: records.reduce((sum, record) => sum + (record.audioBytes ?? 0), 0),
        batches: recordsStore ? 2 : 1
      })
    },
    export: async (request: PrivacyOwnerExportRequest, writer: PrivacyOwnerExportWriter) => {
      if (request.category !== CATEGORY) {
        return {
          ...privacyOwnerCompletedExport(CATEGORY),
          ok: false as const,
          code: 'PRIVACY_OWNER_INVALID_REQUEST' as const,
          retryable: false
        }
      }
      const insights = await store.getInsights(request.nowMs)
      if (insights.sessionCount === 0) return privacyOwnerCompletedExport(CATEGORY)
      const result = await writer.write({ kind: 'voice-insights-aggregate', insights })
      return privacyOwnerCompletedExport(CATEGORY, {
        exportedItemCount: 1,
        exportedByteCount: result.byteCount
      })
    },
    applyRetention: async () => []
  })
}
