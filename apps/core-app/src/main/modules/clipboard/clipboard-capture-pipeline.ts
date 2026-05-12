import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NativeImage } from 'electron'
import type * as schema from '../../db/schema'
import type { LogOptions } from '../../utils/logger'
import type { ClipboardFreshnessState } from './clipboard-freshness'
import type { ClipboardImagePersistence } from './clipboard-image-persistence'
import type { ClipboardMetaEntry, ClipboardMetaPersistence } from './clipboard-meta-persistence'
import type { IClipboardItem } from './clipboard-history-persistence'
import { performance } from 'node:perf_hooks'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { clipboard } from 'electron'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { clipboardHistory } from '../../db/schema'
import { enterPerfContext } from '../../utils/perf-context'
import { perfMonitor } from '../../utils/perf-monitor'
import { windowManager } from '../box-tool/core-box/window'
import { detectClipboardTags } from '../clipboard-tagging'
import {
  CLIPBOARD_HTML_FORMATS,
  CLIPBOARD_IMAGE_FORMATS,
  CLIPBOARD_TEXT_FORMATS,
  ClipboardHelper,
  includesAnyClipboardFormat
} from './clipboard-capture-freshness'
import {
  buildPhaseDiagnostics,
  summarizePhaseDurations,
  toPerfSeverity,
  trackPhase,
  trackPhaseAsync,
  type ClipboardPhaseDurations
} from './clipboard-phase-diagnostics'
import { createClipboardFreshnessState } from './clipboard-freshness'

const CLIPBOARD_META_QUEUE_LIMIT = 6
const CLIPBOARD_SLOW_THRESHOLD_MS = 200
const CLIPBOARD_COOLDOWN_TRIGGER_MS = 500
const CLIPBOARD_COOLDOWN_BASE_MS = 800
const CLIPBOARD_COOLDOWN_MAX_MS = 3000
const CLIPBOARD_IMAGE_PERSIST_DEBOUNCE_MS = 2000
const CLIPBOARD_POLL_TASK_ID = 'clipboard.monitor'

export interface ClipboardCapturePipelineOptions {
  getDatabase: () => LibSQLDatabase<typeof schema> | undefined
  getClipboardHelper: () => ClipboardHelper | undefined
  getLastSuccessfulScanAt: () => number | null
  getLastImagePersistAt: () => number
  getTransport: () => ITuffTransportMain | null
  imagePersistence: ClipboardImagePersistence
  metaPersistence: ClipboardMetaPersistence
  rememberFreshness: (item: IClipboardItem, freshness: ClipboardFreshnessState) => void
  updateMemoryCache: (item: IClipboardItem) => void
  notifyTransportChange: () => void
  enqueueStageB: (job: { clipboardId: number; item: IClipboardItem; formats: string[] }) => void
  shouldLogMetaQueuePressure: (now: number) => boolean
  setLastSuccessfulScanAt: (value: number) => void
  setLastImagePersistAt: (value: number) => void
  setCooldownUntil: (value: number) => void
  setTaskMeta: (meta: Record<string, unknown>) => void
  logInfo: (message: string, data?: LogOptions) => void
  logWarn: (message: string, data?: LogOptions) => void
}

type PendingClipboardItem = Omit<IClipboardItem, 'timestamp' | 'id' | 'metadata' | 'meta'>

export class ClipboardCapturePipeline {
  constructor(private readonly options: ClipboardCapturePipelineOptions) {}

  public async process(source: ClipboardCaptureSource): Promise<void> {
    const helper = this.options.getClipboardHelper()
    const db = this.options.getDatabase()
    if (!helper || !db) {
      return
    }

    const dispose = enterPerfContext('Clipboard.check', { task: 'poll' })
    const startAt = performance.now()
    const phaseDurations: ClipboardPhaseDurations = {}
    const observedAt = Date.now()
    const previousScanAt = this.options.getLastSuccessfulScanAt()
    try {
      await this.captureAndPersist({
        db,
        helper,
        source,
        observedAt,
        previousScanAt,
        phaseDurations
      })
    } finally {
      this.options.setLastSuccessfulScanAt(observedAt)
      this.recordCompletionDiagnostics({
        startAt,
        phaseDurations
      })
      dispose()
    }
  }

  private async captureAndPersist({
    db,
    helper,
    source,
    observedAt,
    previousScanAt,
    phaseDurations
  }: {
    db: LibSQLDatabase<typeof schema>
    helper: ClipboardHelper
    source: ClipboardCaptureSource
    observedAt: number
    previousScanAt: number | null
    phaseDurations: ClipboardPhaseDurations
  }): Promise<void> {
    trackPhase(phaseDurations, 'helper.bootstrap', () => {
      helper.bootstrap()
    })

    const formats = trackPhase(phaseDurations, 'clipboard.availableFormats', () => {
      return clipboard.availableFormats()
    })
    if (formats.length === 0) {
      return
    }

    const sortedFormats = trackPhase(phaseDurations, 'signature.sortFormats', () => {
      return [...formats].sort()
    })
    const formatsKey = trackPhase(phaseDurations, 'signature.formatsKey', () => {
      return sortedFormats.join(',')
    })
    const hasFileFormats = helper.hasFileFormats(formats)
    const hasImageFormats = includesAnyClipboardFormat(formats, CLIPBOARD_IMAGE_FORMATS)
    const hasTextFormats = includesAnyClipboardFormat(formats, CLIPBOARD_TEXT_FORMATS)
    const hasHtmlFormats = includesAnyClipboardFormat(formats, CLIPBOARD_HTML_FORMATS)
    let prefetchedText: string | undefined
    let prefetchedFiles: string[] | undefined
    let prefetchedImage: NativeImage | null | undefined

    const readPrefetchedText = (): string => {
      if (prefetchedText !== undefined) return prefetchedText
      prefetchedText = trackPhase(phaseDurations, 'clipboard.readText', () => clipboard.readText())
      return prefetchedText
    }

    const readPrefetchedFiles = (): string[] => {
      if (prefetchedFiles !== undefined) return prefetchedFiles
      prefetchedFiles = trackPhase(phaseDurations, 'clipboard.readFiles', () =>
        helper.readClipboardFiles()
      )
      return prefetchedFiles
    }

    const readPrefetchedImage = (): NativeImage | null => {
      if (prefetchedImage !== undefined) return prefetchedImage
      if (!hasImageFormats) {
        prefetchedImage = null
        return prefetchedImage
      }
      const image = trackPhase(phaseDurations, 'clipboard.readImage', () => clipboard.readImage())
      prefetchedImage = image.isEmpty() ? null : image
      return prefetchedImage
    }

    const quickTextSignature = hasTextFormats
      ? trackPhase(phaseDurations, 'signature.textQuick', () =>
          helper.getTextQuickSignature(readPrefetchedText())
        )
      : '0:0'
    const quickFilesSignature = hasFileFormats
      ? trackPhase(phaseDurations, 'signature.filesQuick', () =>
          helper.getFilesQuickSignature(readPrefetchedFiles())
        )
      : '0:0'
    const quickImageSignature = hasImageFormats
      ? trackPhase(phaseDurations, 'signature.imageQuick', () =>
          helper.getImageQuickSignature(readPrefetchedImage())
        )
      : ''
    const quickHash = trackPhase(phaseDurations, 'signature.hashBuild', () => {
      return `${formatsKey}|t:${quickTextSignature}|f:${quickFilesSignature}|i:${quickImageSignature}`
    })

    const sameFormats = helper.lastFormats.length > 0 && helper.lastFormatsKey === formatsKey
    if (sameFormats && helper.lastChangeHash === quickHash) {
      return
    }

    helper.lastFormats = sortedFormats
    helper.lastFormatsKey = formatsKey
    helper.lastChangeHash = quickHash

    const metaEntries: ClipboardMetaEntry[] = [
      { key: 'formats', value: formats },
      { key: 'capture_source', value: source },
      { key: 'observed_at', value: observedAt }
    ]
    let item: PendingClipboardItem | null = null
    let cachedImage: NativeImage | null = hasImageFormats ? readPrefetchedImage() : null

    if (hasFileFormats) {
      const files = readPrefetchedFiles()
      item = this.tryBuildFilesItem({
        helper,
        files,
        cachedImage,
        phaseDurations,
        metaEntries
      })
    }

    if (!item && cachedImage) {
      const imageItem = await this.tryBuildImageItem({
        helper,
        image: cachedImage,
        phaseDurations,
        metaEntries
      })
      cachedImage = imageItem.cachedImage
      item = imageItem.item
    }

    if (!item && hasTextFormats) {
      item = this.tryBuildTextItem({
        helper,
        hasHtmlFormats,
        readPrefetchedText,
        phaseDurations,
        metaEntries
      })
    }

    if (!item) {
      return
    }

    const metaObject = this.buildMetaObject({
      item,
      metaEntries,
      source,
      observedAt,
      previousScanAt,
      phaseDurations
    })
    const freshness = createClipboardFreshnessState({
      source,
      observedAt,
      previousScanAt
    })
    metaObject.auto_paste_eligible = freshness.eligible
    metaEntries.push({ key: 'auto_paste_eligible', value: freshness.eligible })

    const metadataPayload = trackPhase(phaseDurations, 'meta.stringify', () => {
      return Object.keys(metaObject).length > 0 ? JSON.stringify(metaObject) : null
    })
    const record = {
      ...item,
      metadata: metadataPayload,
      timestamp: new Date()
    }

    if (
      item.type === 'image' &&
      Date.now() - this.options.getLastImagePersistAt() < CLIPBOARD_IMAGE_PERSIST_DEBOUNCE_MS
    ) {
      return
    }

    await this.yieldBeforePersist(phaseDurations)

    const persisted = await this.persistRecord({
      db,
      item,
      record,
      phaseDurations
    })
    if (!persisted) {
      return
    }

    persisted.meta = metaObject
    this.options.rememberFreshness(persisted, freshness)
    if (persisted.type === 'image') {
      this.options.setLastImagePersistAt(Date.now())
    }

    if (persisted.id) {
      this.persistMetaAndEnqueueStageB({
        persisted,
        metaObject,
        metaEntries,
        formats
      })
    }

    this.options.updateMemoryCache(persisted)
    this.options.notifyTransportChange()
    this.forwardClipboardChangeToPlugin(persisted)
  }

  private tryBuildFilesItem({
    helper,
    files,
    cachedImage,
    phaseDurations,
    metaEntries
  }: {
    helper: ClipboardHelper
    files: string[]
    cachedImage: NativeImage | null
    phaseDurations: ClipboardPhaseDurations
    metaEntries: ClipboardMetaEntry[]
  }): PendingClipboardItem | null {
    if (!trackPhase(phaseDurations, 'diff.files', () => helper.didFilesChange(files))) {
      return null
    }

    const serialized = trackPhase(phaseDurations, 'files.serialize', () => JSON.stringify(files))
    let thumbnail: string | undefined
    let imageSize: { width: number; height: number } | undefined

    if (cachedImage) {
      const currentImage = cachedImage
      trackPhase(phaseDurations, 'image.prime', () => {
        helper.primeImage(currentImage)
      })
      imageSize = trackPhase(phaseDurations, 'image.size', () => currentImage.getSize())
      thumbnail = trackPhase(phaseDurations, 'image.thumbnail', () => {
        return currentImage.resize({ width: 128 }).toDataURL()
      })
      this.options.logInfo('File with thumbnail detected', {
        meta: { width: imageSize.width, height: imageSize.height }
      })
    } else {
      trackPhase(phaseDurations, 'image.prime', () => {
        helper.primeImage(null)
      })
    }

    trackPhase(phaseDurations, 'text.markEmpty', () => {
      helper.markText('')
    })
    metaEntries.push({ key: 'file_count', value: files.length })
    metaEntries.push({ key: 'has_sidecar_image', value: Boolean(thumbnail) })
    if (imageSize) {
      metaEntries.push({ key: 'image_size', value: imageSize })
    }
    return {
      type: 'files',
      content: serialized,
      thumbnail
    }
  }

  private async tryBuildImageItem({
    helper,
    image,
    phaseDurations,
    metaEntries
  }: {
    helper: ClipboardHelper
    image: NativeImage
    phaseDurations: ClipboardPhaseDurations
    metaEntries: ClipboardMetaEntry[]
  }): Promise<{ item: PendingClipboardItem | null; cachedImage: NativeImage | null }> {
    if (!trackPhase(phaseDurations, 'diff.image', () => helper.didImageChange(image))) {
      return { item: null, cachedImage: image }
    }

    trackPhase(phaseDurations, 'text.markEmpty', () => {
      helper.markText('')
    })
    const size = trackPhase(phaseDurations, 'image.size', () => image.getSize())
    metaEntries.push({ key: 'image_size', value: size })

    const thumbnail = trackPhase(phaseDurations, 'image.thumbnail', () => {
      return image.resize({ width: 128 }).toDataURL()
    })

    await trackPhaseAsync(
      phaseDurations,
      'eventLoop.yieldBeforeImageEncode',
      async () =>
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
    )

    const png = trackPhase(phaseDurations, 'image.encodePng', () => image.toPNG())
    const stored = await trackPhaseAsync(phaseDurations, 'image.persistTempFile', async () => {
      return await this.options.imagePersistence.createClipboardImageFile(png)
    })
    metaEntries.push({ key: 'image_file_path', value: stored.path })
    metaEntries.push({ key: 'image_file_size', value: stored.sizeBytes })
    return {
      cachedImage: null,
      item: {
        type: 'image',
        content: stored.path,
        thumbnail
      }
    }
  }

  private tryBuildTextItem({
    helper,
    hasHtmlFormats,
    readPrefetchedText,
    phaseDurations,
    metaEntries
  }: {
    helper: ClipboardHelper
    hasHtmlFormats: boolean
    readPrefetchedText: () => string
    phaseDurations: ClipboardPhaseDurations
    metaEntries: ClipboardMetaEntry[]
  }): PendingClipboardItem | null {
    const text = readPrefetchedText()
    if (!trackPhase(phaseDurations, 'diff.text', () => helper.didTextChange(text))) {
      return null
    }

    const html = hasHtmlFormats
      ? trackPhase(phaseDurations, 'clipboard.readHTML', () => clipboard.readHTML())
      : ''
    metaEntries.push({ key: 'text_length', value: text.length })
    if (html) {
      metaEntries.push({ key: 'html_length', value: html.length })
    }
    return {
      type: 'text',
      content: text,
      rawContent: html || null
    }
  }

  private buildMetaObject({
    item,
    metaEntries,
    phaseDurations
  }: {
    item: PendingClipboardItem
    metaEntries: ClipboardMetaEntry[]
    source: ClipboardCaptureSource
    observedAt: number
    previousScanAt: number | null
    phaseDurations: ClipboardPhaseDurations
  }): Record<string, unknown> {
    const tags = trackPhase(phaseDurations, 'tags.detect', () =>
      detectClipboardTags({
        type: item.type,
        content: item.content,
        rawContent: item.rawContent ?? null
      })
    )
    if (tags.length > 0) {
      metaEntries.push({ key: 'tags', value: tags })
      for (const tag of tags) {
        metaEntries.push({ key: 'tag', value: tag })
      }
    }

    const metaObject: Record<string, unknown> = {}
    for (const { key, value } of metaEntries) {
      if (value === undefined) continue
      if (key === 'tag') continue
      metaObject[key] = value
    }
    return metaObject
  }

  private async yieldBeforePersist(phaseDurations: ClipboardPhaseDurations): Promise<void> {
    await trackPhaseAsync(
      phaseDurations,
      'eventLoop.yieldBeforePersist',
      async () =>
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
    )
  }

  private async persistRecord({
    db,
    item,
    record,
    phaseDurations
  }: {
    db: LibSQLDatabase<typeof schema>
    item: PendingClipboardItem
    record: PendingClipboardItem & { metadata: string | null; timestamp: Date }
    phaseDurations: ClipboardPhaseDurations
  }): Promise<IClipboardItem | null> {
    const persistContext = enterPerfContext('Clipboard.persist', { type: item.type })
    const persistStart = performance.now()
    let inserted: IClipboardItem[] = []
    try {
      const queueStats = dbWriteScheduler.getStats()
      inserted = await trackPhaseAsync(phaseDurations, 'db.persistInsert', async () => {
        return await this.options.metaPersistence.withDbWrite('clipboard.persist', () =>
          db.insert(clipboardHistory).values(record).returning()
        )
      })
      const persistDuration = performance.now() - persistStart
      if (persistDuration > 200) {
        const contentLength = typeof item.content === 'string' ? item.content.length : 0
        const thumbnailLength = typeof item.thumbnail === 'string' ? item.thumbnail.length : 0
        this.options.logWarn('Clipboard persist slow', {
          meta: {
            durationMs: Math.round(persistDuration),
            type: item.type,
            queued: queueStats.queued,
            processing: queueStats.processing,
            currentTaskLabel: queueStats.currentTaskLabel,
            contentLength,
            thumbnailLength
          }
        })
      }
    } finally {
      persistContext()
    }
    return inserted.length > 0 ? (inserted[0] as IClipboardItem) : null
  }

  private persistMetaAndEnqueueStageB({
    persisted,
    metaObject,
    metaEntries,
    formats
  }: {
    persisted: IClipboardItem
    metaObject: Record<string, unknown>
    metaEntries: ClipboardMetaEntry[]
    formats: string[]
  }): void {
    if (!persisted.id) return

    const queueStats = dbWriteScheduler.getStats()
    if (queueStats.queued >= CLIPBOARD_META_QUEUE_LIMIT) {
      const now = Date.now()
      if (this.options.shouldLogMetaQueuePressure(now)) {
        this.options.logWarn('Clipboard meta skipped (queue pressure)', {
          meta: { queued: queueStats.queued }
        })
      }
    } else {
      this.options.metaPersistence.persistMetaEntriesSafely(persisted.id, metaObject, metaEntries, {
        dropPolicy: 'drop',
        maxQueueWaitMs: 10_000
      })
    }
    this.options.enqueueStageB({
      clipboardId: persisted.id,
      item: persisted,
      formats
    })
  }

  private forwardClipboardChangeToPlugin(persisted: IClipboardItem): void {
    const activePlugin = windowManager.getAttachedPlugin()
    if (
      activePlugin?._uniqueChannelKey &&
      windowManager.shouldForwardClipboardChange(persisted.type)
    ) {
      this.options
        .getTransport()
        ?.sendToPlugin(activePlugin.name, CoreBoxEvents.clipboard.change, { item: persisted })
        .catch(() => {})
        .catch((error) => {
          this.options.logWarn('Failed to notify plugin UI view about clipboard change', { error })
        })
    }
  }

  private recordCompletionDiagnostics({
    startAt,
    phaseDurations
  }: {
    startAt: number
    phaseDurations: ClipboardPhaseDurations
  }): void {
    const duration = performance.now() - startAt
    const roundedDurationMs = Math.round(duration)
    const phaseSummaryMap = summarizePhaseDurations(phaseDurations)
    const phaseDiagnostics = buildPhaseDiagnostics(phaseDurations, roundedDurationMs)
    let cooldownMs = 0
    if (duration > CLIPBOARD_COOLDOWN_TRIGGER_MS) {
      cooldownMs = Math.min(
        CLIPBOARD_COOLDOWN_MAX_MS,
        Math.max(CLIPBOARD_COOLDOWN_BASE_MS, Math.round(duration))
      )
      this.options.setCooldownUntil(Date.now() + cooldownMs)
    } else {
      this.options.setCooldownUntil(0)
    }

    this.options.setTaskMeta({
      durationMs: roundedDurationMs,
      cooldownMs,
      slowestPhase: phaseDiagnostics.slowestPhase ?? 'none',
      slowestPhaseMs: phaseDiagnostics.slowestPhaseMs,
      phaseAlertLevel: phaseDiagnostics.phaseAlertLevel,
      phaseAlertCode: phaseDiagnostics.phaseAlertCode,
      phaseDurations: phaseSummaryMap
    })

    if (duration > CLIPBOARD_SLOW_THRESHOLD_MS) {
      const severity = toPerfSeverity(phaseDiagnostics.phaseAlertLevel)
      if (severity) {
        perfMonitor.recordMainReport({
          kind: 'clipboard.check.slow',
          eventName: phaseDiagnostics.phaseAlertCode,
          durationMs: roundedDurationMs,
          level: severity,
          meta: {
            cooldownMs,
            phaseAlertLevel: phaseDiagnostics.phaseAlertLevel,
            slowestPhase: phaseDiagnostics.slowestPhase ?? 'none',
            slowestPhaseMs: phaseDiagnostics.slowestPhaseMs
          }
        })
      }
      this.options.logWarn('Clipboard check slow', {
        meta: {
          durationMs: roundedDurationMs,
          cooldownMs,
          ...phaseDiagnostics
        }
      })
    }
  }
}

export { CLIPBOARD_POLL_TASK_ID }
