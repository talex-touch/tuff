import type { PrivacyOwnerWriteScheduler } from './owner-utils'
import { constants } from 'node:fs'
import { access, mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { TempFileService } from '../../service/temp-file.service'
import {
  createOcrScreenshotRetentionOwner,
  OCR_INTERMEDIATE_TEMP_NAMESPACE,
  OCR_SCREENSHOT_TEMP_NAMESPACES,
  releaseOcrScreenshotTempArtifact,
  SCREENSHOT_TEMP_NAMESPACE
} from './owners/ocr-screenshot-retention-owner'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'
import { applyPrivacyMigrations, createPrivacyTestClient } from './retention-test-utils'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const POLICY = DEFAULT_PRIVACY_RETENTION_POLICY.categories['ocr-screenshot-temp']
const CUTOFF_MS = NOW_MS - PRIVACY_RETENTION_DAY_MS
const CUTOFF_SECONDS = Math.floor(CUTOFF_MS / 1000)
const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'

type TestClient = Awaited<ReturnType<typeof createPrivacyTestClient>>['client']
type OcrJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function seedOcrJob(
  client: TestClient,
  input: {
    status: OcrJobStatus
    queuedAt: number
    finishedAt?: number | null
    suffix: string
    sourcePath?: string
  }
): Promise<number> {
  const inserted = await client.execute({
    sql: `
      INSERT INTO ocr_jobs (status, queued_at, finished_at, last_error, meta)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [
      input.status,
      input.queuedAt,
      input.finishedAt ?? null,
      `CANARY_NATIVE_ERROR_${input.suffix}`,
      JSON.stringify({
        source: {
          type: input.sourcePath ? 'file' : 'data-url',
          filePath: input.sourcePath,
          dataUrl: `data:image/png;base64,CANARY_DATA_URL_${input.suffix}`
        }
      })
    ]
  })
  const jobId = Number(inserted.lastInsertRowid)
  await client.execute({
    sql: `INSERT INTO ocr_results (job_id, text, extra, created_at) VALUES (?, ?, ?, ?)`,
    args: [
      jobId,
      `CANARY_OCR_TEXT_${input.suffix}`,
      `{"raw":"CANARY_OCR_EXTRA_${input.suffix}"}`,
      input.finishedAt ?? input.queuedAt
    ]
  })
  return jobId
}

async function listJobStatuses(client: TestClient): Promise<string[]> {
  const result = await client.execute('SELECT status FROM ocr_jobs ORDER BY id')
  return result.rows.map((row) => String(row.status))
}

async function countRows(client: TestClient, table: 'ocr_jobs' | 'ocr_results'): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

function retentionRequest() {
  return {
    category: 'ocr-screenshot-temp' as const,
    mode: 'retention' as const,
    policy: POLICY,
    nowMs: NOW_MS
  }
}

describe('oCR and screenshot retention owner RED 2A', () => {
  it('uses strict 24-hour boundaries and deletes only terminal OCR aggregates and fixed namespaces', async () => {
    const { client, directory } = await createPrivacyTestClient('ocr-temp-boundary')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql',
      '0008_damp_living_mummy.sql'
    ])
    expect(POLICY.retentionMs).toBe(PRIVACY_RETENTION_DAY_MS)
    const tempBase = join(directory, 'temp')
    const temp = new TempFileService({ baseDir: tempBase, cleanupIntervalMs: 30_000 })
    temp.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    const owner = createOcrScreenshotRetentionOwner({ client, tempFileService: temp })
    expect(OCR_SCREENSHOT_TEMP_NAMESPACES).toEqual([
      OCR_INTERMEDIATE_TEMP_NAMESPACE,
      SCREENSHOT_TEMP_NAMESPACE
    ])
    expect(temp.getNamespaceConfig(OCR_INTERMEDIATE_TEMP_NAMESPACE)).toMatchObject({
      retentionMs: PRIVACY_RETENTION_DAY_MS,
      automaticCleanup: false
    })
    expect(temp.getNamespaceConfig(SCREENSHOT_TEMP_NAMESPACE)).toMatchObject({
      retentionMs: PRIVACY_RETENTION_DAY_MS,
      automaticCleanup: false
    })

    const oldIntermediate = await temp.createFile({
      namespace: OCR_INTERMEDIATE_TEMP_NAMESPACE,
      text: 'CANARY_OCR_FILE_BEFORE'
    })
    const boundaryScreenshot = await temp.createFile({
      namespace: SCREENSHOT_TEMP_NAMESPACE,
      text: 'CANARY_SCREENSHOT_FILE_EQUAL'
    })
    const freshScreenshot = await temp.createFile({
      namespace: SCREENSHOT_TEMP_NAMESPACE,
      text: 'CANARY_SCREENSHOT_FILE_AFTER'
    })
    const clipboardImage = await temp.createFile({
      namespace: CLIPBOARD_IMAGE_NAMESPACE,
      text: 'CANARY_CLIPBOARD_FILE'
    })
    const userSource = join(directory, 'user-owned-source.png')
    await writeFile(userSource, 'CANARY_USER_SOURCE')
    await utimes(oldIntermediate.path, new Date(CUTOFF_MS - 1_000), new Date(CUTOFF_MS - 1_000))
    await utimes(boundaryScreenshot.path, new Date(CUTOFF_MS), new Date(CUTOFF_MS))
    await utimes(freshScreenshot.path, new Date(CUTOFF_MS + 1_000), new Date(CUTOFF_MS + 1_000))
    await utimes(clipboardImage.path, new Date(CUTOFF_MS - 1_000), new Date(CUTOFF_MS - 1_000))

    await seedOcrJob(client, {
      status: 'completed',
      queuedAt: CUTOFF_SECONDS - 10,
      finishedAt: CUTOFF_SECONDS - 1,
      suffix: 'COMPLETED_OLD',
      sourcePath: userSource
    })
    await seedOcrJob(client, {
      status: 'failed',
      queuedAt: CUTOFF_SECONDS - 10,
      finishedAt: CUTOFF_SECONDS - 1,
      suffix: 'FAILED_OLD'
    })
    await seedOcrJob(client, {
      status: 'cancelled',
      queuedAt: CUTOFF_SECONDS - 10,
      finishedAt: CUTOFF_SECONDS - 1,
      suffix: 'CANCELLED_OLD'
    })
    await seedOcrJob(client, {
      status: 'completed',
      queuedAt: CUTOFF_SECONDS - 10,
      finishedAt: CUTOFF_SECONDS,
      suffix: 'COMPLETED_EQUAL'
    })
    await seedOcrJob(client, {
      status: 'completed',
      queuedAt: CUTOFF_SECONDS - 10,
      finishedAt: CUTOFF_SECONDS + 1,
      suffix: 'COMPLETED_AFTER'
    })
    await seedOcrJob(client, {
      status: 'pending',
      queuedAt: CUTOFF_SECONDS - 1,
      suffix: 'PENDING_OLD',
      sourcePath: userSource
    })
    await seedOcrJob(client, {
      status: 'processing',
      queuedAt: CUTOFF_SECONDS - 1,
      suffix: 'PROCESSING_OLD',
      sourcePath: userSource
    })

    const preview = await owner.previewDelete(retentionRequest(), new AbortController().signal)
    expect(preview).toMatchObject({
      ok: true,
      eligibleItemCount: 4,
      protectedItemCount: 2,
      bounded: false
    })

    const result = await owner.delete(retentionRequest(), new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      deletedItemCount: 4,
      protectedItemCount: 2,
      failedItemCount: 0
    })
    expect(await exists(oldIntermediate.path)).toBe(false)
    expect(await exists(boundaryScreenshot.path)).toBe(true)
    expect(await exists(freshScreenshot.path)).toBe(true)
    expect(await exists(clipboardImage.path)).toBe(true)
    expect(await exists(userSource)).toBe(true)
    expect(await listJobStatuses(client)).toEqual([
      'completed',
      'completed',
      'pending',
      'processing'
    ])
    expect(await countRows(client, 'ocr_results')).toBe(4)

    const projection = JSON.stringify({ preview, result })
    expect(projection).not.toMatch(/CANARY_|data:image|user-owned-source|NATIVE_ERROR/i)
    expect(projection).not.toContain(directory)
  })

  it('keeps lifecycle policy authoritative over producer defaults and permanent retention', async () => {
    const { client, directory } = await createPrivacyTestClient('ocr-temp-policy-authority')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql',
      '0008_damp_living_mummy.sql'
    ])
    const temp = new TempFileService({ baseDir: join(directory, 'temp') })
    temp.registerNamespace({
      namespace: SCREENSHOT_TEMP_NAMESPACE,
      retentionMs: PRIVACY_RETENTION_DAY_MS,
      automaticCleanup: false
    })
    const owner = createOcrScreenshotRetentionOwner({ client, tempFileService: temp })
    const sevenDays = 7 * PRIVACY_RETENTION_DAY_MS

    await expect(
      owner.delete(
        {
          category: 'ocr-screenshot-temp',
          mode: 'retention',
          policy: { enabled: true, retentionMs: sevenDays },
          nowMs: NOW_MS
        },
        new AbortController().signal
      )
    ).resolves.toMatchObject({ ok: true })
    for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
      expect(temp.getNamespaceConfig(namespace)).toMatchObject({
        retentionMs: sevenDays,
        automaticCleanup: false
      })
    }

    await expect(
      owner.delete(
        {
          category: 'ocr-screenshot-temp',
          mode: 'retention',
          policy: { enabled: true, retentionMs: null },
          nowMs: NOW_MS
        },
        new AbortController().signal
      )
    ).resolves.toMatchObject({ ok: true, code: 'PRIVACY_OWNER_DISABLED' })
    for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
      expect(temp.getNamespaceConfig(namespace)).toMatchObject({
        retentionMs: null,
        automaticCleanup: false
      })
    }
  })

  it('stops before the next OCR page after cancellation without rolling back the committed aggregate', async () => {
    const { client, directory } = await createPrivacyTestClient('ocr-cancel')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql',
      '0008_damp_living_mummy.sql'
    ])
    const temp = new TempFileService({ baseDir: join(directory, 'temp') })
    const controller = new AbortController()
    const scheduleWriteCalls = vi.fn()
    const scheduleWrite: PrivacyOwnerWriteScheduler = async (label, operation) => {
      scheduleWriteCalls(label, operation)
      const result = await operation()
      controller.abort()
      return result
    }
    const owner = createOcrScreenshotRetentionOwner({
      client,
      tempFileService: temp,
      limits: { batchSize: 1, maxRows: 10 },
      scheduleWrite
    })
    for (let index = 0; index < 3; index += 1) {
      await seedOcrJob(client, {
        status: 'failed',
        queuedAt: CUTOFF_SECONDS - 20 + index,
        finishedAt: CUTOFF_SECONDS - 10 + index,
        suffix: `CANCEL_${index}`
      })
    }

    const result = await owner.delete(retentionRequest(), controller.signal)
    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      cancelled: true,
      deletedItemCount: 1,
      batches: 1,
      partial: true
    })
    expect(scheduleWriteCalls).toHaveBeenCalledOnce()
    expect(await countRows(client, 'ocr_jobs')).toBe(2)
    expect(await countRows(client, 'ocr_results')).toBe(2)
    expect(JSON.stringify(result)).not.toContain('CANARY_')
  })

  it('reports a retryable limit when the OCR row budget is exhausted exactly', async () => {
    const { client, directory } = await createPrivacyTestClient('ocr-row-limit')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql',
      '0008_damp_living_mummy.sql'
    ])
    const owner = createOcrScreenshotRetentionOwner({
      client,
      tempFileService: new TempFileService({ baseDir: join(directory, 'temp') }),
      limits: { batchSize: 1, maxRows: 1 }
    })
    for (let index = 0; index < 2; index += 1) {
      await seedOcrJob(client, {
        status: 'failed',
        queuedAt: CUTOFF_SECONDS - 20 + index,
        finishedAt: CUTOFF_SECONDS - 10 + index,
        suffix: `LIMIT_${index}`
      })
    }

    const result = await owner.delete(retentionRequest(), new AbortController().signal)

    expect(result).toMatchObject({
      ok: false,
      code: 'PRIVACY_OWNER_LIMIT_REACHED',
      retryable: true,
      deletedItemCount: 1
    })
    expect(await countRows(client, 'ocr_jobs')).toBe(1)
  })

  it('eagerly releases only owner-issued artifacts and retains scheduled cleanup as fallback', async () => {
    const { client, directory } = await createPrivacyTestClient('ocr-eager-release')
    await applyPrivacyMigrations(client, [
      '0002_eager_the_executioner.sql',
      '0004_outstanding_forgotten_one.sql',
      '0008_damp_living_mummy.sql'
    ])
    const tempBase = join(directory, 'temp')
    await mkdir(tempBase, { recursive: true })
    const temp = new TempFileService({ baseDir: tempBase })
    temp.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    const owner = createOcrScreenshotRetentionOwner({ client, tempFileService: temp })

    const eager = await temp.createFile({
      namespace: OCR_INTERMEDIATE_TEMP_NAMESPACE,
      text: 'CANARY_EAGER_TEMP'
    })
    const clipboard = await temp.createFile({
      namespace: CLIPBOARD_IMAGE_NAMESPACE,
      text: 'CANARY_CLIPBOARD_TEMP'
    })
    const external = join(directory, 'external-user-source.png')
    await writeFile(external, 'CANARY_EXTERNAL_SOURCE')

    expect(await releaseOcrScreenshotTempArtifact(temp, eager.path)).toBe(true)
    expect(await exists(eager.path)).toBe(false)
    expect(await releaseOcrScreenshotTempArtifact(temp, clipboard.path)).toBe(false)
    expect(await releaseOcrScreenshotTempArtifact(temp, external)).toBe(false)
    expect(await exists(clipboard.path)).toBe(true)
    expect(await exists(external)).toBe(true)

    const fallback = await temp.createFile({
      namespace: SCREENSHOT_TEMP_NAMESPACE,
      text: 'CANARY_FALLBACK_TEMP'
    })
    await utimes(fallback.path, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    const [result] = await owner.applyRetention(
      DEFAULT_PRIVACY_RETENTION_POLICY,
      NOW_MS,
      new AbortController().signal
    )
    expect(result).toMatchObject({ ok: true, deletedItemCount: 1 })
    expect(await exists(fallback.path)).toBe(false)
    expect(await exists(clipboard.path)).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/CANARY_|external-user-source|NATIVE_ERROR/i)
  })
})
