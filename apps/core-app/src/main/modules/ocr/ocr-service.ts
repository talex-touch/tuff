import type {
  AiInvokeResult,
  AiVisionOcrPayload,
  AiVisionOcrResult,
} from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { IClipboardItem } from '../clipboard'

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import chalk from 'chalk'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { genTouchChannel } from '../../core/channel-core'
import {
  clipboardHistory,
  clipboardHistoryMeta,
  config,
  ocrJobs,
  ocrResults,
} from '../../db/schema'
import { ensureAiConfigLoaded, getCapabilityOptions, getCapabilityPrompt } from '../ai/intelligence-config'
import { ai } from '../ai/intelligence-sdk'
import { windowManager } from '../box-tool/core-box/window'
import { databaseModule } from '../database'

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

const PROCESS_INTERVAL_SECONDS = 5
const MAX_ATTEMPTS = 3
const WORKER_CONCURRENCY = 1

// 重试延迟配置(秒)
const RETRY_DELAYS = {
  'No enabled providers available': 3600, // 1小时
  'Provider factory missing': 300, // 5分钟
  'default': 60, // 默认1分钟
}

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
  private activeJobs = new Map<number, Promise<void>>()
  private lastAttemptMap = new Map<number, number>() // jobId -> timestamp
  private clipboardMetaListener:
    | ((clipboardId: number, patch: Record<string, unknown>) => void)
    | null = null

  private channelRegistered = false

  private ensureInitialized(): void {
    if (this.initialized)
      return

    this.db = databaseModule.getDb()

    this.registerChannels()
    ensureAiConfigLoaded()

    pollingService.register(
      this.pollTaskId,
      () =>
        this.processQueue().catch((error) => {
          console.error('[OCR] Failed to process queue:', error)
        }),
      {
        interval: PROCESS_INTERVAL_SECONDS,
        unit: 'seconds',
        runImmediately: true,
      },
    )

    this.initialized = true
  }

  private registerChannels(): void {
    if (this.channelRegistered) {
      return
    }

    const channel = genTouchChannel()

    channel.regChannel(ChannelType.MAIN, 'ocr:dashboard', async ({ reply, data }) => {
      try {
        const limit = typeof data?.limit === 'number' && data.limit > 0 ? data.limit : 50
        const snapshot = await this.getDashboardSnapshot(limit)
        reply(DataCode.SUCCESS, {
          ok: true,
          snapshot,
        })
      }
      catch (error) {
        console.error(chalk.red('[OCR] Failed to build dashboard snapshot:'), error)
        reply(DataCode.ERROR, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
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
          lastFailure: null,
        },
        indexes: {
          fileSources: [],
          dataUrlSourceCount: 0,
          clipboardIds: [],
          payloadHashes: [],
        },
      }
    }

    const jobs = await this.db.select().from(ocrJobs).orderBy(desc(ocrJobs.queuedAt)).limit(limit)

    const jobIds = jobs.map(job => job.id).filter((id): id is number => typeof id === 'number')

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
        count: sql<number>`COUNT(*)`,
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
    ]

    const configRows = await this.db.select().from(config).where(inArray(config.key, configKeys))

    const configMap: Record<string, unknown> = {}
    for (const row of configRows) {
      if (!row.key)
        continue
      try {
        configMap[row.key] = row.value ? JSON.parse(row.value) : null
      }
      catch {
        configMap[row.key] = row.value
      }
    }

    const fileSources = new Set<string>()
    const payloadHashes = new Set<string>()
    const clipboardIds = new Set<number>()
    let dataUrlSourceCount = 0

    const toIsoString = (value: unknown): string | null => {
      if (!value)
        return null
      if (value instanceof Date)
        return value.toISOString()
      if (typeof value === 'number') {
        // drizzle timestamp mode returns seconds since epoch by default
        return new Date(value * 1000).toISOString()
      }
      return null
    }

    const enrichedJobs = jobs.map((job) => {
      let parsedMeta: Record<string, any> | null = null
      if (job.meta) {
        try {
          parsedMeta = JSON.parse(job.meta)
        }
        catch {
          parsedMeta = null
        }
      }

      const source = parsedMeta?.source
      const options = parsedMeta?.options

      if (source?.type === 'file' && typeof source.filePath === 'string') {
        fileSources.add(source.filePath)
      }
      else if (source?.type === 'data-url') {
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
              createdAt: toIsoString(result.createdAt),
            }
          : null,
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
      },
      indexes: {
        fileSources: Array.from(fileSources),
        dataUrlSourceCount,
        clipboardIds: Array.from(clipboardIds),
        payloadHashes: Array.from(payloadHashes),
      },
    }
  }

  async start(): Promise<void> {
    this.ensureInitialized()
    await this.processQueue()
  }

  registerClipboardMetaListener(
    listener: (clipboardId: number, patch: Record<string, unknown>) => void,
  ): void {
    this.clipboardMetaListener = listener
  }

  async enqueueFromClipboard(payload: ClipboardOcrPayload): Promise<void> {
    this.ensureInitialized()
    if (!this.db)
      return

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
        options,
      }),
    })

    const initialMeta: Record<string, unknown> = {
      ocr_status: 'pending',
      ocr_source_type: source.type,
      ocr_payload_hash: payloadHash,
    }

    if (source.type === 'file' && source.filePath) {
      initialMeta.ocr_source_file = source.filePath
    }

    await this.updateClipboardMeta(clipboardId, initialMeta)

    await this.upsertConfig('ocr:last-queued', {
      clipboardId,
      payloadHash,
      at: new Date().toISOString(),
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

    if (!clipboardId)
      return null

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
      if (!item.content)
        return null
      return {
        clipboardId,
        source: {
          type: 'data-url',
          dataUrl: item.content,
        },
        options: {
          language: 'eng',
        },
        payloadHash: dataUrlToHash(item.content),
      }
    }

    if (item.type === 'files') {
      try {
        const files = JSON.parse(item.content) as string[]
        const imagePath = files.find(file => this.isImageFile(file))
        if (!imagePath || !existsSync(imagePath)) {
          return null
        }

        return {
          clipboardId,
          source: {
            type: 'file',
            filePath: imagePath,
          },
          options: {
            language: 'eng',
          },
          payloadHash: fileHashKey(imagePath),
        }
      }
      catch {
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
  ): Promise<AiVisionOcrPayload['source']> {
    if (source.type === 'data-url' && source.dataUrl) {
      return { type: 'data-url', dataUrl: source.dataUrl }
    }

    if (source.type === 'file' && source.filePath) {
      const buffer = await readFile(source.filePath)
      const mime = this.detectMimeType(source.filePath)
      return {
        type: 'data-url',
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      }
    }

    throw new Error('[OCR] Unsupported source payload for agent invocation')
  }

  private async processQueue(): Promise<void> {
    if (this.processing)
      return
    if (!this.db)
      return

    this.processing = true
    try {
      while (this.activeJobs.size < WORKER_CONCURRENCY) {
        const now = Date.now()

        // 查询所有 pending 任务
        const allPending = await this.db
          .select()
          .from(ocrJobs)
          .where(eq(ocrJobs.status, 'pending'))
          .orderBy(desc(ocrJobs.priority), ocrJobs.queuedAt)

        // 在应用层过滤:只处理未尝试或已超过重试延迟的任务
        const readyJobs = allPending.filter((job) => {
          if (!job.id)
            return false

          // 首先检查是否已达到最大重试次数
          const currentAttempts = job.attempts ?? 0
          if (currentAttempts >= MAX_ATTEMPTS) {
            // 这种情况不应该发生,说明数据库状态不一致,直接标记为失败
            console.warn(
              chalk.yellow(
                `[OCR] Found pending job ${job.id} with attempts=${currentAttempts} >= MAX_ATTEMPTS, marking as failed`,
              ),
            )
            this.failJob(job.id, 'Max attempts exceeded').catch(console.error)
            return false
          }

          // 如果没有错误记录,说明是首次尝试
          if (!job.lastError)
            return true

          // 检查内存中的最后尝试时间
          const lastAttempt = this.lastAttemptMap.get(job.id)
          if (!lastAttempt) {
            // 内存中没有记录(可能是应用重启),检查数据库中的 startedAt
            if (job.startedAt) {
              const startedAtMs
                = typeof job.startedAt === 'number'
                  ? job.startedAt * 1000
                  : new Date(job.startedAt).getTime()

              const delaySeconds = (RETRY_DELAYS as any)[job.lastError] || RETRY_DELAYS.default
              const delayMs = delaySeconds * 1000
              const timeSinceStart = now - startedAtMs

              return timeSinceStart >= delayMs
            }
            // 没有 startedAt,说明从未执行过,允许执行
            return true
          }

          // 根据错误类型确定延迟时间
          const delaySeconds = (RETRY_DELAYS as any)[job.lastError] || RETRY_DELAYS.default
          const delayMs = delaySeconds * 1000
          const timeSinceLastAttempt = now - lastAttempt

          return timeSinceLastAttempt >= delayMs
        })

        if (readyJobs.length === 0) {
          break
        }

        const job = readyJobs[0]

        const attemptCount = (job.attempts ?? 0) + 1

        await this.db
          .update(ocrJobs)
          .set({
            status: 'processing',
            attempts: attemptCount,
            startedAt: new Date(),
          })
          .where(eq(ocrJobs.id, job.id))

        job.attempts = attemptCount

        await this.upsertConfig('ocr:last-dispatch', {
          jobId: job.id,
          clipboardId: job.clipboardId,
          attempts: attemptCount,
          at: new Date().toISOString(),
        })

        const task = this.runAgentJob(job.id!, job).finally(() => {
          this.activeJobs.delete(job.id!)
          setImmediate(() => {
            this.processQueue().catch(error => console.error('[OCR] Queue resume error:', error))
          })
        })

        this.activeJobs.set(job.id!, task)
      }
    }
    finally {
      this.processing = false
    }
  }

  private async runAgentJob(jobId: number, job: typeof ocrJobs.$inferSelect): Promise<void> {
    if (!job.meta) {
      await this.failJob(jobId, 'Missing job metadata')
      return
    }

    let parsed: { source: AgentJobPayload['source'], options: AgentJobPayload['options'] }
    try {
      parsed = JSON.parse(job.meta)
    }
    catch (error) {
      await this.failJob(jobId, 'Invalid job metadata JSON', error)
      return
    }

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'processing',
      })
    }

    ensureAiConfigLoaded()

    const capabilityOptions = getCapabilityOptions('vision.ocr')
    const normalizedSource = await this.normalizeSourceForAgent(parsed.source)
    const payload: AiVisionOcrPayload = {
      source: normalizedSource,
      language: parsed.options?.language,
      prompt: this.buildAgentPrompt(parsed),
      includeLayout: true,
      includeKeywords: true,
      metadata: {
        jobId,
        clipboardId: job.clipboardId,
        payloadHash: job.payloadHash,
      },
    }

    try {
      const invocation = await ai.invoke<AiVisionOcrResult>('vision.ocr', payload, {
        modelPreference: capabilityOptions.modelPreference,
        allowedProviderIds: capabilityOptions.allowedProviderIds,
      })
      await this.persistAgentSuccess(job, invocation)
    }
    catch (error) {
      const retryReason = this.classifyRetryableAgentError(error)
      if (retryReason) {
        await this.deferJob(job, retryReason)
        return
      }
      console.error('[OCR] Agent invocation failed:', error)
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
    return null
  }

  private async deferJob(job: typeof ocrJobs.$inferSelect, reason: string): Promise<void> {
    if (!this.db || !job.id)
      return

    const currentAttempts = job.attempts ?? 0

    // 检查是否已达到最大重试次数
    if (currentAttempts >= MAX_ATTEMPTS) {
      console.warn(
        chalk.yellow(
          `[OCR] Job ${job.id} reached max attempts (${MAX_ATTEMPTS}), marking as failed: ${reason}`,
        ),
      )
      await this.failJob(job.id, `Max attempts reached: ${reason}`)
      return
    }

    // 记录最后尝试时间到内存 Map
    this.lastAttemptMap.set(job.id, Date.now())

    await this.db
      .update(ocrJobs)
      .set({
        status: 'pending',
        lastError: reason,
        startedAt: null,
      })
      .where(eq(ocrJobs.id, job.id))

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'pending',
        ocr_last_error: reason,
        ocr_retry_count: currentAttempts,
      })
    }

    // 根据错误原因确定延迟时间(用于日志显示)
    const delaySeconds = (RETRY_DELAYS as any)[reason] || RETRY_DELAYS.default
    const delayMinutes = Math.floor(delaySeconds / 60)
    const delayHours = Math.floor(delayMinutes / 60)
    const delayDisplay
      = delayHours > 0
        ? `${delayHours}小时${delayMinutes % 60}分钟`
        : delayMinutes > 0
          ? `${delayMinutes}分钟`
          : `${delaySeconds}秒`

    console.debug(
      chalk.gray(
        `[OCR] Job ${job.id} deferred (attempt ${currentAttempts}/${MAX_ATTEMPTS}): ${reason} (下次重试: ${delayDisplay}后)`,
      ),
    )
  }

  private buildAgentPrompt(payload: { options?: AgentJobPayload['options'] }): string {
    const capabilityPrompt = getCapabilityPrompt('vision.ocr')
    if (payload.options?.config && typeof payload.options.config.prompt === 'string') {
      return payload.options.config.prompt
    }
    if (
      payload.options
      && 'prompt' in payload.options
      && typeof (payload.options as any).prompt === 'string'
    ) {
      return String((payload.options as any).prompt)
    }
    if (capabilityPrompt) {
      return capabilityPrompt
    }
    return [
      '你是一名多语言 OCR 专家：',
      '1. 识别图片中全部文字，保持原有换行。',
      '2. 输出 JSON，对象包含 text、language、confidence、keywords(数组)、blocks(可选)。',
      '3. keywords 限制 5 个以内，倾向于可搜索的词或短语。',
      '4. 如果检测到多种语言，需要在 text 中附上主要内容的中文翻译。',
    ].join('\n')
  }

  private async persistAgentSuccess(
    job: typeof ocrJobs.$inferSelect,
    invocation: AiInvokeResult<AiVisionOcrResult>,
  ): Promise<void> {
    if (!this.db)
      return

    const { result } = invocation
    const jobId = job.id!
    const keywords = this.normalizeKeywords(result.keywords, result.text)
    const summary = this.buildSummary(result.text)
    const embedding = await this.generateEmbedding(result.text)

    const extra = {
      keywords,
      blocks: result.blocks,
      summary,
      suggestions: result.suggestions,
      raw: result.raw,
      embedding,
      provider: invocation.provider,
      model: invocation.model,
      usage: invocation.usage,
    }

    await this.db.insert(ocrResults).values({
      jobId,
      text: result.text,
      confidence: result.confidence ?? null,
      language: result.language ?? null,
      checksum: job.payloadHash ?? null,
      extra: JSON.stringify(extra),
    })

    await this.db
      .update(ocrJobs)
      .set({ status: 'completed', finishedAt: new Date(), lastError: null })
      .where(eq(ocrJobs.id, jobId))

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: 'done',
        ocr_text: result.text,
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
        ocr_embedding_status: embedding ? 'generated' : 'skipped',
      })

      await this.upsertConfig('ocr:last-success', {
        jobId,
        clipboardId: job.clipboardId,
        confidence: result.confidence,
        language: result.language,
        provider: invocation.provider,
        model: invocation.model,
        at: new Date().toISOString(),
      })
    }
  }

  private buildSummary(text: string): string {
    if (!text)
      return ''
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized
  }

  private normalizeKeywords(keywords?: string[], fallback?: string): string[] {
    if (keywords && keywords.length > 0) {
      return Array.from(new Set(keywords.map(kw => kw.trim()).filter(Boolean))).slice(0, 5)
    }

    if (!fallback) {
      return []
    }

    return Array.from(
      new Set(
        fallback
          .split(/[\s,.;，。；、]+/)
          .map(token => token.trim())
          .filter(token => token.length > 1),
      ),
    ).slice(0, 5)
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!text || text.length < 8) {
      return null
    }
    const capabilityOptions = getCapabilityOptions('embedding.generate')
    try {
      const response = await ai.embedding.generate(
        { text },
        {
          modelPreference: capabilityOptions.modelPreference,
          allowedProviderIds: capabilityOptions.allowedProviderIds,
        },
      )
      return response.result
    }
    catch (error) {
      console.warn('[OCR] Embedding generation failed:', error)
      return null
    }
  }

  private async failJob(jobId: number, reason: string, details?: unknown): Promise<void> {
    if (!this.db)
      return

    const jobs = await this.db.select().from(ocrJobs).where(eq(ocrJobs.id, jobId)).limit(1)

    if (jobs.length === 0)
      return

    const job = jobs[0]
    const attempts = job.attempts ?? 0
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'

    await this.db
      .update(ocrJobs)
      .set({
        status,
        lastError: reason,
        finishedAt: status === 'failed' ? new Date() : null,
      })
      .where(eq(ocrJobs.id, jobId))

    if (job.clipboardId) {
      await this.updateClipboardMeta(job.clipboardId, {
        ocr_status: status === 'failed' ? 'failed' : 'retrying',
        ocr_last_error: reason,
        ocr_job_id: jobId,
        ocr_retry_count: attempts,
      })

      if (status === 'failed') {
        await this.upsertConfig('ocr:last-failure', {
          jobId,
          clipboardId: job.clipboardId,
          reason,
          at: new Date().toISOString(),
        })
      }
    }

    if (status === 'failed') {
      console.warn(chalk.redBright(`[OCR] Job ${jobId} failed permanently: ${reason}`))
      if (details) {
        console.warn(chalk.red('[OCR] Failure details:'), details)
      }
    }
    else {
      setImmediate(() => {
        this.processQueue().catch(error => console.error('[OCR] Queue resume error:', error))
      })
    }
  }

  private async updateClipboardMeta(
    clipboardId: number,
    entries: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db)
      return

    const patch: Record<string, unknown> = { ...entries }
    if (!Object.prototype.hasOwnProperty.call(patch, 'ocr_updated_at')) {
      patch.ocr_updated_at = new Date().toISOString()
    }

    const insertValues = Object.entries(patch).map(([key, value]) => ({
      clipboardId,
      key,
      value: JSON.stringify(value ?? null),
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
        }
        catch {
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

  /**
   * Broadcast clipboard metadata updates to interested parties
   * Note: CoreBox renderer doesn't need real-time OCR updates
   * Metadata is already persisted to DB and memory cache via handleMetaPatch callback
   */
  private broadcastMetaUpdate(clipboardId: number, patch: Record<string, unknown>): void {
    // Notify attached plugin UI view if any
    const activePlugin = windowManager.getAttachedPlugin()
    if (activePlugin?._uniqueChannelKey) {
      const touchChannel = genTouchChannel()
      touchChannel
        .sendToPlugin(activePlugin.name, 'core-box:clipboard-meta-updated', {
          clipboardId,
          patch,
        })
        .catch((error) => {
          console.warn('[OCR] Failed to notify plugin about meta update:', error)
        })
    }
  }


  private async upsertConfig(key: string, value: unknown): Promise<void> {
    if (!this.db)
      return
    const serialized = JSON.stringify(value ?? null)
    await this.db
      .insert(config)
      .values({ key, value: serialized })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: serialized },
      })
  }
}

export const ocrService = new OcrService()
