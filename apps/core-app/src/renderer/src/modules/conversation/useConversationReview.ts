import type {
  FileReviewRecord,
  FileReviewRollbackCode
} from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createConversationReviewSdk } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import { getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { createLatestOnly } from './latest-only'

const reviewLog = createRendererLogger('ConversationReview')

/** The outcome of the last rollback the reader asked for, as Main decided it. */
export interface ReviewRollbackOutcome {
  reviewId: string
  ok: boolean
  code?: FileReviewRollbackCode
  restoredPaths: string[]
}

export interface UseConversationReviewReturn {
  records: Ref<FileReviewRecord[]>
  loading: Ref<boolean>
  loadError: Ref<boolean>
  /** The record whose diff is open, read through `get` (the list carries no diff). */
  detail: Ref<FileReviewRecord | null>
  detailLoading: Ref<boolean>
  rollingBack: Ref<string | null>
  lastRollback: Ref<ReviewRollbackOutcome | null>
  reload: () => Promise<void>
  open: (reviewId: string) => Promise<void>
  close: () => void
  rollback: (reviewId: string) => Promise<void>
}

/**
 * The host's file-change records for one conversation (A13, A14).
 *
 * Every record is Main's, captured at the file tool's own before/after boundary; this side only
 * lists, opens and asks for a rollback by identity. It never sends a path or content, and a refusal
 * comes back as Main's stable code — a conflict, a moved symlink or a read-only branch record is
 * reported as such, never retried around.
 */
export function useConversationReview(
  conversationId: () => string | null
): UseConversationReviewReturn {
  const sdk = createConversationReviewSdk(useTuffTransport())

  const records = ref<FileReviewRecord[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const detail = shallowRef<FileReviewRecord | null>(null)
  const detailLoading = ref(false)
  const rollingBack = ref<string | null>(null)
  const lastRollback = ref<ReviewRollbackOutcome | null>(null)
  const listSequence = createLatestOnly()
  const detailSequence = createLatestOnly()

  async function reload(): Promise<void> {
    const id = conversationId()
    const isCurrent = listSequence.claim()
    if (!id) {
      records.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const next = await sdk.list(id)
      if (!isCurrent()) return
      records.value = next
      loadError.value = false
    } catch (error) {
      if (!isCurrent()) return
      reviewLog.warn(`Failed to list file reviews for ${id}`, String(error))
      loadError.value = true
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  async function open(reviewId: string): Promise<void> {
    const id = conversationId()
    if (!id) return
    const isCurrent = detailSequence.claim()
    detailLoading.value = true
    try {
      const record = await sdk.get(id, reviewId)
      if (isCurrent()) detail.value = record
    } catch (error) {
      reviewLog.warn(`Failed to read file review ${reviewId}`, String(error))
      if (isCurrent()) detail.value = null
    } finally {
      if (isCurrent()) detailLoading.value = false
    }
  }

  function close(): void {
    detailSequence.claim()
    detail.value = null
    detailLoading.value = false
  }

  async function rollback(reviewId: string): Promise<void> {
    const id = conversationId()
    if (!id || rollingBack.value) return
    rollingBack.value = reviewId
    try {
      const result = await sdk.rollback(id, reviewId)
      lastRollback.value = {
        reviewId,
        ok: result.ok,
        code: result.code,
        restoredPaths: result.restoredPaths
      }
      if (result.review && conversationId() === id) {
        const updated = result.review
        records.value = records.value.map((record) => (record.id === updated.id ? updated : record))
        if (detail.value?.id === updated.id) await open(updated.id)
      }
    } catch (error) {
      // No answer from Main is not one of its codes: the UI says the request failed, nothing more.
      reviewLog.warn(`Rollback of ${reviewId} failed`, String(error))
      lastRollback.value = { reviewId, ok: false, restoredPaths: [] }
    } finally {
      rollingBack.value = null
    }
  }

  watch(
    conversationId,
    () => {
      close()
      lastRollback.value = null
      records.value = []
      void reload()
    },
    { immediate: true }
  )

  const dispose = sdk.onChanged((event) => {
    if (event.conversationId === conversationId()) void reload()
  })
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    records,
    loading,
    loadError,
    detail,
    detailLoading,
    rollingBack,
    lastRollback,
    reload,
    open,
    close,
    rollback
  }
}
