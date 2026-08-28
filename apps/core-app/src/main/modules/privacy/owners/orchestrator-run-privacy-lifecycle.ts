import type { PrivacyRetentionCategoryPolicy } from '@talex-touch/utils/transport/events/types'
import type { PrivacyOwnerDeleteResult, PrivacyOwnerPreviewResult } from '../data-owner'
import type { PrivacyOwnerLimits } from '../owner-utils'
import {
  emptyDeleteProgress,
  isOwnerDeadlineExceeded,
  normalizePrivacyOwnerLimits,
  privacyDeleteResult,
  privacyPreviewResult
} from '../owner-utils'
import { isSupportedPrivacyRetentionMs } from '../retention-policy'

const CATEGORY = 'intelligence-context' as const
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

export interface OrchestratorRunPrivacySnapshot {
  readonly runId: string
  readonly status: string
  readonly revision: string
  readonly eventCount: number
}

export interface OrchestratorRunRetentionCursor {
  readonly updatedAt: number
  readonly runId: string
}

export interface OrchestratorRunRetentionCandidate {
  readonly runId: string
  readonly updatedAt: number
  readonly eventCount: number
  readonly byteCount: number
}

export interface OrchestratorRunPrivacyStore {
  getOrchestratorRunPrivacySnapshot: (
    runId: string
  ) => Promise<OrchestratorRunPrivacySnapshot | null>
  deleteOrchestratorRunForPrivacy: (
    runId: string,
    expectedRevision: string
  ) => Promise<{
    readonly disposition: 'deleted' | 'not-found' | 'stale' | 'protected'
    readonly deletedEventCount: number
  }>
  getOrchestratorRunRetentionSummary: (
    cutoffMs: number,
    limit: number
  ) => Promise<{
    readonly eligibleRunCount: number
    readonly eligibleByteCount: number
    readonly protectedRunCount: number
    readonly bounded: boolean
  }>
  listOrchestratorRunRetentionCandidates: (
    cutoffMs: number,
    cursor: OrchestratorRunRetentionCursor | undefined,
    limit: number
  ) => Promise<{
    readonly candidates: readonly OrchestratorRunRetentionCandidate[]
    readonly cursor?: OrchestratorRunRetentionCursor
    readonly hasMore: boolean
  }>
  deleteOrchestratorRunsForRetention: (
    runIds: readonly string[],
    cutoffMs: number
  ) => Promise<{
    readonly deletedRunIds: readonly string[]
    readonly deletedEventCountByRunId: Readonly<Record<string, number>>
    readonly deletedEventCount: number
  }>
}

export interface OrchestratorRunPrivacyFence {
  readonly isRunProtected: (runId: string) => boolean
  readonly acquireRunDeletionFence: (runId: string) => (() => void) | null
}

export interface OrchestratorRunDeletePreview {
  readonly disposition: 'eligible' | 'protected' | 'not-found'
  readonly eventCount: number
  readonly revision?: string
}

export interface OrchestratorRunDeleteOutcome {
  readonly disposition: 'deleted' | 'not-found' | 'stale' | 'protected'
  readonly deletedEventCount: number
}

export interface OrchestratorRunPrivacyLifecycle {
  readonly previewDelete: (
    runId: string,
    signal: AbortSignal
  ) => Promise<OrchestratorRunDeletePreview>
  readonly delete: (
    runId: string,
    expectedRevision: string,
    signal: AbortSignal
  ) => Promise<OrchestratorRunDeleteOutcome>
  readonly previewRetention: (
    policy: PrivacyRetentionCategoryPolicy,
    nowMs: number,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerPreviewResult>
  readonly applyRetention: (
    policy: PrivacyRetentionCategoryPolicy,
    nowMs: number,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerDeleteResult>
}

export interface OrchestratorRunPrivacyLifecycleOptions {
  readonly store: OrchestratorRunPrivacyStore
  readonly fence: OrchestratorRunPrivacyFence
  readonly limits?: Partial<PrivacyOwnerLimits>
}

function isValidPolicy(policy: PrivacyRetentionCategoryPolicy, nowMs: number): boolean {
  return (
    Number.isSafeInteger(nowMs) &&
    nowMs >= 0 &&
    typeof policy?.enabled === 'boolean' &&
    isSupportedPrivacyRetentionMs(policy?.retentionMs)
  )
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

function cancelledDelete(progress = emptyDeleteProgress()): PrivacyOwnerDeleteResult {
  return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
    partial: progress.deletedItemCount > 0,
    cancelled: true
  })
}

export function createOrchestratorRunPrivacyLifecycle(
  options: OrchestratorRunPrivacyLifecycleOptions
): OrchestratorRunPrivacyLifecycle {
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const store = options.store
  const fence = options.fence

  return Object.freeze<OrchestratorRunPrivacyLifecycle>({
    previewDelete: async (runId, signal) => {
      if (signal.aborted) throw new Error('PRIVACY_OWNER_CANCELLED')
      const snapshot = await store.getOrchestratorRunPrivacySnapshot(runId)
      if (signal.aborted) throw new Error('PRIVACY_OWNER_CANCELLED')
      if (!snapshot) return Object.freeze({ disposition: 'not-found', eventCount: 0 })
      if (!TERMINAL_STATUSES.has(snapshot.status) || fence.isRunProtected(runId)) {
        return Object.freeze({
          disposition: 'protected',
          eventCount: safeCount(snapshot.eventCount)
        })
      }
      return Object.freeze({
        disposition: 'eligible',
        eventCount: safeCount(snapshot.eventCount),
        revision: snapshot.revision
      })
    },

    delete: async (runId, expectedRevision, signal) => {
      if (signal.aborted) throw new Error('PRIVACY_OWNER_CANCELLED')
      const release = fence.acquireRunDeletionFence(runId)
      if (!release) return Object.freeze({ disposition: 'protected', deletedEventCount: 0 })
      try {
        if (signal.aborted) throw new Error('PRIVACY_OWNER_CANCELLED')
        const result = await store.deleteOrchestratorRunForPrivacy(runId, expectedRevision)
        return Object.freeze({
          disposition: result.disposition,
          deletedEventCount: safeCount(result.deletedEventCount)
        })
      } finally {
        release()
      }
    },

    previewRetention: async (policy, nowMs, signal) => {
      if (!isValidPolicy(policy, nowMs)) {
        return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
      }
      if (!policy.enabled || policy.retentionMs === null) return privacyPreviewResult(CATEGORY)
      if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
      try {
        const summary = await store.getOrchestratorRunRetentionSummary(
          nowMs - policy.retentionMs,
          limits.maxRows
        )
        if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
        return privacyPreviewResult(CATEGORY, {
          eligibleItemCount: safeCount(summary.eligibleRunCount),
          eligibleByteCount: safeCount(summary.eligibleByteCount),
          protectedItemCount: safeCount(summary.protectedRunCount),
          bounded: summary.bounded === true
        })
      } catch {
        return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_DATABASE_FAILED')
      }
    },

    applyRetention: async (policy, nowMs, signal) => {
      if (!isValidPolicy(policy, nowMs)) {
        return privacyDeleteResult(
          CATEGORY,
          'PRIVACY_OWNER_INVALID_REQUEST',
          emptyDeleteProgress(),
          { partial: false }
        )
      }
      if (!policy.enabled || policy.retentionMs === null) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DISABLED', emptyDeleteProgress(), {
          ok: true,
          partial: false
        })
      }

      const progress = emptyDeleteProgress()
      const cutoffMs = nowMs - policy.retentionMs
      const startedAt = Date.now()
      let cursor: OrchestratorRunRetentionCursor | undefined
      let examinedCount = 0
      let hasMore = false

      try {
        while (examinedCount < limits.maxRows) {
          if (signal.aborted) return cancelledDelete(progress)
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
              retryable: true,
              partial: progress.deletedItemCount > 0
            })
          }

          const pageSize = Math.min(limits.batchSize, limits.maxRows - examinedCount)
          const page = await store.listOrchestratorRunRetentionCandidates(
            cutoffMs,
            cursor,
            pageSize
          )
          hasMore = page.hasMore === true
          if (page.candidates.length === 0) break
          examinedCount += page.candidates.length
          cursor = page.cursor ?? {
            updatedAt: page.candidates.at(-1)!.updatedAt,
            runId: page.candidates.at(-1)!.runId
          }

          const releases: Array<() => void> = []
          const admitted: OrchestratorRunRetentionCandidate[] = []
          try {
            for (const candidate of page.candidates) {
              const release = fence.acquireRunDeletionFence(candidate.runId)
              if (!release) {
                progress.protectedItemCount += 1
                continue
              }
              releases.push(release)
              admitted.push(candidate)
            }
            if (signal.aborted) return cancelledDelete(progress)
            if (admitted.length > 0) {
              const deletion = await store.deleteOrchestratorRunsForRetention(
                admitted.map((candidate) => candidate.runId),
                cutoffMs
              )
              const deletedIds = new Set(deletion.deletedRunIds)
              const committed = admitted.filter((candidate) => deletedIds.has(candidate.runId))
              progress.deletedItemCount += committed.length
              progress.deletedByteCount += committed.reduce(
                (total, candidate) => total + safeCount(candidate.byteCount),
                0
              )
              if (committed.length > 0) progress.batches += 1
            }
          } finally {
            for (const release of releases.reverse()) release()
          }

          if (!hasMore) break
        }

        const remaining = await store.getOrchestratorRunRetentionSummary(cutoffMs, 1)
        progress.protectedItemCount = Math.max(
          progress.protectedItemCount,
          safeCount(remaining.protectedRunCount)
        )
        if (signal.aborted) return cancelledDelete(progress)
        if (hasMore && examinedCount >= limits.maxRows) {
          return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
            retryable: true,
            partial: progress.deletedItemCount > 0
          })
        }
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, {
          partial: false
        })
      } catch {
        if (signal.aborted) return cancelledDelete(progress)
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
    }
  })
}
