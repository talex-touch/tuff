import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { LogOptions } from '../../utils/logger'
import type { IClipboardItem } from './clipboard-history-persistence'
import { eq } from 'drizzle-orm'
import { classifyClipboardContent } from '@talex-touch/utils/clipboard'
import { clipboardHistory } from '../../db/schema'
import { resolveAppSemanticAliases } from '../box-tool/addon/apps/app-semantic-catalog'
import type { ClipboardMetaEntry, ClipboardMetaPersistence } from './clipboard-meta-persistence'

/** 与采集侧同一个时长。M4 会把两处一起接成可配置。 */
const VERIFICATION_CODE_RETENTION_MS = 60 * 60 * 1000

export interface ClipboardActiveAppSnapshot {
  bundleId?: string | null
  identifier?: string | null
  displayName?: string | null
  processId?: number | null
  executablePath?: string | null
  icon?: unknown | null
}

export interface ClipboardStageBJob {
  generation: number
  clipboardId: number
  item: IClipboardItem
  formats: string[]
}

export interface ClipboardStageBEnrichmentOptions {
  getDatabase: () => LibSQLDatabase<typeof schema> | undefined
  getCachedItemById: (clipboardId: number) => IClipboardItem | undefined
  getActiveAppSnapshot: () => ClipboardActiveAppSnapshot | null
  getAppLanguageHint: () => string | undefined
  getLatestGeneration: () => number
  enqueueOcr: (job: {
    clipboardId: number
    item: IClipboardItem
    formats: string[]
    languageHint?: string
  }) => Promise<void>
  patchCachedMeta: (clipboardId: number, patch: Record<string, unknown>) => void
  updateCachedSource: (clipboardId: number, sourceApp: string | null) => void
  metaPersistence: ClipboardMetaPersistence
  logWarn: (message: string, data?: LogOptions) => void
  logDebug: (message: string, data?: LogOptions) => void
}

function mergeMetadataString(
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

export function buildActiveAppSourcePatch(
  activeApp: ClipboardActiveAppSnapshot,
  fallbackSourceApp?: string | null
): {
  sourceApp: string | null
  patch: Record<string, unknown>
  entries: ClipboardMetaEntry[]
} {
  const sourceApp =
    activeApp.bundleId || activeApp.identifier || activeApp.displayName || fallbackSourceApp || null
  const sourceMeta = {
    bundleId: activeApp.bundleId ?? null,
    displayName: activeApp.displayName ?? null,
    processId: activeApp.processId ?? null,
    executablePath: activeApp.executablePath ?? null,
    icon: activeApp.icon ?? null
  }
  const sourceSearchTerms = resolveAppSemanticAliases({
    name: activeApp.displayName ?? undefined,
    displayName: activeApp.displayName ?? undefined,
    bundleId: activeApp.bundleId ?? activeApp.identifier ?? undefined,
    path: activeApp.executablePath ?? undefined
  })
  const patch: Record<string, unknown> = {
    source: sourceMeta,
    ...(sourceSearchTerms.length > 0 ? { source_search_terms: sourceSearchTerms } : {})
  }
  for (const [key, value] of Object.entries(sourceMeta)) {
    if (value !== null && value !== undefined) {
      patch[`source_${key}`] = value
    }
  }

  return {
    sourceApp,
    patch,
    entries: Object.entries(patch).map(([key, value]) => ({ key, value }))
  }
}

export class ClipboardStageBEnrichment {
  constructor(private readonly options: ClipboardStageBEnrichmentOptions) {}

  public async process(job: ClipboardStageBJob): Promise<void> {
    if (job.generation < this.options.getLatestGeneration()) {
      return
    }
    if (!job.item.id) return

    try {
      await this.options.enqueueOcr({
        clipboardId: job.item.id,
        item: job.item,
        formats: job.formats,
        languageHint: this.options.getAppLanguageHint()
      })
    } catch (error) {
      this.options.logWarn('Failed to enqueue clipboard OCR', { error })
    }

    const activeApp = this.options.getActiveAppSnapshot()
    if (!activeApp) {
      return
    }

    if (job.generation < this.options.getLatestGeneration()) {
      return
    }

    const { sourceApp, patch, entries } = buildActiveAppSourcePatch(activeApp, job.item.sourceApp)

    /**
     * 来源应用是验证码判定的第三条判据，而它到这一步才解析出来——采集时看到的只是一串
     * 数字，没有任何依据把它和订单号区分开。所以这里重跑一次分类：只有当它现在被认成
     * 验证码、且还没有过期时刻时才写，别的分类结果都不动。
     *
     * 只往「更早过期」的方向改。重跑的结果如果没命中，采集时定下的档位保持不变——
     * 一次判定失误不应该让一条已经受保护的记录失去保护。
     */
    const rescored =
      job.item.type === 'text' && sourceApp
        ? classifyClipboardContent({
            type: 'text',
            content: job.item.content,
            rawContent: job.item.rawContent ?? null,
            sourceApp
          })
        : null
    const expiresAt =
      rescored?.retentionClass === 'verification-code'
        ? new Date(Date.now() + VERIFICATION_CODE_RETENTION_MS)
        : null

    const db = this.options.getDatabase()
    if (db) {
      try {
        const current = this.options.getCachedItemById(job.clipboardId)
        const nextMetadata = mergeMetadataString(current?.metadata, patch)
        await this.options.metaPersistence.withDbWrite(
          'clipboard.stage-b.source',
          (writeDb) =>
            writeDb
              .update(clipboardHistory)
              .set({
                sourceApp,
                metadata: nextMetadata,
                ...(expiresAt ? { retentionExpiresAt: expiresAt } : {})
              })
              .where(eq(clipboardHistory.id, job.clipboardId)),
          { dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
        )
      } catch (error) {
        this.options.logDebug('Clipboard stage-b source update skipped', { error })
      }
    }

    this.options.patchCachedMeta(job.clipboardId, patch)
    this.options.updateCachedSource(job.clipboardId, sourceApp)
    this.options.metaPersistence.persistMetaEntriesSafely(job.clipboardId, patch, entries, {
      dropPolicy: 'drop',
      maxQueueWaitMs: 10_000
    })
  }
}
