import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS,
  INDEX_COMMIT_NOTIFY_WINDOW_MS,
  SearchIndexCommitCoalescer,
  mergeIndexCommitPayloads
} from './search-index-commit-coalescer'

let revision = 0
function commit(
  providerIds: string[] = ['file-provider'],
  extra: Partial<CoreBoxSearchIndexCommitPayload> = {}
): CoreBoxSearchIndexCommitPayload {
  revision += 1
  return {
    revision,
    providerIds,
    sourceGenerations: Object.fromEntries(providerIds.map((id) => [id, revision])),
    committedAt: Date.now(),
    recommendationsInvalidated: false,
    ...extra
  }
}

describe('SearchIndexCommitCoalescer', () => {
  beforeEach(() => {
    revision = 0
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T09:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes a lone commit through unchanged once its 1s window closes', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit })
    const payload = commit(['file-provider'])

    coalescer.push(payload)
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS - 1)
    expect(emit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(emit).toHaveBeenCalledTimes(1)
    // Same shape as before coalescing existed: no `bulk` key on an ordinary commit.
    expect(emit).toHaveBeenCalledWith(payload)
  })

  it('folds 100 commits over 10s into at most 4 notifications, the last carrying the newest revision', async () => {
    // The cadence the renderer probe measured: a scan batch committing every ~100-300ms.
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit })

    for (let index = 0; index < 100; index += 1) {
      coalescer.push(commit(['file-provider']))
      await vi.advanceTimersByTimeAsync(100)
    }
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS)

    expect(emit.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(emit.mock.calls.length).toBeLessThanOrEqual(4)
    const payloads = emit.mock.calls.map(([payload]) => payload as CoreBoxSearchIndexCommitPayload)
    expect(payloads.at(-1)?.revision).toBe(100)
    // Nothing is lost between windows: revisions only move forward, and each notification covers
    // every commit since the previous one.
    for (let index = 1; index < payloads.length; index += 1) {
      expect(payloads[index]!.revision).toBeGreaterThan(payloads[index - 1]!.revision)
    }
    // The first window opened on a lone commit; once commits were dense the windows widened.
    expect(payloads[0]?.bulk).toBeUndefined()
    expect(payloads.slice(1).every((payload) => payload.bulk === true)).toBe(true)
  })

  it('does not let a steady stream postpone its notification indefinitely', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit })

    for (let index = 0; index < 5; index += 1) {
      coalescer.push(commit())
      await vi.advanceTimersByTimeAsync(200)
    }

    // The window opened at the first commit and closed on schedule despite later commits.
    expect(emit).toHaveBeenCalledTimes(1)
    expect((emit.mock.calls[0]?.[0] as CoreBoxSearchIndexCommitPayload).revision).toBe(5)
  })

  it('opens a bulk window on the first commit while a full scan is running', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit, isBulkIndexing: () => true })

    coalescer.push(commit())
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
    expect(emit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(
      INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS - INDEX_COMMIT_NOTIFY_WINDOW_MS
    )
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ bulk: true, revision: 1 })
  })

  it('returns to the 1s window once commits thin out', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit })

    for (let index = 0; index < 10; index += 1) {
      coalescer.push(commit())
      await vi.advanceTimersByTimeAsync(100)
    }
    await vi.advanceTimersByTimeAsync(10_000)
    emit.mockClear()

    coalescer.push(commit())
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)

    expect(emit).toHaveBeenCalledTimes(1)
    expect((emit.mock.calls[0]?.[0] as CoreBoxSearchIndexCommitPayload).bulk).toBeUndefined()
  })

  it('treats a failing bulk probe as not bulk instead of losing the notification', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({
      emit,
      isBulkIndexing: () => {
        throw new Error('status unavailable')
      }
    })

    coalescer.push(commit())
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)

    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('keeps a throwing emit inside the timer and reports it', async () => {
    const error = new Error('stream closed')
    const onEmitError = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({
      emit: () => {
        throw error
      },
      onEmitError
    })

    coalescer.push(commit())
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)

    expect(onEmitError).toHaveBeenCalledWith(error)
  })

  it('drops the open window on dispose and ignores later commits', async () => {
    const emit = vi.fn()
    const coalescer = new SearchIndexCommitCoalescer({ emit })

    coalescer.push(commit())
    expect(vi.getTimerCount()).toBe(1)
    coalescer.dispose()
    expect(vi.getTimerCount()).toBe(0)
    coalescer.push(commit())
    await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS)

    expect(emit).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('mergeIndexCommitPayloads', () => {
  it('keeps the newest revision and commit time and every provider with its newest generation', () => {
    const merged = mergeIndexCommitPayloads(
      {
        revision: 7,
        providerIds: ['file-provider'],
        sourceGenerations: { 'file-provider': 4 },
        committedAt: 100,
        recommendationsInvalidated: true
      },
      {
        revision: 9,
        providerIds: ['app-provider', 'file-provider'],
        sourceGenerations: { 'app-provider': 2, 'file-provider': 5 },
        committedAt: 200,
        recommendationsInvalidated: false
      }
    )

    expect(merged).toEqual({
      revision: 9,
      providerIds: ['app-provider', 'file-provider'],
      sourceGenerations: { 'app-provider': 2, 'file-provider': 5 },
      committedAt: 200,
      // One commit in the window asked for a recommendation refresh; the merge must not lose it.
      recommendationsInvalidated: true
    })
  })

  it('does not invent a recommendation flag neither payload carried', () => {
    const merged = mergeIndexCommitPayloads(
      { revision: 1, providerIds: [], sourceGenerations: {}, committedAt: 1 },
      { revision: 2, providerIds: [], sourceGenerations: {}, committedAt: 2 }
    )

    expect('recommendationsInvalidated' in merged).toBe(false)
  })
})
