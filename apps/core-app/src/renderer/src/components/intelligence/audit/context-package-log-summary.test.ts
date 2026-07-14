import { describe, expect, it } from 'vitest'
import type { ContextCheckpoint, ContextPackageLog } from '@talex-touch/tuff-intelligence'
import {
  getContextExplainReasonI18nKey,
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
      degradedReason: undefined,
      excludedCount: 0,
      policyBlockedCount: 0,
      prunedCount: 0,
      tombstoneCount: 0,
      includedItems: [
        {
          sourceType: 'current_input',
          sourceId: 'turn-1',
          reason: 'current input',
          tokenEstimate: 12,
          citation: undefined
        },
        {
          sourceType: 'retrieval',
          sourceId: 'chunk-1',
          reason: 'local knowledge',
          tokenEstimate: 68,
          citation: {
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            title: 'Notes',
            sourceType: undefined,
            sourceUri: undefined
          }
        }
      ],
      excludedItems: []
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

  it('summarizes excluded package metadata without exposing content', () => {
    const summary = summarizeContextPackageLog(
      packageLog({
        metadata: {
          excluded: [
            {
              sourceType: 'current_input',
              sourceId: 'turn-secret',
              reason: 'secret-policy-blocked',
              tokenEstimate: 10,
              content: 'api_key = secret'
            },
            {
              sourceType: 'retrieval',
              sourceId: 'chunk-large',
              reason: 'token-budget-pruned',
              tokenEstimate: 500
            },
            'invalid'
          ]
        }
      })
    )

    expect(summary).toMatchObject({
      excludedCount: 2,
      policyBlockedCount: 1,
      prunedCount: 1,
      excludedItems: [
        {
          sourceType: 'current_input',
          sourceId: 'turn-secret',
          reason: 'secret-policy-blocked',
          tokenEstimate: 10
        },
        {
          sourceType: 'retrieval',
          sourceId: 'chunk-large',
          reason: 'token-budget-pruned',
          tokenEstimate: 500
        }
      ]
    })
    expect(JSON.stringify(summary)).not.toContain('api_key = secret')
  })

  it('classifies memory tombstones as metadata-only exclusions', () => {
    const summary = summarizeContextPackageLog(
      packageLog({
        metadata: {
          excluded: [
            {
              sourceType: 'memory',
              sourceId: 'memory-removed',
              reason: 'memory-tombstoned',
              tokenEstimate: 24,
              content: 'private memory body'
            }
          ]
        }
      })
    )

    expect(summary).toMatchObject({
      excludedCount: 1,
      tombstoneCount: 1,
      policyBlockedCount: 0,
      prunedCount: 0
    })
    expect(summary.excludedItems).toEqual([
      {
        sourceType: 'memory',
        sourceId: 'memory-removed',
        reason: 'memory-tombstoned',
        tokenEstimate: 24
      }
    ])
    expect(summary.excludedItems[0]).not.toHaveProperty('content')
    expect(JSON.stringify(summary)).not.toContain('private memory body')
  })

  it('maps only known explain reasons to i18n keys', () => {
    expect(getContextExplainReasonI18nKey('memory-tombstoned')).toBe(
      'intelligence.audit.contextReasonMemoryTombstoned'
    )
    expect(getContextExplainReasonI18nKey('future-exclusion')).toBeUndefined()
  })

  it('keeps explain details metadata-only', () => {
    const summary = summarizeContextPackageLog(
      packageLog({
        items: [
          {
            sourceType: 'retrieval',
            sourceId: 'chunk-private',
            reason: 'local knowledge',
            tokenEstimate: 32,
            metadata: {
              citation: {
                documentId: 'doc-private',
                chunkId: 'chunk-private',
                title: 'Private Notes',
                sourceUri: 'note://private'
              },
              content: 'private retrieval content'
            }
          }
        ]
      })
    )

    expect(summary.includedItems).toEqual([
      {
        sourceType: 'retrieval',
        sourceId: 'chunk-private',
        reason: 'local knowledge',
        tokenEstimate: 32,
        citation: {
          documentId: 'doc-private',
          chunkId: 'chunk-private',
          title: 'Private Notes',
          sourceType: undefined,
          sourceUri: 'note://private'
        }
      }
    ])
    expect(JSON.stringify(summary)).not.toContain('private retrieval content')
  })

  it('normalizes unknown excluded source types', () => {
    const summary = summarizeContextPackageLog(
      packageLog({
        metadata: {
          excluded: [
            {
              sourceType: 'raw_prompt',
              sourceId: 'prompt-1',
              reason: 'policy-blocked',
              tokenEstimate: 20
            }
          ]
        }
      })
    )

    expect(summary.excludedItems).toEqual([
      {
        sourceType: 'unknown',
        sourceId: 'prompt-1',
        reason: 'policy-blocked',
        tokenEstimate: 20
      }
    ])
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
