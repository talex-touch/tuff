import type {
  ClipboardDeleteRequest,
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse,
  ClipboardMetaQueryRequest,
  ClipboardQueryRequest
} from '@talex-touch/utils/transport/events/types'
import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { ClipboardHistoryQueryInput } from './clipboard-request-normalizer'
import { performance } from 'node:perf_hooks'
import { isHttpSource, resolveLocalFilePath } from '@talex-touch/utils/network'
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { appTaskGate } from '../../service/app-task-gate'
import { normalizeRenderableSource } from '../../utils/local-renderable-assets'
import { createLogger } from '../../utils/logger'
import { enterPerfContext } from '../../utils/perf-context'
import { perfMonitor } from '../../utils/perf-monitor'
import { clipboardHistory, clipboardHistoryMeta } from '../../db/schema'
import {
  buildPhaseDiagnostics,
  toPerfSeverity,
  trackPhaseAsync,
  type ClipboardPhaseDurations
} from './clipboard-phase-diagnostics'

const clipboardHistoryLog = createLogger('Clipboard')
const PAGE_SIZE = 20
const CACHE_MAX_COUNT = 20
const CACHE_MAX_AGE_MS = 60 * 60 * 1000

export interface IClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: Date
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

export interface ClipboardHistoryPersistenceOptions {
  onForgetFreshness?: (id: number) => void
  onChange?: () => void
  deleteImageFile?: (filePath: string) => void
  isWithinTempBaseDir?: (filePath: string) => boolean
  normalizeRenderableSource?: (source: string) => RenderableSourceResult
}

type RenderableSourceResult = { value: string } | { missing: true; value?: string | null }

export function isDataUrl(value: string): boolean {
  return typeof value === 'string' && value.startsWith('data:')
}

export function isLikelyLocalPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('data:') &&
    !isHttpSource(value)
  )
}

export function mergeClipboardMetadataString(
  original: string | null | undefined,
  patch: Record<string, unknown>
): string {
  let base: Record<string, unknown> = {}
  if (original) {
    try {
      base = JSON.parse(original)
    } catch {
      base = {}
    }
  }
  return JSON.stringify({ ...base, ...patch })
}

export class ClipboardHistoryPersistence {
  private db?: LibSQLDatabase<typeof schema>
  private memoryCache: IClipboardItem[] = []
  private initialCacheLoaded = false
  private initialCacheLoadingPromise: Promise<void> | null = null

  constructor(private readonly options: ClipboardHistoryPersistenceOptions = {}) {}

  public setDatabase(db: LibSQLDatabase<typeof schema> | undefined): void {
    this.db = db
    this.initialCacheLoaded = false
    this.initialCacheLoadingPromise = null
    this.memoryCache = []
  }

  public reset(): void {
    this.memoryCache = []
    this.initialCacheLoaded = false
    this.initialCacheLoadingPromise = null
  }

  public getMemoryItemsCount(): number {
    return this.memoryCache.length
  }

  public getCachedItems(): IClipboardItem[] {
    return this.memoryCache
  }

  public getLatestItem(): IClipboardItem | undefined {
    return this.memoryCache[0]
  }

  public getCachedItemById(id: number): IClipboardItem | undefined {
    return this.memoryCache.find((item) => item.id === id)
  }

  private forgetFreshness(id: number | undefined): void {
    if (typeof id !== 'number') return
    this.options.onForgetFreshness?.(id)
  }

  private notifyChange(): void {
    this.options.onChange?.()
  }

  private deleteImageFile(filePath: string): void {
    this.options.deleteImageFile?.(filePath)
  }

  private isWithinTempBaseDir(filePath: string): boolean {
    return this.options.isWithinTempBaseDir?.(filePath) ?? false
  }

  private normalizeRenderableSource(source: string): RenderableSourceResult {
    return this.options.normalizeRenderableSource?.(source) ?? normalizeRenderableSource(source)
  }

  public async hydrateWithMeta<T extends { id?: number | null; metadata?: string | null }>(
    rows: readonly T[]
  ): Promise<Array<T & { meta: Record<string, unknown> | null }>> {
    if (!this.db || rows.length === 0) {
      return rows.map((row) => ({ ...row, meta: null }))
    }

    const ids = rows.map((item) => item.id).filter((id): id is number => typeof id === 'number')
    const metaMap = new Map<number, Record<string, unknown>>()

    if (ids.length > 0) {
      const metaRows = await this.db
        .select()
        .from(clipboardHistoryMeta)
        .where(inArray(clipboardHistoryMeta.clipboardId, ids))

      for (const metaRow of metaRows) {
        if (typeof metaRow.clipboardId !== 'number') continue
        const existing = metaMap.get(metaRow.clipboardId) ?? {}
        try {
          existing[metaRow.key] = metaRow.value ? JSON.parse(metaRow.value) : null
        } catch {
          existing[metaRow.key] = metaRow.value
        }
        metaMap.set(metaRow.clipboardId, existing)
      }
    }

    return rows.map((row) => {
      let fallback: Record<string, unknown> | null = null
      if (typeof row.metadata === 'string' && row.metadata.trim().length > 0) {
        try {
          fallback = JSON.parse(row.metadata)
        } catch {
          fallback = null
        }
      }

      const meta = row.id ? (metaMap.get(row.id) ?? fallback) : fallback
      return {
        ...row,
        meta: meta ?? null
      }
    })
  }

  private async loadInitialCache(options?: { waitForIdle?: boolean }): Promise<void> {
    if (!this.db) return

    const waitForIdle = options?.waitForIdle !== false
    const dispose = enterPerfContext('Clipboard.loadInitialCache', {
      limit: CACHE_MAX_COUNT,
      waitForIdle
    })
    const startAt = performance.now()
    const phaseDurations: ClipboardPhaseDurations = {}
    try {
      if (waitForIdle) {
        await trackPhaseAsync(phaseDurations, 'gate.waitForIdle', async () => {
          await appTaskGate.waitForIdle()
        })
      }

      const rows = await trackPhaseAsync(phaseDurations, 'db.queryRecentRows', async () => {
        return await this.db!.select()
          .from(clipboardHistory)
          .orderBy(desc(clipboardHistory.timestamp))
          .limit(CACHE_MAX_COUNT)
      })

      this.memoryCache = await trackPhaseAsync(phaseDurations, 'meta.hydrate', async () => {
        return await this.hydrateWithMeta(rows)
      })
    } finally {
      const duration = performance.now() - startAt
      const gateWaitMs = Math.round(phaseDurations['gate.waitForIdle'] ?? 0)
      const effectiveWorkMs = Math.max(0, Math.round(duration) - gateWaitMs)
      const phaseDiagnostics = buildPhaseDiagnostics(phaseDurations, effectiveWorkMs)
      if (duration > 200) {
        const severity = toPerfSeverity(phaseDiagnostics.phaseAlertLevel)
        if (severity) {
          perfMonitor.recordMainReport({
            kind: 'clipboard.cache.hydrate.slow',
            eventName: phaseDiagnostics.phaseAlertCode,
            durationMs: Math.round(duration),
            level: severity,
            meta: {
              effectiveWorkMs,
              phaseAlertLevel: phaseDiagnostics.phaseAlertLevel,
              slowestPhase: phaseDiagnostics.slowestPhase ?? 'none',
              slowestPhaseMs: phaseDiagnostics.slowestPhaseMs
            }
          })
        }
        clipboardHistoryLog.warn('Clipboard cache hydrate slow', {
          meta: {
            durationMs: Math.round(duration),
            effectiveWorkMs,
            ...phaseDiagnostics
          }
        })
      }
      dispose()
    }
  }

  public async ensureInitialCacheLoaded(): Promise<void> {
    if (this.initialCacheLoaded || !this.db) {
      return
    }
    if (this.initialCacheLoadingPromise) {
      await this.initialCacheLoadingPromise
      return
    }

    this.initialCacheLoadingPromise = this.loadInitialCache({ waitForIdle: false })
      .then(() => {
        this.initialCacheLoaded = true
      })
      .catch((error) => {
        this.initialCacheLoaded = false
        clipboardHistoryLog.warn('Clipboard initial cache lazy load failed', { error })
      })
      .finally(() => {
        this.initialCacheLoadingPromise = null
      })

    await this.initialCacheLoadingPromise
  }

  public updateMemoryCache(item: IClipboardItem): void {
    this.memoryCache.unshift(item)
    if (this.memoryCache.length > CACHE_MAX_COUNT) {
      const removed = this.memoryCache.pop()
      this.forgetFreshness(removed?.id)
    }
    const oneHourAgo = Date.now() - CACHE_MAX_AGE_MS
    this.memoryCache = this.memoryCache.filter((i) => {
      const ts = i.timestamp
      if (!ts) return false
      const timeValue = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
      const keep = Number.isFinite(timeValue) && timeValue > oneHourAgo
      if (!keep) {
        this.forgetFreshness(i.id)
      }
      return keep
    })
  }

  public async getItemById(id: number): Promise<IClipboardItem | null> {
    if (!this.db || !Number.isFinite(id)) {
      return null
    }

    const cached = this.getCachedItemById(id)
    if (cached) {
      return cached
    }

    const rows = await this.db
      .select()
      .from(clipboardHistory)
      .where(eq(clipboardHistory.id, id))
      .limit(1)

    if (rows.length === 0) {
      return null
    }

    const [hydrated] = await this.hydrateWithMeta(rows)
    return (hydrated as IClipboardItem) ?? null
  }

  public async queryHistoryByMeta(
    request: ClipboardMetaQueryRequest = {}
  ): Promise<IClipboardItem[]> {
    if (!this.db) {
      return []
    }

    const { source, category, metaFilter, limit: requestedLimit } = request ?? {}
    const limit = Math.min(Math.max(requestedLimit ?? 5, 1), 50)
    const metaFilterPreview = metaFilter ? JSON.stringify(metaFilter) : undefined

    clipboardHistoryLog.debug('[clipboard:history:query-meta] Request', {
      meta: { source, category, metaFilter: metaFilterPreview, limit }
    })

    if (!source && !category && !metaFilter) {
      const rows = await this.db
        .select()
        .from(clipboardHistory)
        .orderBy(desc(clipboardHistory.timestamp))
        .limit(limit)
      const history = await this.hydrateWithMeta(rows)
      return history.map((item) => this.toClientItem(item) ?? item)
    }

    const conditions: ReturnType<typeof and>[] = []

    if (source) {
      conditions.push(
        and(
          eq(clipboardHistoryMeta.key, 'source'),
          eq(clipboardHistoryMeta.value, JSON.stringify('custom'))
        )!
      )
    }

    if (category) {
      const categoryValue = JSON.stringify(category)
      clipboardHistoryLog.debug('[clipboard:history:query-meta] Searching for category', {
        meta: { category, categoryValue }
      })
      conditions.push(
        and(
          eq(clipboardHistoryMeta.key, 'category'),
          eq(clipboardHistoryMeta.value, categoryValue)
        )!
      )
    }

    if (metaFilter) {
      const { key, value } = metaFilter
      if (key) {
        const condition =
          value !== undefined
            ? and(
                eq(clipboardHistoryMeta.key, key),
                eq(clipboardHistoryMeta.value, JSON.stringify(value))
              )
            : and(eq(clipboardHistoryMeta.key, key))
        if (condition) conditions.push(condition)
      }
    }

    if (conditions.length === 0) {
      return []
    }

    const idRows = await this.db
      .select({ clipboardId: clipboardHistoryMeta.clipboardId })
      .from(clipboardHistoryMeta)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .orderBy(desc(clipboardHistoryMeta.createdAt))
      .limit(limit)

    clipboardHistoryLog.debug('[clipboard:history:query-meta] Found meta rows', {
      meta: { count: idRows.length }
    })

    const ids = idRows.map((row) => row.clipboardId).filter((id): id is number => !!id)
    if (ids.length === 0) {
      clipboardHistoryLog.debug('[clipboard:history:query-meta] No matching IDs found')
      return []
    }

    clipboardHistoryLog.debug('[clipboard:history:query-meta] Fetching clipboard entries', {
      meta: { count: ids.length, sampleIds: ids.slice(0, 5).join(',') }
    })

    const rows = await this.db
      .select()
      .from(clipboardHistory)
      .where(inArray(clipboardHistory.id, ids))
      .orderBy(desc(clipboardHistory.timestamp))

    const history = await this.hydrateWithMeta(rows)
    const normalized = history.map((item) => this.toClientItem(item) ?? item)
    clipboardHistoryLog.debug('[clipboard:history:query-meta] Returning results', {
      meta: { count: history.length }
    })

    return normalized
  }

  public extractTags(item: IClipboardItem): string[] | undefined {
    const metaTags = item.meta?.tags
    if (Array.isArray(metaTags) && metaTags.every((tag) => typeof tag === 'string')) {
      return metaTags
    }

    if (typeof item.metadata === 'string' && item.metadata.trim().length > 0) {
      try {
        const parsed = JSON.parse(item.metadata) as { tags?: unknown }
        const tags = parsed?.tags
        if (Array.isArray(tags) && tags.every((tag) => typeof tag === 'string')) {
          return tags
        }
      } catch {}
    }

    return undefined
  }

  public async cleanupHistory(options?: {
    beforeDays?: number
    type?: 'all' | 'text' | 'image' | 'files'
  }): Promise<{ removedCount: number }> {
    if (!this.db) return { removedCount: 0 }

    const conditions: Array<ReturnType<typeof and>> = []
    const itemType = options?.type ?? 'all'
    if (itemType !== 'all') {
      conditions.push(eq(clipboardHistory.type, itemType))
    }

    if (options?.beforeDays && Number.isFinite(options.beforeDays) && options.beforeDays > 0) {
      const cutoff = new Date(Date.now() - options.beforeDays * 24 * 60 * 60 * 1000)
      conditions.push(lt(clipboardHistory.timestamp, cutoff))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined
    const rows = await this.db.select().from(clipboardHistory).where(whereClause)
    for (const row of rows) {
      const item = row as unknown as IClipboardItem
      if (
        item.type === 'image' &&
        typeof item.content === 'string' &&
        isLikelyLocalPath(item.content)
      ) {
        this.deleteImageFile(item.content)
      }
    }

    await this.db.delete(clipboardHistory).where(whereClause)
    this.memoryCache = this.memoryCache.filter((item) => {
      const forget = (): false => {
        this.forgetFreshness(item.id)
        return false
      }

      if (itemType !== 'all' && item.type !== itemType) return true
      if (options?.beforeDays && item.timestamp) {
        const ts =
          item.timestamp instanceof Date
            ? item.timestamp.getTime()
            : new Date(item.timestamp).getTime()
        const cutoff = Date.now() - options.beforeDays * 24 * 60 * 60 * 1000
        return ts >= cutoff ? true : forget()
      }
      return forget()
    })
    this.notifyChange()

    return { removedCount: rows.length }
  }

  public toClientItem(item: IClipboardItem | null): IClipboardItem | null {
    if (!item) return null

    if (item.type !== 'image') {
      return { ...item }
    }

    const meta = { ...(item.meta ?? {}) } as Record<string, unknown>
    const rawContent = typeof item.content === 'string' ? item.content : ''

    const localContentPath = isLikelyLocalPath(rawContent) ? resolveLocalFilePath(rawContent) : null
    const originalPath =
      localContentPath && this.isWithinTempBaseDir(localContentPath) ? localContentPath : undefined
    const originalAsset = originalPath ? this.normalizeRenderableSource(originalPath) : null
    const originalUrl =
      originalAsset && !('missing' in originalAsset) ? originalAsset.value : undefined

    meta.image_original_url = originalUrl ?? meta.image_original_url
    meta.image_content_kind = 'preview'
    for (const key of ['image_original_url', 'image_preview_url']) {
      const value = meta[key]
      if (typeof value !== 'string' || !value.trim()) continue
      const normalized = this.normalizeRenderableSource(value)
      if ('missing' in normalized) {
        delete meta[key]
        continue
      }
      meta[key] = normalized.value
    }

    const content =
      typeof item.thumbnail === 'string' && item.thumbnail.length > 0
        ? item.thumbnail
        : (originalUrl ?? (isDataUrl(rawContent) ? rawContent : ''))

    return {
      ...item,
      content,
      meta
    }
  }

  private toClipboardQueryRequest(
    request: ClipboardQueryRequest | null | undefined
  ): ClipboardQueryRequest {
    return {
      page: Number.isFinite(request?.page) ? Number(request?.page) : undefined,
      pageSize: Number.isFinite(request?.pageSize) ? Number(request?.pageSize) : undefined,
      limit: Number.isFinite(request?.limit) ? Number(request?.limit) : undefined,
      keyword: typeof request?.keyword === 'string' ? request.keyword : undefined,
      startTime: typeof request?.startTime === 'number' ? request.startTime : undefined,
      endTime: typeof request?.endTime === 'number' ? request.endTime : undefined,
      type:
        request?.type === 'all' ||
        request?.type === 'favorite' ||
        request?.type === 'text' ||
        request?.type === 'image' ||
        request?.type === 'files'
          ? request.type
          : undefined,
      isFavorite: typeof request?.isFavorite === 'boolean' ? request.isFavorite : undefined,
      sourceApp: typeof request?.sourceApp === 'string' ? request.sourceApp : undefined,
      sortOrder:
        request?.sortOrder === 'asc' ? 'asc' : request?.sortOrder === 'desc' ? 'desc' : undefined
    }
  }

  public async queryClipboardHistory(
    request: ClipboardQueryRequest | ClipboardHistoryQueryInput | null | undefined
  ): Promise<{
    rows: IClipboardItem[]
    total: number
    page: number
    limit: number
  }> {
    const normalized = this.toClipboardQueryRequest(request)
    const page = Number.isFinite(normalized.page) ? Math.max(1, Number(normalized.page)) : 1
    const requestedLimit = Number.isFinite(normalized.pageSize)
      ? Number(normalized.pageSize)
      : Number.isFinite(normalized.limit)
        ? Number(normalized.limit)
        : PAGE_SIZE
    const limit = Math.min(Math.max(requestedLimit, 1), 100)

    if (!this.db) {
      return {
        rows: [],
        total: 0,
        page,
        limit
      }
    }

    const offset = (page - 1) * limit
    const conditions: SQL<unknown>[] = []

    if (normalized.keyword && normalized.keyword.trim().length > 0) {
      const keywordPattern = `%${normalized.keyword.trim()}%`
      const keywordCondition = or(
        sql`${clipboardHistory.content} LIKE ${keywordPattern}`,
        sql`COALESCE(${clipboardHistory.rawContent}, '') LIKE ${keywordPattern}`,
        sql`COALESCE(${clipboardHistory.metadata}, '') LIKE ${keywordPattern}`
      )
      if (keywordCondition) {
        conditions.push(keywordCondition)
      }
    }

    if (typeof normalized.startTime === 'number') {
      conditions.push(sql`${clipboardHistory.timestamp} >= ${new Date(normalized.startTime)}`)
    }

    if (typeof normalized.endTime === 'number') {
      conditions.push(sql`${clipboardHistory.timestamp} <= ${new Date(normalized.endTime)}`)
    }

    if (normalized.type === 'favorite') {
      conditions.push(eq(clipboardHistory.isFavorite, true))
    } else if (
      normalized.type === 'text' ||
      normalized.type === 'image' ||
      normalized.type === 'files'
    ) {
      conditions.push(eq(clipboardHistory.type, normalized.type))
    }

    if (typeof normalized.isFavorite === 'boolean') {
      conditions.push(eq(clipboardHistory.isFavorite, normalized.isFavorite))
    }

    if (typeof normalized.sourceApp === 'string') {
      conditions.push(eq(clipboardHistory.sourceApp, normalized.sourceApp))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined
    const orderClause =
      normalized.sortOrder === 'asc' ? clipboardHistory.timestamp : desc(clipboardHistory.timestamp)

    const selectedRows = await this.db
      .select()
      .from(clipboardHistory)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset)

    const rows = (await this.hydrateWithMeta(selectedRows)) as IClipboardItem[]
    const totalResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(clipboardHistory)
      .where(whereClause)
    const total = totalResult[0]?.count ?? 0

    return { rows, total, page, limit }
  }

  public patchCachedMeta(clipboardId: number, patch: Record<string, unknown>): void {
    const index = this.memoryCache.findIndex((entry) => entry.id === clipboardId)
    if (index === -1) return

    const current = this.memoryCache[index]
    const nextMeta = { ...(current.meta ?? {}), ...patch }
    const metadata = mergeClipboardMetadataString(current.metadata, patch)

    this.memoryCache[index] = {
      ...current,
      meta: nextMeta,
      metadata
    }
  }

  public updateCachedSource(clipboardId: number, sourceApp: string | null): void {
    const index = this.memoryCache.findIndex((entry) => entry.id === clipboardId)
    if (index === -1) return

    this.memoryCache[index] = {
      ...this.memoryCache[index],
      sourceApp
    }
  }

  public async setFavorite(request: ClipboardSetFavoriteLike): Promise<void> {
    const id = Number(request?.id)
    if (!this.db || !Number.isFinite(id)) return
    await this.db
      .update(clipboardHistory)
      .set({ isFavorite: request.isFavorite })
      .where(eq(clipboardHistory.id, id))

    const cached = this.memoryCache.find((item) => item.id === id)
    if (cached) {
      cached.isFavorite = request.isFavorite
      this.notifyChange()
    }
  }

  public async deleteItem(request: ClipboardDeleteRequest): Promise<void> {
    const id = Number(request?.id)
    if (!this.db || !Number.isFinite(id)) return
    try {
      const [row] = await this.db
        .select()
        .from(clipboardHistory)
        .where(eq(clipboardHistory.id, id))
        .limit(1)
      const item = row as unknown as IClipboardItem | undefined
      if (
        item?.type === 'image' &&
        typeof item.content === 'string' &&
        isLikelyLocalPath(item.content)
      ) {
        this.deleteImageFile(item.content)
      }
    } catch (error) {
      clipboardHistoryLog.warn('Failed to delete clipboard image file before record removal', {
        error
      })
    }
    await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, id))
    this.memoryCache = this.memoryCache.filter((item) => item.id !== id)
    this.forgetFreshness(id)
    this.notifyChange()
  }

  public async getImageUrl(
    request: ClipboardGetImageUrlRequest
  ): Promise<ClipboardGetImageUrlResponse> {
    const id = Number(request?.id)
    if (!Number.isFinite(id)) {
      return { url: null }
    }

    const item = await this.getItemById(id)
    if (!item || item.type !== 'image') {
      return { url: null }
    }

    const normalized = this.toClientItem(item) ?? item
    const meta = normalized.meta
    if (meta && typeof meta === 'object') {
      const imageUrl = (meta as Record<string, unknown>).image_original_url
      if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        return { url: imageUrl.trim() }
      }
    }

    const content = typeof normalized.content === 'string' ? normalized.content : ''
    if (content.startsWith('tfile://')) {
      return { url: content }
    }

    return { url: null }
  }
}

interface ClipboardSetFavoriteLike {
  id?: number
  isFavorite: boolean
}
