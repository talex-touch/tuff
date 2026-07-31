import type { Client, InStatement, ResultSet, Row } from '@libsql/client'
import type { PrivacyDataCategory } from '@talex-touch/utils/transport/events/types'
import type { PrivacyOwnerExportWriter } from './data-owner'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createClipboardRetentionOwner } from './owners/clipboard-retention-owner'
import { createDiagnosticsRetentionOwner } from './owners/diagnostics-retention-owner'
import { createIntelligenceRetentionOwner } from './owners/intelligence-retention-owner'
import { createOcrScreenshotRetentionOwner } from './owners/ocr-screenshot-retention-owner'
import { createSearchRetentionOwner } from './owners/search-retention-owner'

const FORBIDDEN_CANARIES = [
  '/Users/private/source.png',
  'SELECT secret FROM native_table',
  'https://provider.invalid/v1?token=canary',
  'native stack canary',
  'synthetic clipboard content canary',
  'synthetic raw query canary',
  'synthetic provider prompt canary'
]

function fakeClient(
  resolveRows: (sql: string) => readonly Readonly<Record<string, unknown>>[]
): Pick<Client, 'execute' | 'batch'> {
  return {
    execute: vi.fn(async (statement: InStatement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      const rows = resolveRows(sql).map((value) => Object.assign([], value) as Row)
      return { rows } as ResultSet
    }),
    batch: vi.fn(async () => [])
  }
}

function collector() {
  const records: Readonly<Record<string, unknown>>[] = []
  const writer: PrivacyOwnerExportWriter = Object.freeze({
    write: async (record) => {
      records.push(record)
      return { byteCount: Buffer.byteLength(JSON.stringify(record), 'utf8') }
    }
  })
  return { records, writer }
}

async function exportCategory(
  owner: ReturnType<typeof createClipboardRetentionOwner>,
  category: PrivacyDataCategory
) {
  const output = collector()
  const result = await owner.export(
    Object.freeze({ category, nowMs: 1_700_000_000_000 }),
    output.writer,
    new AbortController().signal
  )
  expect(result).toMatchObject({ ok: true, category, partial: false, cancelled: false })
  const serialized = JSON.stringify(output.records)
  for (const canary of FORBIDDEN_CANARIES) expect(serialized).not.toContain(canary)
  return output.records
}

describe('privacy owner ordinary export projections', () => {
  it('exports Clipboard metadata without text, owned image, or file references', async () => {
    const client = fakeClient(() => [
      {
        id: 1,
        type: 'text',
        export_content: FORBIDDEN_CANARIES[4],
        timestamp: 10,
        is_favorite: 1,
        retention_protected: 0,
        source_path: FORBIDDEN_CANARIES[0]
      },
      {
        id: 2,
        type: 'image',
        export_content: null,
        timestamp: 20,
        is_favorite: 0,
        retention_protected: 1,
        native_error: FORBIDDEN_CANARIES[3]
      },
      {
        id: 3,
        type: FORBIDDEN_CANARIES[2],
        timestamp: 30,
        is_favorite: 0,
        retention_protected: 0
      }
    ])
    const records = await exportCategory(
      createClipboardRetentionOwner({ client }),
      'clipboard-history'
    )
    expect(records).toEqual([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ type: 'image' }),
      expect.objectContaining({ type: null })
    ])
    expect(records.every((record) => !Object.hasOwn(record, 'content'))).toBe(true)
  })

  it('exports OCR job metadata without source or result locations', async () => {
    const client = fakeClient(() => [
      {
        id: FORBIDDEN_CANARIES[0],
        status: FORBIDDEN_CANARIES[1],
        queued_at: 10,
        finished_at: 20,
        source_path: FORBIDDEN_CANARIES[0],
        result_text: FORBIDDEN_CANARIES[1]
      }
    ])
    const owner = createOcrScreenshotRetentionOwner({
      client,
      tempFileService: { registerNamespace: vi.fn() } as never
    })
    const records = await exportCategory(owner, 'ocr-screenshot-temp')
    expect(records).toEqual([expect.objectContaining({ jobId: null, status: null })])
  })

  it('exports bounded search aggregates without item ids, vectors, or raw context', async () => {
    const client = fakeClient((sql) => {
      if (sql.includes('FROM query_completions')) {
        return [
          {
            prefix: FORBIDDEN_CANARIES[5],
            completion_count: 2,
            last_completed: 10,
            context: FORBIDDEN_CANARIES[0]
          }
        ]
      }
      if (sql.includes('FROM usage_logs')) {
        return [
          {
            action: FORBIDDEN_CANARIES[2],
            source: FORBIDDEN_CANARIES[0],
            keyword: FORBIDDEN_CANARIES[5],
            timestamp: 20,
            context: FORBIDDEN_CANARIES[1]
          }
        ]
      }
      return []
    })
    const owner = createSearchRetentionOwner({ coreClient: client, auxiliaryClient: client })
    const records = await exportCategory(owner, 'search-history')
    expect(records).toHaveLength(2)
    expect(records).toContainEqual(
      expect.objectContaining({ kind: 'search-usage', action: null, sourceType: null })
    )
  })

  it('exports Intelligence audit and Context metadata without prompt or turn content', async () => {
    const client = fakeClient((sql) => {
      if (sql.includes('FROM intelligence_audit_logs')) {
        return [
          {
            timestamp: 10,
            capability_id: 'text.chat',
            provider: FORBIDDEN_CANARIES[2],
            model: FORBIDDEN_CANARIES[0],
            caller: FORBIDDEN_CANARIES[3],
            prompt_tokens: 2,
            completion_tokens: 3,
            total_tokens: 5,
            estimated_cost: 0.1,
            latency: 25,
            success: 1,
            error: FORBIDDEN_CANARIES[3]
          }
        ]
      }
      if (sql.includes('FROM intelligence_context_sessions')) {
        return [
          {
            id: 'session-1',
            owner: 'assistant',
            status: 'archived',
            created_at: 10,
            updated_at: 20,
            archived_at: 20,
            is_pinned: 0,
            metadata: FORBIDDEN_CANARIES[0]
          }
        ]
      }
      if (sql.includes('FROM intelligence_context_turns')) {
        return [
          {
            id: 'turn-1',
            session_id: 'session-1',
            role: 'assistant',
            content: FORBIDDEN_CANARIES[6],
            privacy_level: 'normal',
            token_estimate: 4,
            created_at: 20,
            metadata: FORBIDDEN_CANARIES[2]
          }
        ]
      }
      return []
    })
    const owner = createIntelligenceRetentionOwner({ client })
    const auditRecords = await exportCategory(owner, 'intelligence-audit')
    expect(auditRecords).toEqual([
      expect.objectContaining({ providerId: null, modelId: null, callerId: null })
    ])
    const contextRecords = await exportCategory(owner, 'intelligence-context')
    expect(contextRecords).toHaveLength(2)
    expect(contextRecords.every((record) => !Object.hasOwn(record, 'content'))).toBe(true)
  })

  it('exports diagnostic counters without report payloads, endpoints, logs, or native failures', async () => {
    const client = fakeClient((sql) => {
      if (sql.includes('FROM analytics_snapshots')) {
        return [
          {
            window_type: FORBIDDEN_CANARIES[1],
            timestamp: 10,
            metrics: FORBIDDEN_CANARIES[1]
          }
        ]
      }
      if (sql.includes('FROM analytics_report_queue')) {
        return [
          {
            created_at: 20,
            retry_count: 1,
            last_attempt_at: 21,
            endpoint: FORBIDDEN_CANARIES[2],
            payload: FORBIDDEN_CANARIES[0],
            last_error: FORBIDDEN_CANARIES[3]
          }
        ]
      }
      return []
    })
    const owner = createDiagnosticsRetentionOwner({ client, logDirectory: '/unused' })
    const records = await exportCategory(owner, 'diagnostics')
    expect(records).toHaveLength(2)
    expect(records).toContainEqual(
      expect.objectContaining({ kind: 'analytics-snapshot-metadata', windowType: null })
    )
  })
})
