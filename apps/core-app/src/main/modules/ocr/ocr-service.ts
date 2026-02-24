import type {
  IntelligenceInvokeResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { IClipboardItem } from '../clipboard'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { and, desc, eq, inArray, isNull, lte, lt, or, sql } from 'drizzle-orm'
import { genTouchApp } from '../../core'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import {
  clipboardHistory,
  clipboardHistoryMeta,
  config,
  ocrJobs,
  ocrResults
} from '../../db/schema'
import { withSqliteRetry } from '../../db/sqlite-retry'
import {
  INTERNAL_SYSTEM_OCR_PROVIDER_ID,
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  getCapabilityPrompt
} from '../ai/intelligence-config'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { windowManager } from '../box-tool/core-box/window'
import { databaseModule } from '../database'
import { notificationModule } from '../notification'

export interface ClipboardOcrPayload {
  clipboardId: number
  item: IClipboardItem
  formats: string[]
}

interface AgentJobPayload {
  jobId: number
  clipboardId: number | null
  payloadHash: string | null
  source: {
    type: 'data-url' | 'file' | 'clipboard'
    dataUrl?: string
    filePath?: string
  }
  options: {
    language: string
    tesseditPagesegMode?: number
    config?: Record<string, string | number | boolean>
    prompt?: string
  }
}

const PROCESS_INTERVAL_SECONDS = 5
const MAX_ATTEMPTS = 3
const coreBoxClipboardMetaUpdatedEvent = defineRawEvent<
  {
    clipboardId: number
    patch: Record<string, unknown>
  },
  void
>('core-box:clipboard-meta-updated')
const ocrDashboardEvent = defineRawEvent<
  { limit?: number },
  {
    ok: boolean
    snapshot?: unknown
    error?: string
  }
>('ocr:dashboard')
const WORKER_CONCURRENCY = 1

const MAX_OCR_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_OCR_RESULT_RAW_CHARS = 2000
const MAX_OCR_META_TEXT_CHARS = 8000
const MAX_OCR_BLOCKS = 120
const MAX_OCR_TEXT_CHARS = 200_000
const MAX_EMBEDDING_INPUT_CHARS = 8000
const OCR_FAILURE_THRESHOLD = 5
const OCR_FAILURE_WINDOW_MS = 10 * 60 * 1000
const OCR_QUEUE_DISABLE_BASE_MS = 30 * 60 * 1000
const OCR_QUEUE_DISABLE_MAX_MS = 12 * 60 * 60 * 1000
const OCR_QUEUE_DISABLE_ESCALATE_WINDOW_MS = 24 * 60 * 60 * 1000

// 重试延迟配置(秒)
const RETRY_DELAYS: Record<string, number> = {
  'No enabled providers available': 3600, // 1小时
  'Provider factory missing': 1800, // 30分钟
  'Native OCR module unavailable': 3600, // 1小时
  'OCR provider network failure': 300, // 5分钟
  default: 120 // 默认2分钟
}
const getRetryDelaySeconds = (lastError: string | null | undefined): number => {
  if (!lastError) return RETRY_DELAYS.default
  const delay = RETRY_DELAYS[lastError]
  return typeof delay === 'number' ? delay : RETRY_DELAYS.default
}

function dataUrlToHash(dataUrl: string): string {
  return createHash('sha256').update(dataUrl).digest('hex')
}

function fileHashKey(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex')
}

function estimateDataUrlBytes(dataUrl: string): number {
  const prefixIndex = dataUrl.indexOf(',')
  if (prefixIndex === -1) {
    return Buffer.byteLength(dataUrl)
  }
  const prefix = dataUrl.slice(0, prefixIndex)
  const payload = dataUrl.slice(prefixIndex + 1)
  if (prefix.includes(';base64')) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
  }
  return Buffer.byteLength(payload)
}

function safeJsonStringify(value: unknown, maxChars: number): string {
  try {
    const seen = new WeakSet<object>()
    const raw = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]'
        }
        seen.add(val)
      }
      return val
    })
    if (typeof raw !== 'string') {
      return ''
    }
    return raw.length > maxChars ? `${raw.slice(0, Math.max(0, maxChars - 3))}...` : raw
  } catch {
    const fallback = String(value)
    return fallback.length > maxChars
      ? `${fallback.slice(0, Math.max(0, maxChars - 3))}...`
      : fallback
  }
}

class OcrService {
  private initialized = false
  private db: LibSQLDatabase<typeof schema> | null = null
  private pollTaskId = 'ocr-service:dispatcher'
  private processing = false
  private activeJobs = new Map<number, Promise<void>>()
  private queueDisabledUntil: number | null = null
  private queueDisableReason: string | null = null
  private queueDisableStrike = 0
  private lastQueueDisabledAt: number | null = null
  private consecutiveFailureCount = 0
  private recentFailureTimestamps: number[] = []
  private clipboardMetaListener:
    | ((clipboardId: number, patch: Record<string, unknown>) => void)
    | null = null

  private channelRegistered = false

  private ensureInitialized(): void {
    if (this.initialized) return

    this.db = databaseModule.getDb()

    this.registerChannels()
    ensureIntelligenceConfigLoaded()

    pollingService.register(this.pollTaskId, () => this.processQueue().catch(() => {}), {
      interval: PROCESS_INTERVAL_SECONDS,
      unit: 'seconds',
      initialDelayMs: 3_000
    })

    this.initialized = true
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }

  private registerChannels(): void {
    if (this.channelRegistered) {
      return
    }

    const channel = genTouchApp().channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)

    transport.on(ocrDashboardEvent, async (payload) => {
      try {
        const limit = typeof payload?.limit === 'number' && payload.limit > 0 ? payload.limit : 50
        const snapshot = await this.getDashboardSnapshot(limit)
        return {
          ok: true,
          snapshot
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })

    this.channelRegistered = true
  }

  public async getDashboardSnapshot(limit = 50) {
    this.ensureInitialized()
    return this.buildDashboardSnapshot(limit)
  }

  private async buildDashboardSnapshot(limit: number) {
    if (!this.db) {
      return {
        jobs: [],
        stats: {
          total: 0,
          byStatus: {},
          lastQueued: null,
          lastDispatch: null,
          lastSuccess: null,
          lastFailure: null
        },
        indexes: {
          fileSources: [],
          dataUrlSourceCount: 0,
          clipboardIds: [],
          payloadHashes: []
        }
      }
    }

    const jobs = await this.db.select().from(ocrJobs).orderBy(desc(ocrJobs.queuedAt)).limit(limit)

    const jobIds = jobs.map((job) => job.id).filter((id): id is number => typeof id === 'number')

    const resultsMap = new Map<number, typeof ocrResults.$inferSelect | null>()

    if (jobIds.length > 0) {
      const results = await this.db
        .select()
        .from(ocrResults)
        .where(inArray(ocrResults.jobId, jobIds))

      for (const result of results) {
        resultsMap.set(result.jobId, result)
      }
    }

    const statusCounts = await this.db
      .select({
        status: ocrJobs.status,
        count: sql<number>`COUNT(*)`
      })
      .from(ocrJobs)
      .groupBy(ocrJobs.status)

    const statusMap: Record<string, number> = {}
    let total = 0
    for (const row of statusCounts) {
      if (row.status) {
        statusMap[row.status] = Number(row.count ?? 0)
        total += Number(row.count ?? 0)
      }
    }

    const configKeys = [
      'ocr:last-queued',
      'ocr:last-dispatch',
      'ocr:last-success',
      'ocr:last-failure',
      'ocr:queue-disabled'
    ]

    const configRows = await this.db.select().from(config).where(inArray(config.key, configKeys))

    const configMap: Record<string, unknown> = {}
    for (const row of configRows) {
      if (!row.key) continue
      try {
        configMap[row.key] = row.value ? JSON.parse(row.value) : null
      } catch {
        configMap[row.key] = row.value
      }
    }

    const fileSources = new Set<string>()
    const payloadHashes = new Set<string>()
    const clipboardIds = new Set<number>()
    let dataUrlSourceCount = 0

    const toIsoString = (value: unknown): string | null => {
      if (!value) return null
      if (value instanceof Date) return value.toISOString()
      if (typeof value === 'number') {
        // drizzle timestamp mode returns seconds since epoch by default
        return new Date(value * 1000).toISOString()
      }
      return null
    }

    const enrichedJobs = jobs.map((job) => {
      let parsedMeta: Record<string, unknown> | null = null
      if (job.meta) {
        try {
          parsedMeta = JSON.parse(job.meta)
        } catch {
          parsedMeta = null
        }
      }

      const rawSource = parsedMeta?.source as Record<string, unknown> | undefined
      const options = parsedMeta?.options

      const source = (() => {
        if (!rawSource || typeof rawSource !== 'object') {
          return null
        }
        const type = typeof rawSource.type === 'string' ? rawSource.type : null
        if (type === 'file') {
          const filePath = typeof rawSource.filePath === 'string' ? rawSource.filePath : null
          return { type: 'file', filePath }
        }
        if (type === 'data-url') {
          const dataUrl = typeof rawSource.dataUrl === 'string' ? rawSource.dataUrl : ''
          return {
            type: 'data-url',
            dataUrlLength: dataUrl.length,
            dataUrlPreview: dataUrl.length > 0 ? `${dataUrl.slice(0, 64)}…` : null
          }
        }
        return null
      })()

      if (
        source?.type === 'file' &&
        typeof source.filePath === 'string' &&
        source.filePath.length > 0
      ) {
        fileSources.add(source.filePath)
      } else if (source?.type === 'data-url') {
        dataUrlSourceCount += 1
      }

      if (typeof job.payloadHash === 'string' && job.payloadHash.length > 0) {
        payloadHashes.add(job.payloadHash)
      }

      if (typeof job.clipboardId === 'number') {
        clipboardIds.add(job.clipboardId)
      }

      const result = job.id ? (resultsMap.get(job.id) ?? null) : null

      return {
        id: job.id,
        clipboardId: job.clipboardId,
        status: job.status,
        attempts: job.attempts,
        priority: job.priority,
        lastError: job.lastError,
        payloadHash: job.payloadHash,
        queuedAt: toIsoString(job.queuedAt),
        startedAt: toIsoString(job.startedAt),
        finishedAt: toIsoString(job.finishedAt),
        source,
        options,
        result: result
          ? {
              id: result.id,
              textSnippet: result.text?.slice(0, 280) ?? '',
              confidence: result.confidence,
              language: result.language,
              createdAt: toIsoString(result.createdAt)
            }
          : null
      }
    })

    return {
      jobs: enrichedJobs,
      stats: {
        total,
        byStatus: statusMap,
        lastQueued: configMap['ocr:last-queued'] ?? null,
        lastDispatch: configMap['ocr:last-dispatch'] ?? null,
        lastSuccess: configMap['ocr:last-success'] ?? null,
        lastFailure: configMap['ocr:last-failure'] ?? null,
        queueDisabled: configMap['ocr:queue-disabled'] ?? null
      },
      indexes: {
        fileSources: Array.from(fileSources),
        dataUrlSourceCount,
        clipboardIds: Array.from(clipboardIds),
        payloadHashes: Array.from(payloadHashes)
      }
    }
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

    if (await this.isQueueDisabled()) {
      await this.updateClipboardMeta(payload.clipboardId, {
        ocr_status: 'paused',
        ocr_last_error: this.queueDisableReason ?? 'OCR queue auto-disabled',
        ocr_queue_disabled_until: this.queueDisabledUntil
          ? new Date(this.queueDisabledUntil).toISOString()
          : null
      })
      return
    }

    let jobInput: Awaited<ReturnType<typeof this.buildJobPayload>>
    try {
      jobInput = await this.buildJobPayload(payload)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.updateClipboardMeta(payload.clipboardId, {
        ocr_status: 'failed',
        ocr_last_error: reason
      })
      return
    }
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

    await this.withDbWrite('ocr.jobs.enqueue', () =>
      this.db!.insert(ocrJobs).values({
        clipboardId,
        status: 'pending',
        attempts: 0,
        payloadHash: payloadHash ?? null,
        meta: JSON.stringify({
          source,
          options
        })
      })
    )

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
    source: AgentJobPayload['source']
    options: AgentJobPayload['options']
    payloadHash: string | null
  } | null> {
    const { clipboardId, item } = payload

    if (!clipboardId) return null

    if (item.meta && typeof item.meta === 'object') {
      const status = (item.meta as Record<string, unknown>).ocr_status
      if (status === 'done') {
        return null
      }
    }

    if (item.type === 'text') {
      return null
    }

    if (item.type === 'image') {
      if (!item.content) return null

      const estimatedBytes = estimateDataUrlBytes(item.content)
      if (estimatedBytes > MAX_OCR_IMAGE_BYTES) {
        throw new Error(`[OCR] Image payload too large: ${estimatedBytes} > ${MAX_OCR_IMAGE_BYTES}`)
      }
      return {
        clipboardId,
        source: {
          type: 'clipboard'
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

        const stats = await stat(imagePath)
        if (stats.size > MAX_OCR_IMAGE_BYTES) {
          throw new Error(`[OCR] Image file too large: ${stats.size} > ${MAX_OCR_IMAGE_BYTES}`)
        }

        return {
          clipboardId,
          source: {
            type: 'clipboard'
          },
          options: {
            language: 'eng'
          },
          payloadHash: fileHashKey(imagePath)
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('[OCR]')) {
          throw error
        }
        return null
      }
    }

    return null
  }

  private isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.heic'].includes(ext)
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      case '.tiff':
        return 'image/tiff'
      case '.heic':
        return 'image/heic'
      default:
        return 'image/png'
    }
  }

  private async normalizeSourceForAgent(
    source: AgentJobPayload['source'],
    clipboardId: number | null
  ): Promise<IntelligenceVisionOcrPayload['source']> {
    if (source.type === 'data-url' && source.dataUrl) {
      const estimatedBytes = estimateDataUrlBytes(source.dataUrl)
      if (estimatedBytes > MAX_OCR_IMAGE_BYTES) {
        throw new Error(`[OCR] Image payload too large: ${estimatedBytes} > ${MAX_OCR_IMAGE_BYTES}`)
      }
      return { type: 'data-url', dataUrl: source.dataUrl }
    }

    if (source.type === 'clipboard') {
      if (!clipboardId) {
        throw new Error('[OCR] Missing clipboardId for clipboard source')
      }
      if (!this.db) {
        throw new Error('[OCR] Database not initialized')
      }

      const rows = await this.db
        .select({ type: clipboardHistory.type, content: clipboardHistory.content })
        .from(clipboardHistory)
        .where(eq(clipboardHistory.id, clipboardId))
        .limit(1)

      if (rows.length === 0) {
        throw new Error('[OCR] Clipboard record not found')
      }

      const record = rows[0]
      if (record.type === 'image') {
        const estimatedBytes = estimateDataUrlBytes(record.content)
        if (estimatedBytes > MAX_OCR_IMAGE_BYTES) {
          throw new Error(
            `[OCR] Image payload too large: ${estimatedBytes} > ${MAX_OCR_IMAGE_BYTES}`
          )
        }
        return { type: 'data-url', dataUrl: record.content }
      }

      if (record.type === 'files') {
        let files: string[]
        try {
          files = JSON.parse(record.content) as string[]
        } catch {
          throw new Error('[OCR] Invalid clipboard file list payload')
        }
        const imagePath = files.find((file) => this.isImageFile(file))
        if (!imagePath || !existsSync(imagePath)) {
          throw new Error('[OCR] No image file found for clipboard payload')
        }
        const stats = await stat(imagePath)
        if (stats.size > MAX_OCR_IMAGE_BYTES) {
          throw new Error(`[OCR] Image file too large: ${stats.size} > ${MAX_OCR_IMAGE_BYTES}`)
        }
        const buffer = await readFile(imagePath)
        const mime = this.detectMimeType(imagePath)
        return {
          type: 'data-url',
          dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
        }
      }

      throw new Error('[OCR] Clipboard payload type not supported for OCR')
    }

    if (source.type === 'file' && source.filePath) {
      const stats = await stat(source.filePath)
      if (stats.size > MAX_OCR_IMAGE_BYTES) {
        throw new Error(`[OCR] Image file too large: ${stats.size} > ${MAX_OCR_IMAGE_BYTES}`)
      }
      const buffer = await readFile(source.filePath)
      const mime = this.detectMimeType(source.filePath)
      return {
        type: 'data-url',
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
      }
    }

    throw new Error('[OCR] Unsupported source payload for agent invocation')
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    if (!this.db) return
    if (await this.isQueueDisabled()) return

    this.processing = true
    try {
      while (this.activeJobs.size < WORKER_CONCURRENCY) {
        if (await this.isQueueDisabled()) {
          break
        }

        const now = new Date()
        const readyJobs = await this.db
          .select()
          .from(ocrJobs)
          .where(
            and(
              eq(ocrJobs.status, 'pending'),
              lt(ocrJobs.attempts, MAX_ATTEMPTS),
              or(isNull(ocrJobs.nextRetryAt), lte(ocrJobs.nextRetryAt, now))
            )
          )
          .orderBy(desc(ocrJobs.priority), ocrJobs.queuedAt)
          .limit(1)

        if (readyJobs.length === 0) {
          break
        }

        const job = readyJobs[0]

        const attemptCount = (job.attempts ?? 0) + 1

        await this.withDbWrite('ocr.jobs.start', () =>
          this.db!.update(ocrJobs)
            .set({
              status: 'processing',
              attempts: attemptCount,
              startedAt: new Date(),
              lastError: null,
              nextRetryAt: null
            })
            .where(eq(ocrJobs.id, job.id!))
        )

        job.attempts = attemptCount

        await this.upsertConfig('ocr:last-dispatch', {
          jobId: job.id,
          clipboardId: job.clipboardId,
          attempts: attemptCount,
          at: new Date().toISOString()
        })

        const task = this.runAgentJob(job.id!, job).finally(() => {
          this.activeJobs.delete(job.id!)
          setImmediate(() => {
            this.processQueue().catch(() => {})
          })
        })

        this.activeJobs.set(job.id!, task)
      }
    } finally {
      this.processing = false
    }
  }

  private async runAgentJob(jobId: number, job: typeof ocrJobs.$inferSelect): Promise<void> {
    if (!job.meta) {
      await this.failJob(jobId, 'Missing job metadata')
      return
    }

    let parsed: { source: AgentJobPayload['source']; options: AgentJobPayload['options'] }
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

    ensureIntelligenceConfigLoaded()

    const capabilityOptions = getCapabilityOptions('vision.ocr')
    const normalizedSource = await this.normalizeSourceForAgent(
      parsed.source,
      job.clipboardId ?? null
    )
    const payload: IntelligenceVisionOcrPayload = {
      source: normalizedSource,
      language: parsed.options?.language,
      prompt: this.buildAgentPrompt(parsed),
      includeLayout: true,
      includeKeywords: true,
      metadata: {
        jobId,
        clipboardId: job.clipboardId,
        payloadHash: job.payloadHash
      }
    }

    const allowedProviderIds = [
      INTERNAL_SYSTEM_OCR_PROVIDER_ID,
      ...(capabilityOptions.allowedProviderIds ?? [])
    ].filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)

    const modelPreference = ['system-ocr', ...(capabilityOptions.modelPreference ?? [])].filter(
      (model, index, all) => Boolean(model) && all.indexOf(model) === index
    )

    try {
      const invocation = await tuffIntelligence.invoke<IntelligenceVisionOcrResult>(
        'vision.ocr',
        payload,
        {
          modelPreference,
          allowedProviderIds
        }
      )
      await this.persistAgentSuccess(job, invocation)
    } catch (error) {
      const retryReason = this.classifyRetryableAgentError(error)
      if (retryReason) {
        await this.deferJob(job, retryReason)
        return
      }
      await this.failJob(jobId, error instanceof Error ? error.message : String(error), error)
    }
  }

  private classifyRetryableAgentError(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No enabled providers')) {
      return 'No enabled providers available'
    }
    if (message.includes('No provider factory')) {
      return 'Provider factory missing'
    }
    if (
      message.includes('native-module-not-loaded') ||
      message.includes('Native OCR unavailable')
    ) {
      return 'Native OCR module unavailable'
    }
    if (message.includes('fetch failed')) {
      return 'OCR provider network failure'
    }
    return null
  }

  private async deferJob(job: typeof ocrJobs.$inferSelect, reason: string): Promise<void> {
    if (!this.db || !job.id) return

    const currentAttempts = job.attempts ?? 0

    // 检查是否已达到最大重试次数
    if (currentAttempts >= MAX_ATTEMPTS) {
      await this.failJob(job.id, `Max attempts reached: ${reason}`)
      return
    }

    const retryDelaySeconds = getRetryDelaySeconds(reason)
    const nextRetryAt = new Date(Date.now() + retryDelaySeconds * 1000)

    await this.withDbWrite('ocr.jobs.retry', () =>
      this.db!.update(ocrJobs)
        .set({
          status: 'pending',
          lastError: reason,
          nextRetryAt,
          finishedAt: null
        })
        .where(eq(ocrJobs.id, job.id!))
    )

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'pending',
        ocr_last_error: reason,
        ocr_retry_count: currentAttempts,
        ocr_retry_after_seconds: retryDelaySeconds,
        ocr_next_retry_at: nextRetryAt.toISOString()
      })
    }

    await this.recordJobFailure(reason)
  }

  private buildAgentPrompt(payload: { options?: AgentJobPayload['options'] }): string {
    const capabilityPrompt = getCapabilityPrompt('vision.ocr')
    if (payload.options?.config && typeof payload.options.config.prompt === 'string') {
      return payload.options.config.prompt
    }
    if (typeof payload.options?.prompt === 'string') {
      return payload.options.prompt
    }
    if (capabilityPrompt) {
      return capabilityPrompt
    }
    return [
      '你是一名多语言 OCR 专家：',
      '1. 识别图片中全部文字，保持原有换行。',
      '2. 输出 JSON，对象包含 text、language、confidence、keywords(数组)、blocks(可选)。',
      '3. keywords 限制 5 个以内，倾向于可搜索的词或短语。',
      '4. 如果检测到多种语言，需要在 text 中附上主要内容的中文翻译。'
    ].join('\n')
  }

  private async persistAgentSuccess(
    job: typeof ocrJobs.$inferSelect,
    invocation: IntelligenceInvokeResult<IntelligenceVisionOcrResult>
  ): Promise<void> {
    if (!this.db) return

    this.resetFailureTracker()

    const { result } = invocation
    const jobId = job.id!

    const textHash = createHash('sha256').update(result.text).digest('hex')
    const originalTextLength = result.text.length
    const trimmedTextForDb =
      result.text.length > MAX_OCR_TEXT_CHARS
        ? `${result.text.slice(0, Math.max(0, MAX_OCR_TEXT_CHARS - 3))}...`
        : result.text
    const textTruncated = trimmedTextForDb.length !== result.text.length

    const keywords = this.normalizeKeywords(result.keywords, result.text)
    const summary = this.buildSummary(trimmedTextForDb)
    const embedding = await this.generateEmbedding(trimmedTextForDb)

    const trimmedTextForMeta =
      result.text.length > MAX_OCR_META_TEXT_CHARS
        ? `${result.text.slice(0, Math.max(0, MAX_OCR_META_TEXT_CHARS - 3))}...`
        : result.text

    const blocks = Array.isArray(result.blocks)
      ? result.blocks.slice(0, MAX_OCR_BLOCKS).map((block) => {
          const raw =
            typeof block === 'object' && block ? (block as unknown as Record<string, unknown>) : {}
          const text = typeof raw?.text === 'string' ? raw.text : ''
          return {
            ...raw,
            text: text.length > 160 ? `${text.slice(0, 157)}...` : text,
            children: undefined
          }
        })
      : undefined

    let rawSnippet: string | undefined
    let rawHash: string | undefined
    if (result.raw != null) {
      rawSnippet = safeJsonStringify(result.raw, MAX_OCR_RESULT_RAW_CHARS)
      rawHash = createHash('sha256').update(rawSnippet).digest('hex')
    }

    const extra = {
      keywords,
      blocks,
      summary,
      suggestions: result.suggestions,
      textHash,
      originalTextLength,
      textTruncated,
      rawHash,
      rawSnippet,
      embedding,
      provider: invocation.provider,
      model: invocation.model,
      usage: invocation.usage
    }

    await this.withDbWrite('ocr.persist.success', async () =>
      this.db!.transaction(async (tx) => {
        await tx.insert(ocrResults).values({
          jobId,
          text: trimmedTextForDb,
          confidence: result.confidence ?? null,
          language: result.language ?? null,
          checksum: job.payloadHash ?? null,
          extra: JSON.stringify(extra)
        })

        await tx
          .update(ocrJobs)
          .set({ status: 'completed', finishedAt: new Date(), lastError: null })
          .where(eq(ocrJobs.id, jobId))
      })
    )

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'done',
        ocr_text: trimmedTextForMeta,
        ocr_confidence: result.confidence ?? null,
        ocr_language: result.language ?? null,
        ocr_checksum: job.payloadHash,
        ocr_job_id: jobId,
        ocr_excerpt: summary,
        ocr_keywords: keywords,
        ocr_provider: invocation.provider,
        ocr_model: invocation.model,
        ocr_usage_prompt: invocation.usage.promptTokens,
        ocr_usage_completion: invocation.usage.completionTokens,
        ocr_last_error: null,
        ocr_retry_count: job.attempts ?? 0,
        ocr_embedding_status: embedding ? 'generated' : 'skipped'
      })

      await this.upsertConfig('ocr:last-success', {
        jobId,
        clipboardId: job.clipboardId,
        confidence: result.confidence,
        language: result.language,
        provider: invocation.provider,
        model: invocation.model,
        at: new Date().toISOString()
      })
    }
  }

  private buildSummary(text: string): string {
    if (!text) return ''
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized
  }

  private normalizeKeywords(keywords?: string[], fallback?: string): string[] {
    if (keywords && keywords.length > 0) {
      return Array.from(new Set(keywords.map((kw) => kw.trim()).filter(Boolean))).slice(0, 5)
    }

    if (!fallback) {
      return []
    }

    return Array.from(
      new Set(
        fallback
          .split(/[\s,.;，。；、]+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 1)
      )
    ).slice(0, 5)
  }

  /**
   * Generate embedding vector for OCR text if embedding capability is configured
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!text || text.length < 8) {
      return null
    }

    const trimmedText =
      text.length > MAX_EMBEDDING_INPUT_CHARS ? text.slice(0, MAX_EMBEDDING_INPUT_CHARS) : text

    const capabilityOptions = getCapabilityOptions('embedding.generate')
    if (!capabilityOptions.allowedProviderIds?.length) {
      return null
    }

    try {
      const response = await tuffIntelligence.embedding.generate(
        { text: trimmedText },
        {
          modelPreference: capabilityOptions.modelPreference,
          allowedProviderIds: capabilityOptions.allowedProviderIds
        }
      )
      return response.result
    } catch (error) {
      void error
      return null
    }
  }

  private resetFailureTracker(): void {
    this.consecutiveFailureCount = 0
    this.recentFailureTimestamps = []
  }

  private async isQueueDisabled(): Promise<boolean> {
    if (!this.queueDisabledUntil) {
      return false
    }
    if (Date.now() < this.queueDisabledUntil) {
      return true
    }
    await this.clearQueueDisableState('cooldown-expired')
    return false
  }

  private async recordJobFailure(reason: string): Promise<void> {
    try {
      if (await this.isQueueDisabled()) {
        return
      }

      const now = Date.now()
      this.consecutiveFailureCount += 1
      this.recentFailureTimestamps.push(now)
      this.recentFailureTimestamps = this.recentFailureTimestamps.filter(
        (timestamp) => now - timestamp <= OCR_FAILURE_WINDOW_MS
      )

      const shouldDisableQueue =
        this.consecutiveFailureCount >= OCR_FAILURE_THRESHOLD ||
        this.recentFailureTimestamps.length >= OCR_FAILURE_THRESHOLD

      if (shouldDisableQueue) {
        await this.disableQueue(reason)
      }
    } catch {
      // ignore failure tracking errors
    }
  }

  private async disableQueue(reason: string): Promise<void> {
    const now = Date.now()
    if (this.queueDisabledUntil && now < this.queueDisabledUntil) {
      return
    }

    const shouldEscalate =
      this.lastQueueDisabledAt != null &&
      now - this.lastQueueDisabledAt <= OCR_QUEUE_DISABLE_ESCALATE_WINDOW_MS
    this.queueDisableStrike = shouldEscalate ? this.queueDisableStrike + 1 : 1
    this.lastQueueDisabledAt = now

    const cooldownMs = Math.min(
      OCR_QUEUE_DISABLE_MAX_MS,
      OCR_QUEUE_DISABLE_BASE_MS * 2 ** Math.max(0, this.queueDisableStrike - 1)
    )
    const disabledUntil = now + cooldownMs
    this.queueDisabledUntil = disabledUntil
    this.queueDisableReason = reason

    await this.upsertConfig('ocr:queue-disabled', {
      disabled: true,
      reason,
      disabledAt: new Date(now).toISOString(),
      disabledUntil: new Date(disabledUntil).toISOString(),
      cooldownMs,
      strike: this.queueDisableStrike,
      consecutiveFailureCount: this.consecutiveFailureCount,
      failureWindowCount: this.recentFailureTimestamps.length
    })

    const disabledUntilText = new Date(disabledUntil).toLocaleString()
    const userHint = this.isLikelyConfigError(reason)
      ? '请检查 OCR 提供者与模型配置后，等待自动恢复。'
      : '请检查网络或 OCR 服务可用性，稍后会自动恢复。'

    notificationModule.pushInboxEntry({
      title: 'OCR 多次失败已自动暂停',
      message: `OCR 队列已自动关闭至 ${disabledUntilText}。原因: ${reason}。${userHint}`,
      level: 'warning',
      dedupeKey: 'ocr-queue-auto-disabled',
      payload: {
        reason,
        disabledUntil: new Date(disabledUntil).toISOString(),
        cooldownMs,
        strike: this.queueDisableStrike,
        consecutiveFailureCount: this.consecutiveFailureCount,
        failureWindowCount: this.recentFailureTimestamps.length
      }
    })
  }

  private async clearQueueDisableState(trigger: 'cooldown-expired' | 'manual'): Promise<void> {
    this.queueDisabledUntil = null
    this.queueDisableReason = null
    this.resetFailureTracker()

    await this.upsertConfig('ocr:queue-disabled', {
      disabled: false,
      trigger,
      resumedAt: new Date().toISOString()
    })
  }

  private isLikelyConfigError(reason: string): boolean {
    const message = reason.toLowerCase()
    return (
      message.includes('no enabled providers') ||
      message.includes('provider factory') ||
      message.includes('native ocr module') ||
      message.includes('native-module-not-loaded') ||
      message.includes('api key') ||
      message.includes('unauthorized') ||
      message.includes('401')
    )
  }

  private async failJob(jobId: number, reason: string, details?: unknown): Promise<void> {
    if (!this.db) return

    const jobs = await this.db.select().from(ocrJobs).where(eq(ocrJobs.id, jobId)).limit(1)

    if (jobs.length === 0) return

    const job = jobs[0]
    const attempts = job.attempts ?? 0
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
    const retryDelaySeconds = status === 'pending' ? getRetryDelaySeconds(reason) : null
    const nextRetryAt = retryDelaySeconds ? new Date(Date.now() + retryDelaySeconds * 1000) : null

    await this.withDbWrite('ocr.jobs.fail', () =>
      this.db!.update(ocrJobs)
        .set({
          status,
          lastError: reason,
          nextRetryAt,
          finishedAt: status === 'failed' ? new Date() : null
        })
        .where(eq(ocrJobs.id, jobId))
    )

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: status === 'failed' ? 'failed' : 'retrying',
        ocr_last_error: reason,
        ocr_job_id: jobId,
        ocr_retry_count: attempts,
        ocr_retry_after_seconds: retryDelaySeconds,
        ocr_next_retry_at: nextRetryAt ? nextRetryAt.toISOString() : null
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

    await this.recordJobFailure(reason)

    if (status === 'failed') {
      void details
    } else {
      setImmediate(() => {
        this.processQueue().catch(() => {})
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

    await this.withDbWrite('ocr.clipboard.meta', async () =>
      this.db!.transaction(async (tx) => {
        if (insertValues.length > 0) {
          await tx.insert(clipboardHistoryMeta).values(insertValues)
        }

        const existing = await tx
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
          await tx
            .update(clipboardHistory)
            .set({ metadata: JSON.stringify(merged) })
            .where(eq(clipboardHistory.id, clipboardId))
        }
      })
    )

    this.broadcastMetaUpdate(clipboardId, patch)
    this.clipboardMetaListener?.(clipboardId, patch)
  }

  /**
   * Broadcast clipboard metadata updates to interested parties
   * Note: CoreBox renderer doesn't need real-time OCR updates
   * Metadata is already persisted to DB and memory cache via handleMetaPatch callback
   */
  private broadcastMetaUpdate(clipboardId: number, patch: Record<string, unknown>): void {
    // Notify attached plugin UI view if any
    const activePlugin = windowManager.getAttachedPlugin()
    if (activePlugin?._uniqueChannelKey) {
      const channel = genTouchApp().channel
      const keyManager =
        (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
      const transport = getTuffTransportMain(channel, keyManager)
      void transport
        .sendToPlugin(activePlugin.name, coreBoxClipboardMetaUpdatedEvent, {
          clipboardId,
          patch
        })
        .catch(() => {})
    }
  }

  private async upsertConfig(key: string, value: unknown): Promise<void> {
    if (!this.db) return
    const serialized = JSON.stringify(value ?? null)
    await this.withDbWrite('ocr.config', () =>
      this.db!.insert(config)
        .values({ key, value: serialized })
        .onConflictDoUpdate({
          target: config.key,
          set: { value: serialized }
        })
    )
  }
}

export const ocrService = new OcrService()
