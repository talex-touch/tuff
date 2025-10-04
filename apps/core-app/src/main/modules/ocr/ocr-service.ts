import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'

import type { IClipboardItem } from '../clipboard'
import { databaseModule } from '../database'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { genTouchChannel } from '../../core/channel-core'
import { windowManager } from '../box-tool/core-box/window'
import {
  ocrJobs,
  ocrResults,
  clipboardHistoryMeta,
  clipboardHistory,
  config
} from '../../db/schema'
import * as schema from '../../db/schema'
import { LibSQLDatabase } from 'drizzle-orm/libsql'
import { desc, eq } from 'drizzle-orm'

export interface ClipboardOcrPayload {
  clipboardId: number
  item: IClipboardItem
  formats: string[]
}

interface WorkerRequestPayload {
  jobId: number
  clipboardId: number | null
  payloadHash: string | null
  source: {
    type: 'data-url' | 'file'
    dataUrl?: string
    filePath?: string
  }
  options: {
    language: string
    tesseditPagesegMode?: number
    config?: Record<string, string | number | boolean>
  }
}

interface WorkerSuccessMessage {
  status: 'success'
  jobId: number
  text: string
  confidence: number
  language: string
  extra?: Record<string, unknown>
}

interface WorkerErrorMessage {
  status: 'error'
  jobId: number
  error: string
  details?: unknown
}

type WorkerResponseMessage = WorkerSuccessMessage | WorkerErrorMessage

const PROCESS_INTERVAL_SECONDS = 5
const MAX_ATTEMPTS = 3
const WORKER_CONCURRENCY = 1

function dataUrlToHash(dataUrl: string): string {
  return createHash('sha256').update(dataUrl).digest('hex')
}

function fileHashKey(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex')
}

class OcrService {
  private initialized = false
  private db: LibSQLDatabase<typeof schema> | null = null
  private pollTaskId = 'ocr-service:dispatcher'
  private processing = false
  private activeWorkers = new Map<number, Worker>()
  private clipboardMetaListener:
    | ((clipboardId: number, patch: Record<string, unknown>) => void)
    | null = null

  private ensureInitialized(): void {
    if (this.initialized) return

    this.db = databaseModule.getDb()

    pollingService.register(
      this.pollTaskId,
      () =>
        this.processQueue().catch((error) => {
          console.error('[OCR] Failed to process queue:', error)
        }),
      {
        interval: PROCESS_INTERVAL_SECONDS,
        unit: 'seconds',
        runImmediately: true
      }
    )

    this.initialized = true
  }

  async start(): Promise<void> {
    this.ensureInitialized()
    await this.processQueue()
  }

  registerClipboardMetaListener(
    listener: (clipboardId: number, patch: Record<string, unknown>) => void
  ): void {
    this.clipboardMetaListener = listener
  }

  async enqueueFromClipboard(payload: ClipboardOcrPayload): Promise<void> {
    this.ensureInitialized()
    if (!this.db) return

    const jobInput = await this.buildJobPayload(payload)
    if (!jobInput) {
      return
    }

    const { clipboardId, source, options, payloadHash } = jobInput

    const existing = await this.db
      .select()
      .from(ocrJobs)
      .where(eq(ocrJobs.clipboardId, clipboardId))
      .orderBy(desc(ocrJobs.id))
      .limit(1)

    if (existing.length > 0) {
      const job = existing[0]
      if (job.status === 'pending' || job.status === 'processing') {
        return
      }
      if (job.status === 'completed' && job.payloadHash === payloadHash) {
        return
      }
    }

    await this.db.insert(ocrJobs).values({
      clipboardId,
      status: 'pending',
      attempts: 0,
      payloadHash: payloadHash ?? null,
      meta: JSON.stringify({
        source,
        options
      })
    })

    const initialMeta: Record<string, unknown> = {
      ocr_status: 'pending',
      ocr_source_type: source.type,
      ocr_payload_hash: payloadHash
    }

    if (source.type === 'file' && source.filePath) {
      initialMeta.ocr_source_file = source.filePath
    }

    await this.updateClipboardMeta(clipboardId, initialMeta)

    await this.upsertConfig('ocr:last-queued', {
      clipboardId,
      payloadHash,
      at: new Date().toISOString()
    })

    await this.processQueue()
  }

  private async buildJobPayload(payload: ClipboardOcrPayload): Promise<{
    clipboardId: number
    source: WorkerRequestPayload['source']
    options: WorkerRequestPayload['options']
    payloadHash: string | null
  } | null> {
    const { clipboardId, item } = payload

    if (!clipboardId) return null

    if (item.meta && typeof item.meta === 'object') {
      const status = (item.meta as Record<string, unknown>)['ocr_status']
      if (status === 'done') {
        return null
      }
    }

    if (item.type === 'text') {
      return null
    }

    if (item.type === 'image') {
      if (!item.content) return null
      return {
        clipboardId,
        source: {
          type: 'data-url',
          dataUrl: item.content
        },
        options: {
          language: 'eng'
        },
        payloadHash: dataUrlToHash(item.content)
      }
    }

    if (item.type === 'files') {
      try {
        const files = JSON.parse(item.content) as string[]
        const imagePath = files.find((file) => this.isImageFile(file))
        if (!imagePath || !existsSync(imagePath)) {
          return null
        }

        return {
          clipboardId,
          source: {
            type: 'file',
            filePath: imagePath
          },
          options: {
            language: 'eng'
          },
          payloadHash: fileHashKey(imagePath)
        }
      } catch {
        return null
      }
    }

    return null
  }

  private isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.heic'].includes(ext)
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    if (!this.db) return

    this.processing = true
    try {
      while (this.activeWorkers.size < WORKER_CONCURRENCY) {
        const pending = await this.db
          .select()
          .from(ocrJobs)
          .where(eq(ocrJobs.status, 'pending'))
          .orderBy(desc(ocrJobs.priority), ocrJobs.queuedAt)
          .limit(1)

        if (pending.length === 0) {
          break
        }

        const job = pending[0]

        const attemptCount = (job.attempts ?? 0) + 1

        await this.db
          .update(ocrJobs)
          .set({
            status: 'processing',
            attempts: attemptCount,
            startedAt: new Date()
          })
          .where(eq(ocrJobs.id, job.id))

        job.attempts = attemptCount

        await this.upsertConfig('ocr:last-dispatch', {
          jobId: job.id,
          clipboardId: job.clipboardId,
          attempts: attemptCount,
          at: new Date().toISOString()
        })

        await this.startWorker(job.id!, job)
      }
    } finally {
      this.processing = false
    }
  }

  private async startWorker(jobId: number, job: typeof ocrJobs.$inferSelect): Promise<void> {
    if (!job.meta) {
      await this.failJob(jobId, 'Missing job metadata')
      return
    }

    let parsed: { source: WorkerRequestPayload['source']; options: WorkerRequestPayload['options'] }
    try {
      parsed = JSON.parse(job.meta)
    } catch (error) {
      await this.failJob(jobId, 'Invalid job metadata JSON', error)
      return
    }

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'processing'
      })
    }

    const workerScript = new URL('./ocr-worker.ts', import.meta.url)
    const worker = new Worker(workerScript, {
      workerData: {
        jobId,
        clipboardId: job.clipboardId ?? null,
        payloadHash: job.payloadHash ?? null,
        source: parsed.source,
        options: parsed.options
      }
    })

    this.activeWorkers.set(jobId, worker)

    worker.on('message', (message: WorkerResponseMessage) => {
      if (message.status === 'success') {
        this.handleWorkerSuccess(message).catch((error) => {
          console.error('[OCR] Failed to handle success message:', error)
        })
      } else {
        this.handleWorkerErrorResponse(message).catch((error) => {
          console.error('[OCR] Failed to handle error message:', error)
        })
      }
    })

    worker.on('error', (error) => {
      console.error('[OCR] Worker crashed:', error)
      this.failJob(jobId, 'Worker crashed', error).catch((err) => {
        console.error('[OCR] Failed to mark job failed after worker crash:', err)
      })
    })

    worker.on('exit', () => {
      this.activeWorkers.delete(jobId)
      setImmediate(() => {
        this.processQueue().catch((error) => console.error('[OCR] Queue resume error:', error))
      })
    })
  }

  private async handleWorkerSuccess(message: WorkerSuccessMessage): Promise<void> {
    if (!this.db) return

    const { jobId, text, confidence, language, extra } = message

    const jobs = await this.db.select().from(ocrJobs).where(eq(ocrJobs.id, jobId)).limit(1)

    if (jobs.length === 0) return

    const job = jobs[0]

    await this.db.insert(ocrResults).values({
      jobId,
      text,
      confidence,
      language,
      checksum: job.payloadHash ?? null,
      extra: extra ? JSON.stringify(extra) : null
    })

    await this.db
      .update(ocrJobs)
      .set({ status: 'completed', finishedAt: new Date(), lastError: null })
      .where(eq(ocrJobs.id, jobId))

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'done',
        ocr_text: text,
        ocr_confidence: confidence,
        ocr_language: language,
        ocr_checksum: job.payloadHash,
        ocr_job_id: jobId,
        ocr_excerpt: text.length > 280 ? `${text.slice(0, 277)}...` : text,
        ocr_last_error: null,
        ocr_retry_count: job.attempts ?? 0
      })
      await this.upsertConfig('ocr:last-success', {
        jobId,
        clipboardId: job.clipboardId,
        confidence,
        language,
        at: new Date().toISOString()
      })
    }
  }

  private async handleWorkerErrorResponse(message: WorkerErrorMessage): Promise<void> {
    await this.failJob(message.jobId, message.error, message.details)
  }

  private async failJob(jobId: number, reason: string, details?: unknown): Promise<void> {
    if (!this.db) return

    const jobs = await this.db.select().from(ocrJobs).where(eq(ocrJobs.id, jobId)).limit(1)

    if (jobs.length === 0) return

    const job = jobs[0]
    const attempts = job.attempts ?? 0
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'

    await this.db
      .update(ocrJobs)
      .set({
        status,
        lastError: reason,
        finishedAt: status === 'failed' ? new Date() : null
      })
      .where(eq(ocrJobs.id, jobId))

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: status === 'failed' ? 'failed' : 'retrying',
        ocr_last_error: reason,
        ocr_job_id: jobId,
        ocr_retry_count: attempts
      })

      if (status === 'failed') {
        await this.upsertConfig('ocr:last-failure', {
          jobId,
          clipboardId: job.clipboardId,
          reason,
          at: new Date().toISOString()
        })
      }
    }

    if (status === 'failed') {
      console.warn(`[OCR] Job ${jobId} failed permanently: ${reason}`)
      if (details) {
        console.warn('[OCR] Failure details:', details)
      }
    } else {
      setImmediate(() => {
        this.processQueue().catch((error) => console.error('[OCR] Queue resume error:', error))
      })
    }
  }

  private async updateClipboardMeta(
    clipboardId: number,
    entries: Record<string, unknown>
  ): Promise<void> {
    if (!this.db) return

    const patch: Record<string, unknown> = { ...entries }
    if (!Object.prototype.hasOwnProperty.call(patch, 'ocr_updated_at')) {
      patch.ocr_updated_at = new Date().toISOString()
    }

    const insertValues = Object.entries(patch).map(([key, value]) => ({
      clipboardId,
      key,
      value: JSON.stringify(value ?? null)
    }))

    if (insertValues.length > 0) {
      await this.db.insert(clipboardHistoryMeta).values(insertValues)
    }

    const existing = await this.db
      .select({ metadata: clipboardHistory.metadata })
      .from(clipboardHistory)
      .where(eq(clipboardHistory.id, clipboardId))
      .limit(1)

    if (existing.length > 0) {
      let base: Record<string, unknown> = {}
      if (existing[0].metadata) {
        try {
          base = JSON.parse(existing[0].metadata)
        } catch {
          base = {}
        }
      }

      const merged = { ...base, ...patch }
      await this.db
        .update(clipboardHistory)
        .set({ metadata: JSON.stringify(merged) })
        .where(eq(clipboardHistory.id, clipboardId))
    }

    this.broadcastMetaUpdate(clipboardId, patch)
    this.clipboardMetaListener?.(clipboardId, patch)
  }

  private broadcastMetaUpdate(clipboardId: number, patch: Record<string, unknown>): void {
    const touchChannel = genTouchChannel()
    for (const win of windowManager.windows) {
      if (!win.window.isDestroyed()) {
        touchChannel.sendToMain(win.window, 'clipboard:meta-updated', {
          clipboardId,
          patch
        })
      }
    }

    const activePlugin = windowManager.getAttachedPlugin()
    if (activePlugin?._uniqueChannelKey) {
      touchChannel
        .sendToPlugin(activePlugin.name, 'core-box:clipboard-meta-updated', {
          clipboardId,
          patch
        })
        .catch((error) => {
          console.warn('[OCR] Failed to notify plugin about meta update:', error)
        })
    }
  }

  private async upsertConfig(key: string, value: unknown): Promise<void> {
    if (!this.db) return
    const serialized = JSON.stringify(value ?? null)
    await this.db
      .insert(config)
      .values({ key, value: serialized })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: serialized }
      })
  }
}

export const ocrService = new OcrService()
