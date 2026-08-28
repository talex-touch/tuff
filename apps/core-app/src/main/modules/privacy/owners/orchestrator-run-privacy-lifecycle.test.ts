import type { PrivacyRetentionCategoryPolicy } from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import {
  createOrchestratorRunPrivacyLifecycle,
  type OrchestratorRunPrivacyFence,
  type OrchestratorRunPrivacyStore,
  type OrchestratorRunRetentionCandidate,
  type OrchestratorRunRetentionCursor
} from './orchestrator-run-privacy-lifecycle'

const POLICY: PrivacyRetentionCategoryPolicy = {
  enabled: true,
  retentionMs: 30 * 24 * 60 * 60_000
}
const NOW_MS = 40 * 24 * 60 * 60_000

function createStore(
  overrides: Partial<OrchestratorRunPrivacyStore> = {}
): OrchestratorRunPrivacyStore {
  return {
    getOrchestratorRunPrivacySnapshot: vi.fn(async (runId) => ({
      runId,
      status: 'completed',
      revision: 'a'.repeat(64),
      eventCount: 2
    })),
    deleteOrchestratorRunForPrivacy: vi.fn(async () => ({
      disposition: 'deleted' as const,
      deletedEventCount: 2
    })),
    getOrchestratorRunRetentionSummary: vi.fn(async () => ({
      eligibleRunCount: 0,
      eligibleByteCount: 0,
      protectedRunCount: 0,
      bounded: false
    })),
    listOrchestratorRunRetentionCandidates: vi.fn(async () => ({
      candidates: [],
      hasMore: false
    })),
    deleteOrchestratorRunsForRetention: vi.fn(async () => ({
      deletedRunIds: [],
      deletedEventCountByRunId: {},
      deletedEventCount: 0
    })),
    ...overrides
  }
}

function createFence(
  overrides: Partial<OrchestratorRunPrivacyFence> = {}
): OrchestratorRunPrivacyFence {
  return {
    isRunProtected: vi.fn(() => false),
    acquireRunDeletionFence: vi.fn(() => vi.fn()),
    ...overrides
  }
}

describe('orchestrator run Privacy lifecycle owner', () => {
  it('previews only terminal unprotected runs and releases the exact delete fence', async () => {
    const release = vi.fn()
    const store = createStore()
    const fence = createFence({ acquireRunDeletionFence: vi.fn(() => release) })
    const lifecycle = createOrchestratorRunPrivacyLifecycle({ store, fence })
    const signal = new AbortController().signal

    await expect(lifecycle.previewDelete('run-terminal', signal)).resolves.toEqual({
      disposition: 'eligible',
      eventCount: 2,
      revision: 'a'.repeat(64)
    })
    await expect(lifecycle.delete('run-terminal', 'a'.repeat(64), signal)).resolves.toEqual({
      disposition: 'deleted',
      deletedEventCount: 2
    })
    expect(store.deleteOrchestratorRunForPrivacy).toHaveBeenCalledWith(
      'run-terminal',
      'a'.repeat(64)
    )
    expect(release).toHaveBeenCalledOnce()

    vi.mocked(fence.isRunProtected).mockReturnValueOnce(true)
    await expect(lifecycle.previewDelete('run-terminal', signal)).resolves.toEqual({
      disposition: 'protected',
      eventCount: 2
    })
    vi.mocked(store.getOrchestratorRunPrivacySnapshot).mockResolvedValueOnce({
      runId: 'run-active',
      status: 'running',
      revision: 'b'.repeat(64),
      eventCount: 1
    })
    await expect(lifecycle.previewDelete('run-active', signal)).resolves.toEqual({
      disposition: 'protected',
      eventCount: 1
    })
  })

  it('skips fenced retention candidates and reports a bounded partial result', async () => {
    const releaseFirst = vi.fn()
    const releaseSecond = vi.fn()
    const store = createStore({
      listOrchestratorRunRetentionCandidates: vi.fn(async () => ({
        candidates: [
          { runId: 'run-delete-a', updatedAt: 1, eventCount: 1, byteCount: 10 },
          { runId: 'run-protected', updatedAt: 2, eventCount: 1, byteCount: 20 },
          { runId: 'run-delete-b', updatedAt: 3, eventCount: 1, byteCount: 30 }
        ],
        cursor: { updatedAt: 3, runId: 'run-delete-b' },
        hasMore: true
      })),
      deleteOrchestratorRunsForRetention: vi.fn(async (runIds: readonly string[]) => ({
        deletedRunIds: [...runIds],
        deletedEventCountByRunId: Object.fromEntries(runIds.map((runId) => [runId, 1])),
        deletedEventCount: runIds.length
      }))
    })
    const fence = createFence({
      acquireRunDeletionFence: vi.fn((runId) => {
        if (runId === 'run-protected') return null
        return runId === 'run-delete-a' ? releaseFirst : releaseSecond
      })
    })
    const lifecycle = createOrchestratorRunPrivacyLifecycle({
      store,
      fence,
      limits: { batchSize: 3, maxRows: 3 }
    })

    await expect(
      lifecycle.applyRetention(POLICY, NOW_MS, new AbortController().signal)
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_LIMIT_REACHED',
      retryable: true,
      category: 'intelligence-context',
      deletedItemCount: 2,
      deletedByteCount: 40,
      protectedItemCount: 1,
      batches: 1,
      partial: true
    })
    expect(store.deleteOrchestratorRunsForRetention).toHaveBeenCalledWith(
      ['run-delete-a', 'run-delete-b'],
      NOW_MS - POLICY.retentionMs!
    )
    expect(releaseFirst).toHaveBeenCalledOnce()
    expect(releaseSecond).toHaveBeenCalledOnce()
  })

  it('walks all keyset pages and is idempotent after committed deletion', async () => {
    const candidates: readonly OrchestratorRunRetentionCandidate[] = [
      { runId: 'run-a', updatedAt: 1, eventCount: 1, byteCount: 10 },
      { runId: 'run-b', updatedAt: 1, eventCount: 2, byteCount: 20 },
      { runId: 'run-c', updatedAt: 2, eventCount: 3, byteCount: 30 },
      { runId: 'run-d', updatedAt: 3, eventCount: 4, byteCount: 40 },
      { runId: 'run-e', updatedAt: 3, eventCount: 5, byteCount: 50 }
    ]
    const remaining = new Set(candidates.map((candidate) => candidate.runId))
    const listCandidates = vi.fn(
      async (
        _cutoffMs: number,
        cursor: OrchestratorRunRetentionCursor | undefined,
        limit: number
      ) => {
        const eligible = candidates.filter(
          (candidate) =>
            remaining.has(candidate.runId) &&
            (!cursor ||
              candidate.updatedAt > cursor.updatedAt ||
              (candidate.updatedAt === cursor.updatedAt && candidate.runId > cursor.runId))
        )
        const pageCandidates = eligible.slice(0, limit)
        const last = pageCandidates.at(-1)
        return {
          candidates: pageCandidates,
          ...(last ? { cursor: { updatedAt: last.updatedAt, runId: last.runId } } : {}),
          hasMore: eligible.length > limit
        }
      }
    )
    const deleteCandidates = vi.fn(async (runIds: readonly string[]) => {
      const deletedRunIds = runIds.filter((runId) => remaining.delete(runId))
      const deletedEventCountByRunId = Object.fromEntries(
        deletedRunIds.map((runId) => [
          runId,
          candidates.find((candidate) => candidate.runId === runId)?.eventCount ?? 0
        ])
      )
      return {
        deletedRunIds,
        deletedEventCountByRunId,
        deletedEventCount: Object.values(deletedEventCountByRunId).reduce(
          (total, count) => total + count,
          0
        )
      }
    })
    const getSummary = vi.fn(async (_cutoffMs: number, limit: number) => {
      const eligible = candidates.filter((candidate) => remaining.has(candidate.runId))
      const boundedCandidates = eligible.slice(0, limit)
      return {
        eligibleRunCount: boundedCandidates.length,
        eligibleByteCount: boundedCandidates.reduce(
          (total, candidate) => total + candidate.byteCount,
          0
        ),
        protectedRunCount: 0,
        bounded: eligible.length > limit
      }
    })
    const store = createStore({
      listOrchestratorRunRetentionCandidates: listCandidates,
      deleteOrchestratorRunsForRetention: deleteCandidates,
      getOrchestratorRunRetentionSummary: getSummary
    })
    const releases = new Map(candidates.map((candidate) => [candidate.runId, vi.fn()]))
    const fence = createFence({
      acquireRunDeletionFence: vi.fn((runId: string) => releases.get(runId) ?? null)
    })
    const lifecycle = createOrchestratorRunPrivacyLifecycle({
      store,
      fence,
      limits: { batchSize: 2, maxRows: 10 }
    })
    const signal = new AbortController().signal
    const cutoffMs = NOW_MS - POLICY.retentionMs!

    await expect(lifecycle.applyRetention(POLICY, NOW_MS, signal)).resolves.toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 5,
      deletedByteCount: 150,
      protectedItemCount: 0,
      batches: 3,
      partial: false,
      cancelled: false
    })
    expect(listCandidates).toHaveBeenNthCalledWith(1, cutoffMs, undefined, 2)
    expect(listCandidates).toHaveBeenNthCalledWith(2, cutoffMs, { updatedAt: 1, runId: 'run-b' }, 2)
    expect(listCandidates).toHaveBeenNthCalledWith(3, cutoffMs, { updatedAt: 3, runId: 'run-d' }, 2)
    expect(deleteCandidates).toHaveBeenNthCalledWith(1, ['run-a', 'run-b'], cutoffMs)
    expect(deleteCandidates).toHaveBeenNthCalledWith(2, ['run-c', 'run-d'], cutoffMs)
    expect(deleteCandidates).toHaveBeenNthCalledWith(3, ['run-e'], cutoffMs)
    for (const release of releases.values()) expect(release).toHaveBeenCalledOnce()

    await expect(lifecycle.applyRetention(POLICY, NOW_MS, signal)).resolves.toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 0,
      deletedByteCount: 0,
      batches: 0,
      partial: false
    })
    expect(listCandidates).toHaveBeenNthCalledWith(4, cutoffMs, undefined, 2)
    expect(deleteCandidates).toHaveBeenCalledTimes(3)
    expect(remaining.size).toBe(0)
  })

  it('stops after a committed first batch when cancellation arrives and releases every fence', async () => {
    const controller = new AbortController()
    const candidates: readonly OrchestratorRunRetentionCandidate[] = [
      { runId: 'run-a', updatedAt: 1, eventCount: 1, byteCount: 10 },
      { runId: 'run-b', updatedAt: 2, eventCount: 2, byteCount: 20 }
    ]
    const listCandidates = vi.fn(
      async (
        _cutoffMs: number,
        _cursor: OrchestratorRunRetentionCursor | undefined,
        _limit: number
      ) => ({
        candidates,
        cursor: { updatedAt: 2, runId: 'run-b' },
        hasMore: true
      })
    )
    const deleteCandidates = vi.fn(async (runIds: readonly string[]) => {
      controller.abort()
      return {
        deletedRunIds: [...runIds],
        deletedEventCountByRunId: { 'run-a': 1, 'run-b': 2 },
        deletedEventCount: 3
      }
    })
    const getSummary = vi.fn(async () => ({
      eligibleRunCount: 0,
      eligibleByteCount: 0,
      protectedRunCount: 0,
      bounded: false
    }))
    const store = createStore({
      listOrchestratorRunRetentionCandidates: listCandidates,
      deleteOrchestratorRunsForRetention: deleteCandidates,
      getOrchestratorRunRetentionSummary: getSummary
    })
    const releaseA = vi.fn()
    const releaseB = vi.fn()
    const fence = createFence({
      acquireRunDeletionFence: vi.fn((runId: string) => (runId === 'run-a' ? releaseA : releaseB))
    })
    const lifecycle = createOrchestratorRunPrivacyLifecycle({
      store,
      fence,
      limits: { batchSize: 2, maxRows: 10 }
    })
    const cutoffMs = NOW_MS - POLICY.retentionMs!

    await expect(
      lifecycle.applyRetention(POLICY, NOW_MS, controller.signal)
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      deletedItemCount: 2,
      deletedByteCount: 30,
      batches: 1,
      partial: true,
      cancelled: true
    })
    expect(listCandidates).toHaveBeenCalledOnce()
    expect(listCandidates).toHaveBeenCalledWith(cutoffMs, undefined, 2)
    expect(deleteCandidates).toHaveBeenCalledOnce()
    expect(deleteCandidates).toHaveBeenCalledWith(['run-a', 'run-b'], cutoffMs)
    expect(getSummary).not.toHaveBeenCalled()
    expect(releaseA).toHaveBeenCalledOnce()
    expect(releaseB).toHaveBeenCalledOnce()
  })

  it('fails closed on cancellation before owner work', async () => {
    const store = createStore()
    const fence = createFence()
    const lifecycle = createOrchestratorRunPrivacyLifecycle({ store, fence })
    const controller = new AbortController()
    controller.abort()

    await expect(lifecycle.previewDelete('run-cancelled', controller.signal)).rejects.toThrow(
      'PRIVACY_OWNER_CANCELLED'
    )
    await expect(
      lifecycle.applyRetention(POLICY, NOW_MS, controller.signal)
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      cancelled: true
    })
    expect(store.getOrchestratorRunPrivacySnapshot).not.toHaveBeenCalled()
    expect(store.listOrchestratorRunRetentionCandidates).not.toHaveBeenCalled()
  })
})
