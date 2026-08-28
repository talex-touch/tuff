import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { OrchestratorRunPrivacyFence } from '../privacy/owners/orchestrator-run-privacy-lifecycle'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'

const privacyStoreMocks = vi.hoisted(() => ({
  db: undefined as unknown
}))

vi.mock('electron', () => ({ app: {} }))
vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: async (_label: string, operation: () => Promise<unknown>) => await operation()
  }
}))
vi.mock('../database', () => ({
  databaseModule: { getDb: () => privacyStoreMocks.db }
}))

import { AiOrchestratorStore } from './ai-orchestrator-store'
import { createOrchestratorRunPrivacyLifecycle } from '../privacy/owners/orchestrator-run-privacy-lifecycle'

const CUTOFF_MS = 10_000
const RETENTION_MS = 30 * 24 * 60 * 60_000
const RETENTION_NOW_MS = RETENTION_MS + CUTOFF_MS
const RETENTION_POLICY = { enabled: true, retentionMs: RETENTION_MS } as const
const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
let client: Client
let db: LibSQLDatabase<typeof schema>
let testDirectory: string

async function seedRun(
  id: string,
  status: string,
  updatedAt: number,
  parentRunId: string | null = null
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO ai_orchestrator_runs (
      id, automation_id, session_id, objective, profile_id, runtime_provider, cwd, status,
      output, error, usage, metadata, parent_run_id, delegation_plan, approval_reason,
      created_at, started_at, completed_at, updated_at
    ) VALUES (?, NULL, ?, ?, 'profile', 'pi-core', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      `session-${id}`,
      `CANARY_OBJECTIVE_${id}`,
      `/private/${id}`,
      status,
      `CANARY_OUTPUT_${id}`,
      `CANARY_ERROR_${id}`,
      `{"tokens":1}`,
      `{"CANARY_METADATA":"${id}"}`,
      parentRunId,
      `{"CANARY_DELEGATION":"${id}"}`,
      `CANARY_APPROVAL_${id}`,
      updatedAt - 100,
      updatedAt - 50,
      status === 'running' ? null : updatedAt,
      updatedAt
    ]
  })
}

async function seedEvent(runId: string, seq: number, createdAt: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO ai_orchestrator_events (id, run_id, seq, type, level, payload, created_at)
          VALUES (?, ?, ?, 'trace', 'info', ?, ?)`,
    args: [`event-${runId}-${seq}`, runId, seq, `{"CANARY_EVENT":"${runId}-${seq}"}`, createdAt]
  })
}

async function scalar(sql: string, args: Array<string | number> = []): Promise<unknown> {
  const result = await client.execute({ sql, args })
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined
}

async function seedRetentionCandidates(prefix: string): Promise<string[]> {
  const updatedAtValues = [1_000, 1_000, 2_000, 2_000, 3_000]
  const runIds = updatedAtValues.map((_, index) => `${prefix}-${String.fromCharCode(97 + index)}`)
  for (const [index, runId] of runIds.entries()) {
    const updatedAt = updatedAtValues[index]!
    await seedRun(runId, 'completed', updatedAt)
    await seedEvent(runId, 1, updatedAt + 100)
  }
  return runIds
}

function createTrackingFence(): {
  fence: OrchestratorRunPrivacyFence
  activeRunIds: Set<string>
  releaseCounts: Map<string, number>
} {
  const activeRunIds = new Set<string>()
  const releaseCounts = new Map<string, number>()
  return {
    activeRunIds,
    releaseCounts,
    fence: {
      isRunProtected: (runId) => activeRunIds.has(runId),
      acquireRunDeletionFence: (runId) => {
        if (activeRunIds.has(runId)) return null
        activeRunIds.add(runId)
        return () => {
          releaseCounts.set(runId, (releaseCounts.get(runId) ?? 0) + 1)
          activeRunIds.delete(runId)
        }
      }
    }
  }
}

beforeEach(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), 'tuff-orchestrator-privacy-'))
  client = createClient({ url: `file:${join(testDirectory, 'database.sqlite')}` })
  db = drizzle(client, { schema })
  privacyStoreMocks.db = db
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')
})

afterEach(async () => {
  vi.restoreAllMocks()
  client.close()
  await rm(testDirectory, { recursive: true, force: true })
})

describe('AiOrchestratorStore Privacy lifecycle', () => {
  it('revalidates the opaque revision, protects non-terminal runs, and detaches references before cascade delete', async () => {
    const store = new AiOrchestratorStore()
    await seedRun('root', 'completed', 1_000)
    await seedRun('child', 'completed', 1_100, 'root')
    await client.execute(
      `INSERT INTO ai_automations
        (id, name, objective, profile_id, trigger, approval_mode, created_at, updated_at)
       VALUES
        ('automation', 'Automation', 'Objective', 'profile', 'manual', 'manual', 1, 1)`
    )
    await client.execute(
      `INSERT INTO ai_automation_runs
        (id, automation_id, orchestrator_run_id, trigger_type, status, created_at, updated_at)
       VALUES
        ('automation-run', 'automation', 'root', 'manual', 'completed', 1, 1)`
    )
    await store.appendOrchestratorEvent('root', 'trace', { marker: 'bounded' })

    const firstSnapshot = await store.getOrchestratorRunPrivacySnapshot('root')
    expect(firstSnapshot).toEqual({
      runId: 'root',
      status: 'completed',
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
      eventCount: 1
    })
    expect(JSON.stringify(firstSnapshot)).not.toContain('CANARY_')

    await seedEvent('root', 2, 2_000)
    await expect(
      store.deleteOrchestratorRunForPrivacy('root', firstSnapshot!.revision)
    ).resolves.toEqual({ disposition: 'stale', deletedEventCount: 0 })

    const rootSnapshot = await store.getOrchestratorRunPrivacySnapshot('root')
    await client.execute(
      `UPDATE ai_orchestrator_runs SET objective = 'CANARY_OBJECTIVE_CHANGED' WHERE id = 'root'`
    )
    await expect(
      store.deleteOrchestratorRunForPrivacy('root', rootSnapshot!.revision)
    ).resolves.toEqual({ disposition: 'stale', deletedEventCount: 0 })

    const freshSnapshot = await store.getOrchestratorRunPrivacySnapshot('root')
    await expect(
      store.deleteOrchestratorRunForPrivacy('root', freshSnapshot!.revision)
    ).resolves.toEqual({ disposition: 'deleted', deletedEventCount: 2 })
    expect(await scalar(`SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = 'root'`)).toBe(0)
    expect(await scalar(`SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id = 'root'`)).toBe(
      0
    )
    expect(await scalar(`SELECT parent_run_id FROM ai_orchestrator_runs WHERE id = 'child'`)).toBe(
      null
    )
    expect(
      await scalar(`SELECT orchestrator_run_id FROM ai_automation_runs WHERE id = 'automation-run'`)
    ).toBe(null)

    await seedRun('root', 'completed', 2_500)
    await expect(store.appendOrchestratorEvent('root', 'trace')).resolves.toMatchObject({ seq: 1 })

    for (const status of ['completed', 'failed', 'cancelled', 'interrupted'] as const) {
      const runId = `terminal-${status}`
      await seedRun(runId, status, 3_000)
      const snapshot = await store.getOrchestratorRunPrivacySnapshot(runId)
      await expect(
        store.deleteOrchestratorRunForPrivacy(runId, snapshot!.revision)
      ).resolves.toEqual({ disposition: 'deleted', deletedEventCount: 0 })
    }

    for (const status of ['queued', 'pending_approval', 'running'] as const) {
      const runId = `protected-${status}`
      await seedRun(runId, status, 500)
      const snapshot = await store.getOrchestratorRunPrivacySnapshot(runId)
      await expect(
        store.deleteOrchestratorRunForPrivacy(runId, snapshot!.revision)
      ).resolves.toEqual({ disposition: 'protected', deletedEventCount: 0 })
      expect(await scalar(`SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = ?`, [runId])).toBe(
        1
      )
    }
    await expect(store.deleteOrchestratorRunForPrivacy('missing', 'revision')).resolves.toEqual({
      disposition: 'not-found',
      deletedEventCount: 0
    })
  })

  it('uses strict keyset retention and reports bounded eligible and protected roots without content', async () => {
    const store = new AiOrchestratorStore()
    await seedRun('eligible-a', 'completed', 1_000)
    await seedRun('eligible-b', 'failed', 1_000)
    await seedRun('eligible-c', 'interrupted', 2_000)
    await seedRun('equal-cutoff', 'cancelled', CUTOFF_MS)
    await seedRun('active-old', 'running', 3_000)
    await seedRun('fresh-event', 'completed', 4_000)
    await seedEvent('eligible-a', 1, 1_500)
    await seedEvent('fresh-event', 1, CUTOFF_MS)

    const first = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 2)
    expect(first.candidates.map((candidate) => candidate.runId)).toEqual([
      'eligible-a',
      'eligible-b'
    ])
    expect(first).toMatchObject({
      hasMore: true,
      cursor: { updatedAt: 1_000, runId: 'eligible-b' }
    })
    expect(first.candidates[0]).toMatchObject({ eventCount: 1 })
    expect(first.candidates[0]!.byteCount).toBeGreaterThan(0)
    expect(JSON.stringify(first)).not.toContain('CANARY_')

    const second = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, first.cursor, 2)
    expect(second.candidates.map((candidate) => candidate.runId)).toEqual(['eligible-c'])
    expect(second.hasMore).toBe(false)

    await expect(store.getOrchestratorRunRetentionSummary(CUTOFF_MS, 2)).resolves.toMatchObject({
      eligibleRunCount: 2,
      protectedRunCount: 2,
      bounded: true
    })
  })

  it('counts retained text as UTF-8 bytes', async () => {
    const store = new AiOrchestratorStore()
    await client.execute({
      sql: `INSERT INTO ai_orchestrator_runs (
        id, session_id, objective, profile_id, runtime_provider, cwd, status, output,
        error, usage, metadata, delegation_plan, approval_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      args: [
        'utf8-byte-count',
        'session-utf8-byte-count',
        '界',
        'profile',
        'pi-core',
        '',
        'completed',
        '😀',
        900,
        1_000
      ]
    })
    await client.execute({
      sql: `INSERT INTO ai_orchestrator_events
              (id, run_id, seq, type, level, payload, created_at)
            VALUES (?, ?, 1, 'trace', 'info', ?, ?)`,
      args: ['event-utf8-byte-count', 'utf8-byte-count', '界😀', 1_100]
    })

    const page = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 10)
    expect(page.candidates).toEqual([
      {
        runId: 'utf8-byte-count',
        updatedAt: 1_000,
        eventCount: 1,
        byteCount: 14
      }
    ])
    await expect(store.getOrchestratorRunRetentionSummary(CUTOFF_MS, 10)).resolves.toEqual({
      eligibleRunCount: 1,
      eligibleByteCount: 14,
      protectedRunCount: 0,
      bounded: false
    })
  })

  it('rechecks freshness in the retention transaction and only reports rows actually deleted', async () => {
    const store = new AiOrchestratorStore()
    await seedRun('delete-me', 'completed', 1_000)
    await seedRun('became-fresh', 'failed', 2_000)
    await seedEvent('delete-me', 1, 3_000)

    const page = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 10)
    expect(page.candidates.map((candidate) => candidate.runId)).toEqual([
      'delete-me',
      'became-fresh'
    ])
    await seedEvent('became-fresh', 1, CUTOFF_MS + 1)

    await expect(
      store.deleteOrchestratorRunsForRetention(
        page.candidates.map((candidate) => candidate.runId),
        CUTOFF_MS
      )
    ).resolves.toEqual({
      deletedRunIds: ['delete-me'],
      deletedEventCountByRunId: { 'delete-me': 1 },
      deletedEventCount: 1
    })
    expect(await scalar(`SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = 'delete-me'`)).toBe(0)
    expect(
      await scalar(`SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = 'became-fresh'`)
    ).toBe(1)
  })

  it('deletes five migrated rows across three owner pages and is idempotent', async () => {
    const store = new AiOrchestratorStore()
    const runIds = await seedRetentionCandidates('paged')
    const listCandidates = vi.spyOn(store, 'listOrchestratorRunRetentionCandidates')
    const deleteCandidates = vi.spyOn(store, 'deleteOrchestratorRunsForRetention')
    const { fence, activeRunIds, releaseCounts } = createTrackingFence()
    const lifecycle = createOrchestratorRunPrivacyLifecycle({
      store,
      fence,
      limits: { batchSize: 2, maxRows: 10, maxDurationMs: 10_000 }
    })
    const signal = new AbortController().signal

    await expect(
      lifecycle.applyRetention(RETENTION_POLICY, RETENTION_NOW_MS, signal)
    ).resolves.toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 5,
      protectedItemCount: 0,
      batches: 3,
      partial: false,
      cancelled: false
    })
    expect(listCandidates).toHaveBeenNthCalledWith(1, CUTOFF_MS, undefined, 2)
    expect(listCandidates).toHaveBeenNthCalledWith(
      2,
      CUTOFF_MS,
      {
        updatedAt: 1_000,
        runId: 'paged-b'
      },
      2
    )
    expect(listCandidates).toHaveBeenNthCalledWith(
      3,
      CUTOFF_MS,
      {
        updatedAt: 2_000,
        runId: 'paged-d'
      },
      2
    )
    expect(deleteCandidates).toHaveBeenNthCalledWith(1, ['paged-a', 'paged-b'], CUTOFF_MS)
    expect(deleteCandidates).toHaveBeenNthCalledWith(2, ['paged-c', 'paged-d'], CUTOFF_MS)
    expect(deleteCandidates).toHaveBeenNthCalledWith(3, ['paged-e'], CUTOFF_MS)
    expect(
      await scalar('SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id GLOB ?', ['paged-*'])
    ).toBe(0)
    expect(
      await scalar('SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id GLOB ?', ['paged-*'])
    ).toBe(0)
    expect(activeRunIds.size).toBe(0)
    expect(Object.fromEntries(releaseCounts)).toEqual(
      Object.fromEntries(runIds.map((runId) => [runId, 1]))
    )

    await expect(
      lifecycle.applyRetention(RETENTION_POLICY, RETENTION_NOW_MS, signal)
    ).resolves.toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 0,
      deletedByteCount: 0,
      batches: 0,
      partial: false
    })
    expect(listCandidates).toHaveBeenNthCalledWith(4, CUTOFF_MS, undefined, 2)
    expect(deleteCandidates).toHaveBeenCalledTimes(3)
    expect(activeRunIds.size).toBe(0)
  })

  it('stops before the next migrated page when cancellation follows the first commit', async () => {
    const store = new AiOrchestratorStore()
    const runIds = await seedRetentionCandidates('cancel')
    const controller = new AbortController()
    const listCandidates = vi.spyOn(store, 'listOrchestratorRunRetentionCandidates')
    const deleteFirstBatch = store.deleteOrchestratorRunsForRetention.bind(store)
    const deleteCandidates = vi
      .spyOn(store, 'deleteOrchestratorRunsForRetention')
      .mockImplementation(async (candidateRunIds, cutoffMs) => {
        const result = await deleteFirstBatch(candidateRunIds, cutoffMs)
        controller.abort()
        return result
      })
    const { fence, activeRunIds, releaseCounts } = createTrackingFence()
    const lifecycle = createOrchestratorRunPrivacyLifecycle({
      store,
      fence,
      limits: { batchSize: 2, maxRows: 10, maxDurationMs: 10_000 }
    })

    await expect(
      lifecycle.applyRetention(RETENTION_POLICY, RETENTION_NOW_MS, controller.signal)
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      deletedItemCount: 2,
      batches: 1,
      partial: true,
      cancelled: true
    })
    expect(listCandidates).toHaveBeenCalledOnce()
    expect(listCandidates).toHaveBeenCalledWith(CUTOFF_MS, undefined, 2)
    expect(deleteCandidates).toHaveBeenCalledOnce()
    expect(deleteCandidates).toHaveBeenCalledWith(['cancel-a', 'cancel-b'], CUTOFF_MS)
    expect(
      await client.execute(
        `SELECT id FROM ai_orchestrator_runs WHERE id GLOB 'cancel-*' ORDER BY id`
      )
    ).toMatchObject({ rows: runIds.slice(2).map((id) => ({ id })) })
    expect(
      await scalar(
        `SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id IN ('cancel-a', 'cancel-b')`
      )
    ).toBe(0)
    expect(
      await scalar(`SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id GLOB 'cancel-*'`)
    ).toBe(3)
    expect(activeRunIds.size).toBe(0)
    expect(Object.fromEntries(releaseCounts)).toEqual({ 'cancel-a': 1, 'cancel-b': 1 })
  })
})
