import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { LogOptions } from '../../utils/logger'
import type { IClipboardItem } from './clipboard-history-persistence'
import { eq } from 'drizzle-orm'
import { clipboardHistory } from '../../db/schema'
import type { ClipboardMetaEntry, ClipboardMetaPersistence } from './clipboard-meta-persistence'

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
  getLatestGeneration: () => number
  enqueueOcr: (job: {
    clipboardId: number
    item: IClipboardItem
    formats: string[]
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
  const patch: Record<string, unknown> = {
    source: sourceMeta
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
        formats: job.formats
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
    const db = this.options.getDatabase()
    if (db) {
      try {
        const current = this.options.getCachedItemById(job.clipboardId)
        const nextMetadata = mergeMetadataString(current?.metadata, patch)
        await this.options.metaPersistence.withDbWrite(
          'clipboard.stage-b.source',
          () =>
            db
              .update(clipboardHistory)
              .set({
                sourceApp,
                metadata: nextMetadata
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
