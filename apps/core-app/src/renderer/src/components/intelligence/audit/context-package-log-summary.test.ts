import { describe, expect, it } from 'vitest'
import type { ContextCheckpoint, ContextPackageLog } from '@talex-touch/tuff-intelligence'
import {
  summarizeContextCheckpoint,
  summarizeContextPackageLog
} from './context-package-log-summary'

function packageLog(overrides: Partial<ContextPackageLog> = {}): ContextPackageLog {
  return {
    id: 'ctxpkg_1',
    sessionId: 'ctxs_1',
    traceId: 'trace-1',
    scope: 'retrieval',
    tokenBudget: 200,
    tokenEstimate: 80,
    items: [
      {
        sourceType: 'current_input',
        sourceId: 'turn-1',
        reason: 'current input',
        tokenEstimate: 12
      },
      {
        sourceType: 'retrieval',
        sourceId: 'chunk-1',
        reason: 'local knowledge',
        tokenEstimate: 68,
        metadata: {
          citation: {
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            title: 'Notes'
          }
        }
      }
    ],
    createdAt: 1,
    ...overrides
  }
}

describe('context-package-log-summary', () => {
  it('summarizes metadata-only package logs without carrying item content', () => {
    expect(
      summarizeContextPackageLog(
        packageLog({
          metadata: {
            retrieval: {
              status: 'ok',
              chunkCount: 1,
              citationCount: 3
            }
          }
        })
      )
    ).toEqual({
      id: 'ctxpkg_1',
      sessionId: 'ctxs_1',
      traceId: 'trace-1',
      scope: 'retrieval',
      tokenBudget: 200,
      tokenEstimate: 80,
      itemCount: 2,
      retrievalItemCount: 1,
      citationCount: 3,
      sourceTypes: [
        { sourceType: 'current_input', count: 1 },
        { sourceType: 'retrieval', count: 1 }
      ],
      retrievalStatus: 'ok',
      degradedReason: undefined
    })
  })

  it('falls back to item citation metadata when package citation count is absent', () => {
    expect(summarizeContextPackageLog(packageLog()).citationCount).toBe(1)
  })

  it('surfaces retrieval degraded reason from package metadata', () => {
    expect(
      summarizeContextPackageLog(
        packageLog({
          metadata: {
            retrieval: {
              status: 'degraded',
              degradedReason: 'fts_unavailable'
            }
          }
        })
      )
    ).toMatchObject({
      retrievalStatus: 'degraded',
      degradedReason: 'fts_unavailable'
    })
  })

  it('summarizes checkpoints without carrying summary content', () => {
    const checkpoint: ContextCheckpoint = {
      id: 'ctxcp_1',
      sessionId: 'ctxs_1',
      type: 'session_start',
      reason: 'new-session',
      summary: 'private summary content',
      contextScope: 'retrieval',
      metadata: {
        caller: 'plugin:touch-intelligence',
        requestId: 'request-1'
      },
      createdAt: 2
    }

    expect(summarizeContextCheckpoint(checkpoint)).toEqual({
      id: 'ctxcp_1',
      sessionId: 'ctxs_1',
      type: 'session_start',
      reason: 'new-session',
      contextScope: 'retrieval',
      metadataKeys: ['caller', 'requestId'],
      createdAt: 2
    })
  })
})
