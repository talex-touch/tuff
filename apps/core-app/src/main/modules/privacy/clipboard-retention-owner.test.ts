import type { Client, InStatement } from '@libsql/client'
import type { PrivacyOwnerDeleteRequest } from './data-owner'
import type { PrivacyOwnerWriteScheduler } from './owner-utils'
import type { ClipboardImageRetentionOwner } from './owners/clipboard-retention-owner'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { withSqliteRetry } from '../../db/sqlite-retry'
import { TempFileService } from '../../service/temp-file.service'
import { createClipboardRetentionOwner } from './owners/clipboard-retention-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'
import { applyPrivacyMigrations, createPrivacyTestClient } from './retention-test-utils'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const POLICY = DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history']
const CUTOFF_SECONDS = Math.floor((NOW_MS - 90 * PRIVACY_RETENTION_DAY_MS) / 1000)
const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'

type TestClient = Awaited<ReturnType<typeof createPrivacyTestClient>>['client']

function retentionRequest(): PrivacyOwnerDeleteRequest {
  return {
    category: 'clipboard-history',
    mode: 'retention',
    policy: POLICY,
    nowMs: NOW_MS
  }
}

function manualPreviewRequest(): PrivacyOwnerDeleteRequest {
  return {
    category: 'clipboard-history',
    mode: 'manual-delete',
    policy: POLICY,
    nowMs: NOW_MS
  }
}

async function installTrustedProtectionFixture(client: TestClient): Promise<void> {
  const columns = await client.execute(`PRAGMA table_info('clipboard_history')`)
  if (!columns.rows.some((row) => row.name === 'retention_protected')) {
    await client.execute(
      'ALTER TABLE clipboard_history ADD COLUMN retention_protected INTEGER NOT NULL DEFAULT 0'
    )
  }
}

async function seedClipboard(
  client: TestClient,
  values: Array<{
    type?: 'text' | 'image'
    content: string
    timestamp: number
    favorite?: boolean
    retentionProtected?: boolean
    metadata?: string
  }>
): Promise<number[]> {
  const ids: number[] = []
  for (const value of values) {
    const inserted = await client.execute({
      sql: `
        INSERT INTO clipboard_history
          (type, content, timestamp, is_favorite, metadata, retention_protected)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        value.type ?? 'text',
        value.content,
        value.timestamp,
        value.favorite ? 1 : 0,
        value.metadata ?? null,
        value.retentionProtected ? 1 : 0
      ]
    })
    ids.push(Number(inserted.lastInsertRowid))
  }
  return ids
}

async function listClipboardIds(client: TestClient): Promise<number[]> {
  const result = await client.execute('SELECT id FROM clipboard_history ORDER BY id')
  return result.rows.map((row) => Number(row.id))
}

async function countRows(client: TestClient, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function sqliteBusyError(): Error {
  return Object.assign(new Error('CANARY_NATIVE_BUSY_DETAIL'), {
    code: 'SQLITE_BUSY',
    rawCode: 5
  })
}

function createDeleteFaultClient(
  client: TestClient,
  failures: number
): { client: Pick<Client, 'execute' | 'batch'>; deleteAttempts: () => number } {
  let deleteAttempts = 0
  const execute = async (statement: InStatement | string) => {
    const sql = typeof statement === 'string' ? statement : statement.sql
    if (/DELETE\s+FROM\s+clipboard_history/i.test(sql)) {
      deleteAttempts += 1
      if (deleteAttempts <= failures) throw sqliteBusyError()
    }
    return client.execute(statement)
  }
  return {
    client: {
      execute: execute as Client['execute'],
      batch: client.batch.bind(client) as Client['batch']
    },
    deleteAttempts: () => deleteAttempts
  }
}

function createTracingClient(client: TestClient): {
  client: Pick<Client, 'execute' | 'batch'>
  candidateQueries: string[]
} {
  const candidateQueries: string[] = []
  const execute = async (statement: InStatement | string) => {
    const sql = typeof statement === 'string' ? statement : statement.sql
    if (/SELECT\s+id\s+AS\s+owner_id[\s\S]+FROM\s+clipboard_history/i.test(sql)) {
      candidateQueries.push(sql)
    }
    return client.execute(statement)
  }
  return {
    client: {
      execute: execute as Client['execute'],
      batch: client.batch.bind(client) as Client['batch']
    },
    candidateQueries
  }
}

describe('clipboard retention owner RED 2A', () => {
  it('uses the 90-day default with strict < cutoff and only trusted protection authority', async () => {
    const { client } = await createPrivacyTestClient('clipboard-cutoff')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql'
    ])
    await installTrustedProtectionFixture(client)
    expect(POLICY.retentionMs).toBe(90 * PRIVACY_RETENTION_DAY_MS)

    await seedClipboard(client, [
      { content: 'CANARY_CLIPBOARD_BEFORE', timestamp: CUTOFF_SECONDS - 1 },
      { content: 'CANARY_CLIPBOARD_EQUAL', timestamp: CUTOFF_SECONDS },
      { content: 'CANARY_CLIPBOARD_AFTER', timestamp: CUTOFF_SECONDS + 1 },
      {
        content: 'CANARY_CLIPBOARD_FAVORITE',
        timestamp: CUTOFF_SECONDS - 1,
        favorite: true
      },
      {
        content: 'CANARY_CLIPBOARD_PINNED',
        timestamp: CUTOFF_SECONDS - 1,
        favorite: true
      },
      {
        content: 'CANARY_CLIPBOARD_HOST_IMPORTANT',
        timestamp: CUTOFF_SECONDS - 1,
        retentionProtected: true
      },
      {
        content: 'CANARY_CLIPBOARD_UNTRUSTED_METADATA',
        timestamp: CUTOFF_SECONDS - 1,
        metadata: '{"important":true,"pinned":true,"retention_protected":true}'
      }
    ])

    const owner = createClipboardRetentionOwner({ client })
    const preview = await owner.previewDelete(retentionRequest(), new AbortController().signal)
    expect(preview).toMatchObject({
      ok: true,
      eligibleItemCount: 2,
      protectedItemCount: 3,
      bounded: false
    })

    const result = await owner.delete(retentionRequest(), new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 2,
      protectedItemCount: 3,
      partial: false
    })
    expect(await listClipboardIds(client)).toEqual([2, 3, 4, 5, 6])
    expect(JSON.stringify({ preview, result })).not.toContain('CANARY_CLIPBOARD')
  })

  it('includes trusted protected rows in manual-delete impact evidence', async () => {
    const { client } = await createPrivacyTestClient('clipboard-manual-preview')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    await seedClipboard(client, [
      { content: 'ordinary', timestamp: CUTOFF_SECONDS + 1 },
      { content: 'favorite', timestamp: CUTOFF_SECONDS + 1, favorite: true },
      {
        content: 'host-important',
        timestamp: CUTOFF_SECONDS + 1,
        retentionProtected: true
      }
    ])

    const preview = await createClipboardRetentionOwner({ client }).previewDelete(
      manualPreviewRequest(),
      new AbortController().signal
    )

    expect(preview).toMatchObject({
      ok: true,
      eligibleItemCount: 3,
      protectedItemCount: 2,
      bounded: false
    })
    expect(JSON.stringify(preview)).not.toContain('favorite')
  })

  it('rechecks favorite authority in the commit statement when selection races a pin', async () => {
    const { client } = await createPrivacyTestClient('clipboard-favorite-race')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    const [id] = await seedClipboard(client, [
      { content: 'favorite-race', timestamp: CUTOFF_SECONDS - 1 }
    ])
    const scheduleWrite: PrivacyOwnerWriteScheduler = async (_label, operation) => {
      await client.execute({
        sql: 'UPDATE clipboard_history SET is_favorite = 1 WHERE id = ?',
        args: [id]
      })
      return operation()
    }

    const result = await createClipboardRetentionOwner({ client, scheduleWrite }).delete(
      retentionRequest(),
      new AbortController().signal
    )

    expect(result).toMatchObject({ ok: true, deletedItemCount: 0 })
    expect(await listClipboardIds(client)).toEqual([id])
  })

  it('does not run orphan reconciliation after the database row budget is exhausted', async () => {
    const { client } = await createPrivacyTestClient('clipboard-reconcile-budget')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    await seedClipboard(client, [
      { content: 'first', timestamp: CUTOFF_SECONDS - 2 },
      { content: 'second', timestamp: CUTOFF_SECONDS - 1 }
    ])
    const reconcileOrphans = vi.fn(async () => ({
      deletedCount: 0,
      deletedByteCount: 0,
      failedCount: 0
    }))

    const result = await createClipboardRetentionOwner({
      client,
      limits: { batchSize: 1, maxRows: 1 },
      imageOwner: {
        async deleteReferences() {
          return { deletedCount: 0, deletedByteCount: 0, failedCount: 0 }
        },
        reconcileOrphans
      }
    }).delete(retentionRequest(), new AbortController().signal)

    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_LIMIT_REACHED',
      deletedItemCount: 1
    })
    expect(reconcileOrphans).not.toHaveBeenCalled()
    expect(await listClipboardIds(client)).toHaveLength(1)
  })

  it('uses bounded monotonic pages and stops after one committed page on cancellation', async () => {
    const { client } = await createPrivacyTestClient('clipboard-pages')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    await seedClipboard(
      client,
      Array.from({ length: 5 }, (_, index) => ({
        content: `page-${index + 1}`,
        timestamp: CUTOFF_SECONDS - 10 + index
      }))
    )

    const controller = new AbortController()
    const traced = createTracingClient(client)
    const committedBatches: number[][] = []
    const cached = new Set([1, 2, 3, 4, 5])
    const freshness = new Set([1, 2, 3, 4, 5])
    const scheduleWriteCalls = vi.fn()
    const scheduleWrite: PrivacyOwnerWriteScheduler = async (label, operation) => {
      scheduleWriteCalls(label, operation)
      return operation()
    }
    const owner = createClipboardRetentionOwner({
      client: traced.client,
      limits: { batchSize: 2, maxRows: 10 },
      scheduleWrite,
      onDeleted(ids) {
        committedBatches.push([...ids])
        for (const id of ids) {
          cached.delete(id)
          freshness.delete(id)
        }
        controller.abort()
      }
    })

    const cancelled = await owner.delete(retentionRequest(), controller.signal)
    expect(cancelled).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      cancelled: true,
      deletedItemCount: 2,
      batches: 1,
      partial: true
    })
    expect(committedBatches).toEqual([[1, 2]])
    expect(await listClipboardIds(client)).toEqual([3, 4, 5])
    expect([...cached]).toEqual([3, 4, 5])
    expect([...freshness]).toEqual([3, 4, 5])
    expect(scheduleWriteCalls).toHaveBeenCalledOnce()

    const resumedBatches: number[][] = []
    const resumed = createClipboardRetentionOwner({
      client: traced.client,
      limits: { batchSize: 2, maxRows: 10 },
      scheduleWrite,
      onDeleted: (ids) => resumedBatches.push([...ids])
    })
    const completed = await resumed.delete(retentionRequest(), new AbortController().signal)
    expect(completed).toMatchObject({ ok: true, deletedItemCount: 3, batches: 2 })
    expect(resumedBatches).toEqual([[3, 4], [5]])
    expect(traced.candidateQueries).toHaveLength(3)
    expect(traced.candidateQueries.every((sql) => !/\bOFFSET\b/i.test(sql))).toBe(true)
    expect(
      traced.candidateQueries.slice(1).every((sql) => /(?:timestamp|id)\s*>\s*\?/i.test(sql))
    ).toBe(true)
    expect(await listClipboardIds(client)).toEqual([])
  })

  it('commits the root/FK page and evicts cache before awaiting associated image deletion', async () => {
    const { client, directory } = await createPrivacyTestClient('clipboard-image-order')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql'
    ])
    await installTrustedProtectionFixture(client)
    const temp = new TempFileService({ baseDir: join(directory, 'temp') })
    temp.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    const image = await temp.createFile({
      namespace: CLIPBOARD_IMAGE_NAMESPACE,
      text: 'CANARY_IMAGE_BYTES'
    })
    const [clipboardId] = await seedClipboard(client, [
      { type: 'image', content: image.path, timestamp: CUTOFF_SECONDS - 1 }
    ])
    await client.execute({
      sql: `INSERT INTO clipboard_history_meta (clipboard_id, key, value) VALUES (?, ?, ?)`,
      args: [clipboardId, 'ocr_text', 'CANARY_OCR_META']
    })
    const job = await client.execute({
      sql: `INSERT INTO ocr_jobs (clipboard_id, status, queued_at, finished_at, meta)
            VALUES (?, 'completed', ?, ?, ?)`,
      args: [clipboardId, CUTOFF_SECONDS - 2, CUTOFF_SECONDS - 1, 'CANARY_OCR_JOB_META']
    })
    await client.execute({
      sql: `INSERT INTO ocr_results (job_id, text, created_at) VALUES (?, ?, ?)`,
      args: [Number(job.lastInsertRowid), 'CANARY_OCR_RESULT', CUTOFF_SECONDS - 1]
    })

    let releaseImage: (() => void) | undefined
    const imageBarrier = new Promise<void>((resolve) => {
      releaseImage = resolve
    })
    const deleteReferences = vi.fn(async (references: readonly string[]) => {
      await imageBarrier
      const deleted = await temp.deleteFile(references[0])
      return { deletedCount: deleted ? 1 : 0, deletedByteCount: 18, failedCount: deleted ? 0 : 1 }
    })
    const reconcileOrphans = vi.fn(async () => ({
      deletedCount: 0,
      deletedByteCount: 0,
      failedCount: 0
    }))
    const cached = new Set([clipboardId])
    const freshness = new Set([clipboardId])
    const owner = createClipboardRetentionOwner({
      client,
      imageOwner: { deleteReferences, reconcileOrphans },
      onDeleted(ids) {
        ids.forEach((id) => {
          cached.delete(id)
          freshness.delete(id)
        })
      }
    })

    const deletion = owner.delete(retentionRequest(), new AbortController().signal)
    await vi.waitFor(() => expect(deleteReferences).toHaveBeenCalledOnce())
    const committedBeforeUnlink = {
      roots: await countRows(client, 'clipboard_history'),
      metadata: await countRows(client, 'clipboard_history_meta'),
      jobs: await countRows(client, 'ocr_jobs'),
      results: await countRows(client, 'ocr_results'),
      cached: cached.size,
      freshness: freshness.size,
      fileExists: await exists(image.path)
    }

    releaseImage?.()
    const result = await deletion
    expect(committedBeforeUnlink).toEqual({
      roots: 0,
      metadata: 0,
      jobs: 0,
      results: 0,
      cached: 0,
      freshness: 0,
      fileExists: true
    })
    expect(reconcileOrphans).toHaveBeenCalledOnce()
    expect(await exists(image.path)).toBe(false)
    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(JSON.stringify(result)).not.toContain('CANARY_')
  })

  it('keeps a committed unlink failure observable and recovers it through orphan retry', async () => {
    const { client, directory } = await createPrivacyTestClient('clipboard-orphan-retry')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    const temp = new TempFileService({ baseDir: join(directory, 'temp') })
    temp.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    const image = await temp.createFile({
      namespace: CLIPBOARD_IMAGE_NAMESPACE,
      text: 'CANARY_ORPHAN_IMAGE'
    })
    await seedClipboard(client, [
      { type: 'image', content: image.path, timestamp: CUTOFF_SECONDS - 1 }
    ])

    let referenceAttempts = 0
    let reconciliationAttempts = 0
    const imageOwner: ClipboardImageRetentionOwner = {
      async deleteReferences(references) {
        referenceAttempts += 1
        if (referenceAttempts === 1) {
          return { deletedCount: 0, deletedByteCount: 0, failedCount: 1 }
        }
        const deleted = references[0] ? await temp.deleteFile(references[0]) : false
        return { deletedCount: deleted ? 1 : 0, deletedByteCount: 0, failedCount: 0 }
      },
      async reconcileOrphans() {
        reconciliationAttempts += 1
        if (reconciliationAttempts === 1) {
          return { deletedCount: 0, deletedByteCount: 0, failedCount: 1 }
        }
        const deleted = await temp.deleteFile(image.path)
        return { deletedCount: deleted ? 1 : 0, deletedByteCount: 0, failedCount: 0 }
      }
    }
    const owner = createClipboardRetentionOwner({ client, imageOwner })

    const failed = await owner.delete(retentionRequest(), new AbortController().signal)
    expect(failed).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED',
      retryable: true,
      deletedItemCount: 1,
      partial: true
    })
    expect(await listClipboardIds(client)).toEqual([])
    expect(await exists(image.path)).toBe(true)
    expect(reconciliationAttempts).toBe(1)
    expect(JSON.stringify(failed)).not.toContain('CANARY_ORPHAN_IMAGE')

    const recovered = await owner.delete(retentionRequest(), new AbortController().signal)
    expect(recovered.ok).toBe(true)
    expect(await exists(image.path)).toBe(false)
    const idempotent = await owner.delete(retentionRequest(), new AbortController().signal)
    expect(idempotent).toMatchObject({ ok: true, deletedItemCount: 0 })
  })

  it('retries transient SQLITE_BUSY and reports exhausted retry without native detail', async () => {
    const { client } = await createPrivacyTestClient('clipboard-busy')
    await applyPrivacyMigrations(client, ['0002_eager_the_executioner.sql'])
    await installTrustedProtectionFixture(client)
    await seedClipboard(client, [{ content: 'transient-busy', timestamp: CUTOFF_SECONDS - 1 }])

    const transient = createDeleteFaultClient(client, 1)
    const retryingSchedulerCalls = vi.fn()
    const retryingScheduler: PrivacyOwnerWriteScheduler = (label, operation) => {
      retryingSchedulerCalls(label, operation)
      return withSqliteRetry(operation, {
        label,
        retries: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0
      })
    }
    const recovered = await createClipboardRetentionOwner({
      client: transient.client,
      scheduleWrite: retryingScheduler
    }).delete(retentionRequest(), new AbortController().signal)
    expect(recovered).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(transient.deleteAttempts()).toBe(2)
    expect(retryingSchedulerCalls).toHaveBeenCalledWith(
      'privacy.clipboard.retention',
      expect.any(Function)
    )

    await seedClipboard(client, [
      { content: 'CANARY_EXHAUSTED_BUSY_ROW', timestamp: CUTOFF_SECONDS - 1 }
    ])
    const exhausted = createDeleteFaultClient(client, Number.POSITIVE_INFINITY)
    const failed = await createClipboardRetentionOwner({
      client: exhausted.client,
      scheduleWrite: retryingScheduler
    }).delete(retentionRequest(), new AbortController().signal)
    expect(failed).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_DATABASE_FAILED',
      retryable: true,
      deletedItemCount: 0,
      partial: false
    })
    expect(exhausted.deleteAttempts()).toBe(2)
    expect(await countRows(client, 'clipboard_history')).toBe(1)
    expect(JSON.stringify(failed)).not.toMatch(/CANARY_|SQLITE_BUSY|database is locked/i)
  })
})
