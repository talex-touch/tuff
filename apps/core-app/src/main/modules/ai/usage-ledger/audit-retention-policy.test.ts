import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IntelligenceAuditLogEntry } from '../intelligence-audit-logger'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { intelligenceAuditLogs } from '../../../db/schema'
import '../intelligence-test-harness'
import { IntelligenceAuditLogger } from '../intelligence-audit-logger'
import {
  resolveExcessDetailKeepBoundary,
  runBoundedAuditRetention,
  shouldPersistAuditDetail
} from './audit-retention-policy'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

function createEntry(
  index: number,
  overrides: Partial<IntelligenceAuditLogEntry> = {}
): IntelligenceAuditLogEntry {
  return {
    traceId: `trace-policy-${index}`,
    timestamp: Date.now() - 10_000 + index,
    capabilityId: 'text.chat',
    provider: 'test-provider',
    model: 'gpt-4o-mini',
    caller: 'plugin:retention-test',
    usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
    estimatedCost: 0,
    latency: 5,
    success: true,
    ...overrides
  }
}

describe('audit-retention-policy', () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tuff-audit-retention-'))
    client = createClient({ url: `file:${join(tempDir, 'retention.sqlite')}` })
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
  }, 60_000)

  beforeEach(async () => {
    await db.delete(intelligenceAuditLogs)
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await dbWriteScheduler.drain()
    client?.close()
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  }, 60_000)

  it('applies high-volume detail exemption for background file embeddings', () => {
    expect(shouldPersistAuditDetail(false, { capabilityId: 'text.chat', caller: 'plugin:a' })).toBe(
      false
    )
    expect(
      shouldPersistAuditDetail(true, {
        capabilityId: 'embedding.generate',
        caller: 'core.files.embedding'
      })
    ).toBe(false)
    expect(
      shouldPersistAuditDetail(true, {
        capabilityId: 'embedding.generate',
        caller: 'plugin:custom'
      })
    ).toBe(true)
    expect(
      shouldPersistAuditDetail(true, {
        capabilityId: 'text.chat',
        caller: 'core.home.conversation'
      })
    ).toBe(true)
  })

  it('computes keepFloorId once per pass across multi-batch excess cleanup', async () => {
    const baseTimestamp = Date.now() - 5_000
    await db.insert(intelligenceAuditLogs).values(
      Array.from({ length: 12 }, (_, index) => ({
        traceId: `trace-backlog-${index}`,
        timestamp: baseTimestamp + index,
        capabilityId: 'text.chat',
        provider: 'test-provider',
        model: 'gpt-4o-mini',
        caller: 'plugin:retention-test',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        estimatedCost: 0,
        latency: 2,
        success: true
      }))
    )

    const executeSpy = vi.spyOn(client, 'execute')
    const result = await runBoundedAuditRetention({
      db,
      isBackfillSettled: () => true,
      cleanupAgePage: async () => ({ deletedCount: 0, hasMore: false, cancelled: false }),
      runOptions: {
        maxRows: 2,
        retentionDays: 30,
        batchSize: 2,
        maxBatches: 10
      }
    })

    expect(result).toEqual({ deletedAge: 0, deletedExcess: 10 })
    const offsetQueries = executeSpy.mock.calls.filter(([stmt]) => {
      const sqlText = typeof stmt === 'string' ? stmt : ((stmt as { sql?: string }).sql ?? '')
      return sqlText.toLowerCase().includes('offset')
    })
    expect(offsetQueries).toHaveLength(1)

    const remaining = await db.select({ id: intelligenceAuditLogs.id }).from(intelligenceAuditLogs)
    expect(remaining).toHaveLength(2)
  })

  it('returns empty keep boundary when row count is within maxRows', async () => {
    await expect(resolveExcessDetailKeepBoundary(db, 10)).resolves.toEqual({ mode: 'empty' })
    await expect(resolveExcessDetailKeepBoundary(db, 0)).resolves.toEqual({ mode: 'delete-all' })
  })

  it('invokes reclaimFreePages only when deleted count reaches large-delete threshold', async () => {
    const reclaimFreePages = vi.fn(async () => 64)

    await runBoundedAuditRetention({
      db,
      isBackfillSettled: () => true,
      cleanupAgePage: async () => ({ deletedCount: 120, hasMore: false, cancelled: false }),
      reclaimFreePages,
      runOptions: { maxRows: 1000, retentionDays: 30, maxBatches: 5 }
    })
    expect(reclaimFreePages).not.toHaveBeenCalled()

    await runBoundedAuditRetention({
      db,
      isBackfillSettled: () => true,
      cleanupAgePage: async () => ({ deletedCount: 520, hasMore: false, cancelled: false }),
      reclaimFreePages,
      runOptions: { maxRows: 1000, retentionDays: 30, maxBatches: 5 }
    })
    expect(reclaimFreePages).toHaveBeenCalledTimes(1)
  })

  it('coalesces contiguous count-only entries into larger flush batches and clears flushTimer on destroy', async () => {
    const logger = new IntelligenceAuditLogger()
    const internals = logger as unknown as {
      pendingLogs: IntelligenceAuditLogEntry[]
      flushTimer: NodeJS.Timeout | null
      takeNextFlushBatch: () => IntelligenceAuditLogEntry[]
      scheduleFlush: (delayMs?: number) => void
    }
    try {
      for (let i = 0; i < 65; i += 1) {
        await logger.log(
          createEntry(i, { capabilityId: 'embedding.generate', caller: 'core.files.embedding' }),
          {
            detail: false
          }
        )
      }
      const batch = internals.takeNextFlushBatch()
      expect(batch).toHaveLength(65)
      expect(internals.pendingLogs).toHaveLength(0)

      internals.scheduleFlush(5_000)
      expect(internals.flushTimer).not.toBeNull()
      await logger.destroy()
      expect(internals.flushTimer).toBeNull()
    } finally {
      await logger.destroy()
    }
  })
})
