import type { IndexedSourceDiagnostics } from '@talex-touch/utils/search'
import type { FileProviderRuntimeEvidenceInput } from './file-provider-runtime-evidence'
import { describe, expect, it, vi } from 'vitest'
import { sanitizeFileIndexSourceDiagnostics } from '../../../search-engine/file-index-public-projection'
import { FILE_INDEXED_SOURCE_ID } from '../../../search-engine/file-indexed-source'
import {
  buildEmbeddingPauseEvidence,
  buildFileProviderRuntimeEvidence
} from './file-provider-runtime-evidence'

// The projection module reports operational errors; the sanitizer under test does not.
vi.mock('../../../../observability', () => ({ operationalErrorService: { report: vi.fn() } }))
vi.mock('../../../search-engine/file-indexed-source', () => ({
  FILE_INDEXED_SOURCE_ID: 'file-provider'
}))

const PAUSED_UNTIL = Date.parse('2026-10-04T07:00:00.000Z')

function runtimeInput(
  overrides: Partial<FileProviderRuntimeEvidenceInput> = {}
): FileProviderRuntimeEvidenceInput {
  return {
    sourceId: FILE_INDEXED_SOURCE_ID,
    integrity: null,
    flush: null,
    backlog: {
      scheduler: {
        activeBatches: 0,
        queuedBatches: 0,
        pendingRecords: 0,
        deferredRecords: 0
      },
      buffer: { pending: 0, inflight: 0, pendingBytes: 0, inflightBytes: 0 }
    } as unknown as FileProviderRuntimeEvidenceInput['backlog'],
    incrementalPersist: null,
    ftsWrite: null,
    ftsDelete: null,
    ...overrides
  }
}

describe('file embedding paused by the AI usage limit, in the file-index diagnostics', () => {
  it('adds a row only while the pause holds', () => {
    const ids = (input: FileProviderRuntimeEvidenceInput) =>
      buildFileProviderRuntimeEvidence(input).map((row) => row.id)

    expect(ids(runtimeInput())).not.toContain(`${FILE_INDEXED_SOURCE_ID}:embedding-pause`)
    expect(ids(runtimeInput({ embeddingPause: null }))).not.toContain(
      `${FILE_INDEXED_SOURCE_ID}:embedding-pause`
    )
    expect(
      ids(
        runtimeInput({
          embeddingPause: {
            reason: 'USAGE_LIMIT_REACHED',
            limitKey: 'tokensPerMonth',
            pausedUntil: PAUSED_UNTIL
          }
        })
      ).at(-1)
    ).toBe(`${FILE_INDEXED_SOURCE_ID}:embedding-pause`)
  })

  it('names the limit and the reset time, and both survive the renderer boundary', () => {
    const row = buildEmbeddingPauseEvidence(
      FILE_INDEXED_SOURCE_ID,
      { reason: 'USAGE_LIMIT_REACHED', limitKey: 'requestsPerDay', pausedUntil: PAUSED_UNTIL },
      1_000
    )
    expect(row).toEqual({
      id: `${FILE_INDEXED_SOURCE_ID}:embedding-pause`,
      label: 'File embedding',
      status: 'degraded',
      reason: 'USAGE_LIMIT_REACHED',
      lastCheckedAt: 1_000,
      metadata: { limitKey: 'requestsPerDay', pausedUntil: PAUSED_UNTIL }
    })

    // The projection drops free text and sensitive keys; this row has neither, so it arrives whole.
    const projected = sanitizeFileIndexSourceDiagnostics({
      descriptor: { id: FILE_INDEXED_SOURCE_ID },
      health: { status: 'ready' },
      evidence: [row]
    } as unknown as IndexedSourceDiagnostics)
    expect(projected.evidence).toEqual([row])
  })
})
