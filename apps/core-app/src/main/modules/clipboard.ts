import type { AppSetting, MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { ITuffTransportMain, StreamContext } from '@talex-touch/utils/transport/main'
import type {
  ClipboardApplyRequest,
  ClipboardChangePayload,
  ClipboardDeleteRequest,
  ClipboardItem,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NativeImage } from 'electron'
import type * as schema from '../db/schema'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { TuffInputType } from '@talex-touch/utils/transport/events/types'
import { and, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { clipboard, nativeImage, powerMonitor } from 'electron'
import { genTouchApp } from '../core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { clipboardHistory, clipboardHistoryMeta } from '../db/schema'
import { appTaskGate } from '../service/app-task-gate'
import { tempFileService } from '../service/temp-file.service'
import { createLogger } from '../utils/logger'
import { enterPerfContext } from '../utils/perf-context'
import { BaseModule } from './abstract-base-module'
import { coreBoxManager } from './box-tool/core-box/manager'
import { windowManager } from './box-tool/core-box/window'
import { detectClipboardTags } from './clipboard-tagging'
import { databaseModule } from './database'
import { ocrService } from './ocr/ocr-service'
import { activeAppService } from './system/active-app'
import { getMainConfig, isMainStorageReady, subscribeMainConfig } from './storage'

const clipboardLog = createLogger('Clipboard')
const coreBoxClipboardChangeEvent = defineRawEvent<{ item: IClipboardItem }, void>(
  'core-box:clipboard-change'
)
const clipboardLegacyGetHistoryEvent = defineRawEvent<
  ClipboardLegacyHistoryRequest,
  ClipboardLegacyHistoryResponse
>('clipboard:get-history')
const clipboardLegacySetFavoriteEvent = defineRawEvent<{ id: number; isFavorite: boolean }, void>(
  'clipboard:set-favorite'
)
const clipboardLegacyDeleteItemEvent = defineRawEvent<{ id: number }, void>('clipboard:delete-item')
const clipboardLegacyClearHistoryEvent = defineRawEvent<void, void>('clipboard:clear-history')
const clipboardLegacyApplyToActiveAppEvent = defineRawEvent<
  ClipboardApplyPayload,
  { success: boolean; message?: string }
>('clipboard:apply-to-active-app')
const clipboardLegacyWriteTextEvent = defineRawEvent<{ text: string }, void>('clipboard:write-text')
const clipboardLegacyWriteEvent = defineRawEvent<ClipboardWritePayload, void>('clipboard:write')
const clipboardLegacyReadEvent = defineRawEvent<void, ClipboardReadResult>('clipboard:read')
const clipboardLegacyReadImageEvent = defineRawEvent<
  { preview?: boolean },
  ClipboardReadImageResult | null
>('clipboard:read-image')
const clipboardLegacyReadFilesEvent = defineRawEvent<void, string[]>('clipboard:read-files')
const clipboardLegacyClearEvent = defineRawEvent<void, void>('clipboard:clear')
const clipboardLegacyCopyAndPasteEvent = defineRawEvent<
  ClipboardCopyAndPastePayload,
  { success: boolean; message?: string }
>('clipboard:copy-and-paste')
const clipboardLegacyQueryEvent = defineRawEvent<ClipboardMetaQueryRequest, IClipboardItem[]>(
  'clipboard:query'
)
const clipboardLegacyNewItemEvent = defineRawEvent<IClipboardItem, void>('clipboard:new-item')
const CLIPBOARD_POLL_TASK_ID = 'clipboard.monitor'
const CLIPBOARD_VISIBLE_POLL_INTERVAL_MS = 500
const CLIPBOARD_DEFAULT_POLL_INTERVAL_MS = 5000
const pollingService = PollingService.getInstance()

const FILE_URL_FORMATS = new Set([
  'public.file-url',
  'public.file-url-multiple',
  'text/uri-list',
  'text/x-moz-url',
  'NSFilenamesPboardType',
  'com.apple.pasteboard.promised-file-url'
])

const IMAGE_FORMATS = new Set([
  'public.tiff',
  'public.png',
  'public.jpeg',
  'public.heic',
  'image/png',
  'image/jpeg',
  'image/webp',
  'NSTIFFPboardType'
])

const TEXT_FORMATS = new Set([
  'public.utf8-plain-text',
  'public.utf16-plain-text',
  'text/plain',
  'text/html',
  'public.html',
  'NSStringPboardType'
])

interface ClipboardMetaEntry {
  key: string
  value: unknown
}

interface ClipboardMetaQueryRequest {
  source?: string
  category?: string
  metaFilter?: { key: string; value?: unknown }
  limit?: number
}

interface ClipboardLegacyHistoryRequest {
  page?: number
  pageSize?: number
  keyword?: string
  startTime?: number
  endTime?: number
  type?: 'text' | 'image' | 'files'
  isFavorite?: boolean
  sourceApp?: string
  sortOrder?: 'asc' | 'desc'
}

interface ClipboardLegacyHistoryResponse {
  history: IClipboardItem[]
  total: number
  page: number
  pageSize: number
}

interface ClipboardWritePayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
}

interface ClipboardCopyAndPastePayload extends ClipboardWritePayload {
  delayMs?: number
  hideCoreBox?: boolean
}

interface ClipboardReadResult {
  text: string
  html: string
  hasImage: boolean
  hasFiles: boolean
  formats: string[]
}

interface ClipboardReadImageResult {
  dataUrl: string
  width: number
  height: number
  tfileUrl?: string
}

type ClipboardPollingIntervalOption = 1 | 3 | 5 | 10 | 15 | -1

interface ClipboardPollingLowBatteryPolicy {
  enable?: boolean
  interval?: 10 | 15
}

interface ClipboardPollingSettings {
  interval?: ClipboardPollingIntervalOption
  lowBatteryPolicy?: ClipboardPollingLowBatteryPolicy
}

function isOnBatteryPowerSafe(): boolean {
  try {
    if (typeof powerMonitor.isOnBatteryPower === 'function') {
      return powerMonitor.isOnBatteryPower()
    }
    const monitor = powerMonitor as { onBatteryPower?: boolean }
    return monitor.onBatteryPower ?? false
  } catch {
    return false
  }
}

function includesAny(formats: string[], candidates: Set<string>): boolean {
  return formats.some((format) => candidates.has(format))
}

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

interface ClipboardApplyPayload {
  item?: Partial<IClipboardItem> & { type?: IClipboardItem['type'] }
  text?: string
  html?: string | null
  type?: IClipboardItem['type']
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

const PAGE_SIZE = 20
const CACHE_MAX_COUNT = 20
const CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const execFileAsync = promisify(execFile)
const IMAGE_HASH_SIZE = 24
const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'
const CLIPBOARD_LIVE_IMAGE_NAMESPACE = 'clipboard/live-images'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID = 'clipboard.temp-images.cleanup'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000

function toTfileUrl(filePath: string): string {
  const raw = filePath?.trim()
  if (!raw) return ''

  const decodeStable = (value: string): string => {
    let decoded = value
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      } catch {
        break
      }
    }
    return decoded
  }

  const normalizeAbsolutePath = (value: string): string => {
    const normalized = value.replace(/\\/g, '/')
    if (/^\/[a-z]:\//i.test(normalized)) {
      return normalized.slice(1)
    }
    if (/^[a-z]:\//i.test(normalized)) {
      return normalized
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  let resolvedPath = raw
  if (raw.startsWith('tfile:')) {
    try {
      const parsed = new URL(raw)
      if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
        resolvedPath = decodeStable(`${parsed.hostname}:${parsed.pathname}`)
      } else {
        const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
        resolvedPath = decodeStable(merged)
      }
    } catch {
      const fallback = raw.replace(/^tfile:\/\//i, '').split(/[?#]/)[0] ?? ''
      resolvedPath = decodeStable(fallback)
    }
  } else if (raw.startsWith('file:')) {
    try {
      resolvedPath = fileURLToPath(raw)
    } catch {
      resolvedPath = raw
    }
  } else {
    resolvedPath = decodeStable(raw)
  }

  const absolutePath = normalizeAbsolutePath(resolvedPath)
  const encoded = absolutePath
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return encodeURIComponent(segment)
      }
    })
    .join('/')

  return `tfile://${encoded}`
}

function isDataUrl(value: string): boolean {
  return typeof value === 'string' && value.startsWith('data:')
}

function isLikelyLocalPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('data:') &&
    !value.startsWith('http:') &&
    !value.startsWith('https:')
  )
}

class ClipboardHelper {
  private lastText: string = ''
  public lastFormats: string[] = []
  public lastChangeHash: string = ''
  private lastImageHash: string = ''
  private lastFiles: string[] = []
  private bootstrapped = false

  public bootstrap(): void {
    if (this.bootstrapped) {
      return
    }
    this.bootstrapped = true
    try {
      this.lastText = clipboard.readText()
    } catch {
      this.lastText = ''
    }
    try {
      this.lastFormats = clipboard.availableFormats()
    } catch {
      this.lastFormats = []
    }
    const formatsKey = this.lastFormats.slice().sort().join(',')
    this.lastChangeHash = `${formatsKey}:${this.lastText.substring(0, 100)}`
    try {
      this.lastImageHash = this.getImageHash(clipboard.readImage())
    } catch {
      this.lastImageHash = ''
    }
    try {
      this.lastFiles = this.readClipboardFiles()
    } catch {
      this.lastFiles = []
    }
  }

  private getImageHash(image: NativeImage): string {
    if (!image || image.isEmpty()) return ''

    const resized = image.resize({
      width: IMAGE_HASH_SIZE,
      height: IMAGE_HASH_SIZE,
      quality: 'good'
    })

    const buffer = resized.toBitmap()
    return crypto.createHash('sha1').update(buffer).digest('hex')
  }

  /**
   * Read file paths from clipboard
   *
   * @remarks
   * Tries multiple clipboard formats in priority order:
   * 1. public.file-url - Standard macOS file URLs
   * 2. NSFilenamesPboardType - Legacy macOS format
   * 3. text/uri-list - Cross-platform format
   *
   * Filters out invalid entries like file IDs, placeholders, or malformed URLs
   *
   * Special handling: When file IDs are detected (e.g., for large video files),
   * attempts to read the actual file path from clipboard text as a fallback
   */
  public readClipboardFiles(): string[] {
    // Try multiple formats in priority order
    const formats = ['public.file-url', 'NSFilenamesPboardType', 'text/uri-list']

    let hasFileIDPlaceholder = false

    for (const format of formats) {
      try {
        const raw = clipboard.read(format).toString()
        if (!raw) continue

        clipboardLog.debug(`Raw clipboard data from ${format}`, {
          meta: { sample: raw.substring(0, 200) }
        })

        // Special handling: Check if this is plist XML format (macOS clipboard)
        if (raw.includes('<?xml') && raw.includes('<plist') && raw.includes('<string>')) {
          clipboardLog.debug('Detected plist XML format, parsing')
          const stringMatches = raw.match(/<string>([^<]+)<\/string>/g)
          if (stringMatches && stringMatches.length > 0) {
            const paths = stringMatches
              .map((match) => {
                const path = match.replace(/<string>|<\/string>/g, '').trim()
                // Validate it's a file path
                if ((path.startsWith('/') || path.includes(':\\')) && !path.includes('/id=')) {
                  clipboardLog.debug('Extracted file path from plist', { meta: { path } })
                  return path
                }
                return null
              })
              .filter((p): p is string => p !== null)

            if (paths.length > 0) {
              clipboardLog.info(`Read ${paths.length} file(s) from plist XML`)
              return paths
            }
          }
          clipboardLog.debug('No valid paths found in plist XML')
          continue
        }

        // Regular URL format processing
        const paths = raw
          .split(/\r\n|\n|\r/)
          .filter(Boolean)
          .map((url) => {
            try {
              // Skip entries that look like file IDs or placeholders
              // e.g., "file/id=65713367.75131581"
              if (url.includes('file/id=') || url.includes('/.file/id=')) {
                clipboardLog.debug('Detected file ID placeholder', { meta: { url } })
                hasFileIDPlaceholder = true
                return ''
              }

              // Try to parse as URL
              const parsedUrl = new URL(url)
              const pathname = decodeURI(parsedUrl.pathname)

              // Validate it's an actual file path
              if (!pathname || pathname === '/' || pathname.includes('/id=')) {
                clipboardLog.debug('Invalid file path from URL', { meta: { url } })
                return ''
              }

              clipboardLog.debug('Extracted file path', { meta: { pathname } })
              return pathname
            } catch {
              // If not a URL, treat as direct file path
              const trimmed = url.trim()
              // Accept paths that start with / (Unix) or contain :\ (Windows)
              const looksLikePath = trimmed.startsWith('/') || trimmed.includes(':\\')
              const isNotID = !trimmed.includes('/id=')

              if (looksLikePath && isNotID) {
                clipboardLog.debug('Using direct path', { meta: { path: trimmed } })
                return trimmed
              }

              clipboardLog.debug('Rejected as not a valid path', { meta: { value: trimmed } })
              return ''
            }
          })
          .filter(Boolean)

        if (paths.length > 0) {
          clipboardLog.info(`Read ${paths.length} file(s) from format: ${format}`)
          return paths
        } else if (hasFileIDPlaceholder) {
          clipboardLog.debug(
            'File ID placeholders detected but no valid paths - files may still be preparing'
          )
        } else {
          clipboardLog.debug(`No valid paths extracted from ${format}`)
        }
      } catch (error) {
        clipboardLog.debug(`Failed to read format ${format}`, { error })
      }
    }

    // Fallback: If file IDs detected, try to read file path from text
    if (hasFileIDPlaceholder) {
      clipboardLog.debug('Attempting to read file path from clipboard text as fallback')
      try {
        const text = clipboard.readText().trim()
        if (text && text.length > 0 && text.length < 10000) {
          // Check if text looks like a direct file path
          if (text.startsWith('/') && !text.includes('<')) {
            clipboardLog.info('Found file path in fallback text')
            return [text]
          }

          // Check if text is plist XML format (macOS clipboard format)
          if (text.includes('<plist') && text.includes('<string>')) {
            clipboardLog.debug('Detected plist XML in fallback text, parsing')
            const stringMatches = text.match(/<string>([^<]+)<\/string>/g)
            if (stringMatches && stringMatches.length > 0) {
              const paths = stringMatches
                .map((match) => {
                  const path = match.replace(/<string>|<\/string>/g, '').trim()
                  // Validate it's a file path
                  if (path.startsWith('/') || path.includes(':\\')) {
                    return path
                  }
                  return null
                })
                .filter((p): p is string => p !== null)

              if (paths.length > 0) {
                clipboardLog.info('Extracted file paths from fallback plist')
                return paths
              }
            }
          }
        }
      } catch (error) {
        clipboardLog.debug('Failed to read fallback text', { error })
      }
      clipboardLog.info('Files contain ID placeholders - skipping to avoid treating as text')
    }
    return []
  }

  public didFilesChange(nextFiles: string[]): boolean {
    if (nextFiles.length === 0) return false
    if (
      nextFiles.length === this.lastFiles.length &&
      nextFiles.every((file, index) => file === this.lastFiles[index])
    ) {
      return false
    }
    this.lastFiles = [...nextFiles]
    return true
  }

  public getLastFilesSnapshot(): string[] {
    return [...this.lastFiles]
  }

  public didImageChange(image: NativeImage): boolean {
    if (image.isEmpty()) return false
    const hash = this.getImageHash(image)
    if (hash === this.lastImageHash) return false
    this.lastImageHash = hash
    return true
  }

  public primeImage(image: NativeImage | null): void {
    this.lastImageHash = image && !image.isEmpty() ? this.getImageHash(image) : ''
  }

  public primeFiles(files: string[]): void {
    this.lastFiles = [...files]
  }

  public didTextChange(text: string): boolean {
    if (!text || text === this.lastText) return false
    this.lastText = text
    return true
  }

  public markText(text: string): void {
    this.lastText = text
  }
}

export class ClipboardModule extends BaseModule {
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private transportChangeListeners = new Set<() => void>()

  private memoryCache: IClipboardItem[] = []
  private isDestroyed = false
  private clipboardHelper?: ClipboardHelper
  private db?: LibSQLDatabase<typeof schema>
  private monitoringStarted = false
  private clipboardCheckCooldownUntil = 0
  private clipboardCheckInFlight = false
  private coreBoxVisible = false
  private currentPollIntervalMs = CLIPBOARD_DEFAULT_POLL_INTERVAL_MS
  private appSettingSnapshot: AppSetting | null = null
  private unsubscribeAppSetting: (() => void) | null = null
  private pollingSubscriptionsSetup = false
  private powerListenersSetup = false
  private readonly handlePowerStateChanged = (): void => {
    if (this.coreBoxVisible) return
    this.updateClipboardPolling()
  }
  private readonly handleAppSettingChange = (value: AppSetting): void => {
    this.appSettingSnapshot = value
    this.updateClipboardPolling()
  }
  private readonly handleCoreBoxShown = (): void => {
    this.coreBoxVisible = true
    this.updateClipboardPolling()
    setImmediate(() => {
      void this.runClipboardMonitor()
    })
  }
  private readonly handleCoreBoxHidden = (): void => {
    this.coreBoxVisible = false
    this.updateClipboardPolling()
  }
  private readonly handleAllModulesLoaded = (): void => {
    this.ensureAppSettingSubscription()
    this.updateClipboardPolling()
  }
  private activeAppCache: {
    value: Awaited<ReturnType<typeof activeAppService.getActiveApp>> | null
    fetchedAt: number
  } | null = null

  private readonly activeAppCacheTtlMs = 2000

  static key: symbol = Symbol.for('Clipboard')
  name: ModuleKey = ClipboardModule.key

  constructor() {
    super(ClipboardModule.key, {
      create: true,
      dirName: 'clipboard'
    })
  }

  private parsePollingInterval(value: unknown): ClipboardPollingIntervalOption {
    const num = typeof value === 'number' ? value : Number.NaN
    if (num === -1 || num === 1 || num === 3 || num === 5 || num === 10 || num === 15) {
      return num
    }
    return 5
  }

  private parseLowBatteryInterval(value: unknown): 10 | 15 {
    return value === 15 ? 15 : 10
  }

  private resolvePollingSettings(): ClipboardPollingSettings {
    const appSetting = this.appSettingSnapshot
    const raw = appSetting?.tools?.clipboardPolling

    const interval = this.parsePollingInterval(
      (raw as ClipboardPollingSettings | undefined)?.interval
    )
    const rawLowBattery = (raw as ClipboardPollingSettings | undefined)?.lowBatteryPolicy
    const lowBatteryPolicy: ClipboardPollingLowBatteryPolicy = {
      enable: rawLowBattery?.enable !== false,
      interval: this.parseLowBatteryInterval(rawLowBattery?.interval)
    }

    return {
      interval,
      lowBatteryPolicy
    }
  }

  private isLowBatteryState(): boolean {
    return isOnBatteryPowerSafe()
  }

  private resolveNormalPollingIntervalMs(): number {
    const settings = this.resolvePollingSettings()
    const interval = settings.interval ?? 5

    if (interval === -1) {
      return -1
    }

    const lowBatteryPolicy = settings.lowBatteryPolicy
    if (this.isLowBatteryState() && (lowBatteryPolicy?.enable ?? true)) {
      return this.parseLowBatteryInterval(lowBatteryPolicy?.interval) * 1000
    }

    return interval * 1000
  }

  private resolveTargetPollingIntervalMs(): number {
    if (this.coreBoxVisible) {
      return CLIPBOARD_VISIBLE_POLL_INTERVAL_MS
    }
    return this.resolveNormalPollingIntervalMs()
  }

  private restartClipboardPolling(intervalMs: number): void {
    if (this.isDestroyed) return
    if (!this.clipboardHelper) return

    if (pollingService.isRegistered(CLIPBOARD_POLL_TASK_ID)) {
      pollingService.unregister(CLIPBOARD_POLL_TASK_ID)
    }

    this.currentPollIntervalMs = intervalMs

    if (intervalMs < 0) {
      return
    }

    const initialDelayMs = this.coreBoxVisible ? 0 : 1000
    pollingService.register(
      CLIPBOARD_POLL_TASK_ID,
      () => {
        setImmediate(() => {
          void this.runClipboardMonitor()
        })
      },
      { interval: intervalMs, unit: 'milliseconds', initialDelayMs }
    )
    pollingService.start()
  }

  private updateClipboardPolling(force = false): void {
    const targetIntervalMs = this.resolveTargetPollingIntervalMs()
    if (!force && this.currentPollIntervalMs === targetIntervalMs) {
      return
    }
    this.restartClipboardPolling(targetIntervalMs)
  }

  private ensureAppSettingSubscription(): void {
    if (this.unsubscribeAppSetting) return
    if (!isMainStorageReady()) return

    this.appSettingSnapshot = getMainConfig(StorageList.APP_SETTING)
    this.unsubscribeAppSetting = subscribeMainConfig(StorageList.APP_SETTING, (value) => {
      this.handleAppSettingChange(value as AppSetting)
    })
  }

  private setupPollingSubscriptions(): void {
    if (this.pollingSubscriptionsSetup) return
    this.pollingSubscriptionsSetup = true

    this.ensureAppSettingSubscription()

    touchEventBus.on(TalexEvents.COREBOX_WINDOW_SHOWN, this.handleCoreBoxShown)
    touchEventBus.on(TalexEvents.COREBOX_WINDOW_HIDDEN, this.handleCoreBoxHidden)
    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, this.handleAllModulesLoaded)
  }

  private setupPowerListeners(): void {
    if (this.powerListenersSetup) return
    this.powerListenersSetup = true

    powerMonitor.on('on-ac', this.handlePowerStateChanged)
    powerMonitor.on('on-battery', this.handlePowerStateChanged)
  }

  private async hydrateWithMeta<T extends { id?: number | null; metadata?: string | null }>(
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

  private async loadInitialCache() {
    if (!this.db) return

    const dispose = enterPerfContext('Clipboard.loadInitialCache', { limit: CACHE_MAX_COUNT })
    const startAt = performance.now()
    try {
      await appTaskGate.waitForIdle()
      const rows = await this.db
        .select()
        .from(clipboardHistory)
        .orderBy(desc(clipboardHistory.timestamp))
        .limit(CACHE_MAX_COUNT)

      this.memoryCache = await this.hydrateWithMeta(rows)
    } finally {
      const duration = performance.now() - startAt
      if (duration > 200) {
        clipboardLog.warn('Clipboard cache hydrate slow', {
          meta: { durationMs: Math.round(duration) }
        })
      }
      dispose()
    }
  }

  private updateMemoryCache(item: IClipboardItem) {
    this.memoryCache.unshift(item)
    if (this.memoryCache.length > CACHE_MAX_COUNT) {
      this.memoryCache.pop()
    }
    const oneHourAgo = Date.now() - CACHE_MAX_AGE_MS
    this.memoryCache = this.memoryCache.filter((i) => {
      const ts = i.timestamp
      if (!ts) return false
      const timeValue = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
      return Number.isFinite(timeValue) && timeValue > oneHourAgo
    })
  }

  public getLatestItem(): IClipboardItem | undefined {
    return this.memoryCache[0]
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

    clipboardLog.debug('[clipboard:query] Request', {
      meta: { source, category, metaFilter: metaFilterPreview, limit }
    })

    // 如果没有任何筛选条件，返回最近的记录
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
      clipboardLog.debug('[clipboard:query] Searching for category', {
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

    clipboardLog.debug('[clipboard:query] Found meta rows', { meta: { count: idRows.length } })

    const ids = idRows.map((row) => row.clipboardId).filter((id): id is number => !!id)
    if (ids.length === 0) {
      clipboardLog.debug('[clipboard:query] No matching IDs found')
      return []
    }

    clipboardLog.debug('[clipboard:query] Fetching clipboard entries', {
      meta: { count: ids.length, sampleIds: ids.slice(0, 5).join(',') }
    })

    const rows = await this.db
      .select()
      .from(clipboardHistory)
      .where(inArray(clipboardHistory.id, ids))
      .orderBy(desc(clipboardHistory.timestamp))

    const history = await this.hydrateWithMeta(rows)
    const normalized = history.map((item) => this.toClientItem(item) ?? item)
    clipboardLog.debug('[clipboard:query] Returning results', {
      meta: { count: history.length }
    })

    return normalized
  }

  public getCacheStats(): { memoryItems: number; activeAppCached: boolean } {
    return {
      memoryItems: this.memoryCache.length,
      activeAppCached: Boolean(this.activeAppCache?.value)
    }
  }

  private extractTags(item: IClipboardItem): string[] | undefined {
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
        void tempFileService.deleteFile(item.content)
      }
    }

    await this.db.delete(clipboardHistory).where(whereClause)
    this.memoryCache = this.memoryCache.filter((item) => {
      if (itemType !== 'all' && item.type !== itemType) return true
      if (options?.beforeDays && item.timestamp) {
        const ts =
          item.timestamp instanceof Date
            ? item.timestamp.getTime()
            : new Date(item.timestamp).getTime()
        const cutoff = Date.now() - options.beforeDays * 24 * 60 * 60 * 1000
        return ts >= cutoff
      }
      return false
    })
    this.notifyTransportChange()

    return { removedCount: rows.length }
  }

  private toTransportItem(item: IClipboardItem): ClipboardItem | null {
    if (!item || typeof item.id !== 'number') return null

    const createdAt = item.timestamp
      ? item.timestamp instanceof Date
        ? item.timestamp.getTime()
        : new Date(item.timestamp).getTime()
      : Date.now()

    const type: TuffInputType =
      item.type === 'image'
        ? TuffInputType.Image
        : item.type === 'files'
          ? TuffInputType.Files
          : TuffInputType.Text

    const value =
      item.type === 'image'
        ? item.thumbnail && item.thumbnail.length > 0
          ? item.thumbnail
          : (item.content ?? '')
        : (item.content ?? '')
    const tags = this.extractTags(item)

    return {
      id: item.id,
      type,
      value,
      html: item.type === 'text' ? (item.rawContent ?? undefined) : undefined,
      source: item.sourceApp ?? undefined,
      createdAt,
      isFavorite: item.isFavorite ?? undefined,
      tags
    }
  }

  private toClientItem(item: IClipboardItem | null): IClipboardItem | null {
    if (!item) return null

    if (item.type !== 'image') {
      return { ...item }
    }

    const meta = { ...(item.meta ?? {}) } as Record<string, unknown>
    const rawContent = typeof item.content === 'string' ? item.content : ''

    const originalPath =
      isLikelyLocalPath(rawContent) && tempFileService.isWithinBaseDir(rawContent)
        ? rawContent
        : undefined
    const originalUrl = originalPath ? toTfileUrl(originalPath) : undefined

    meta.image_original_url = originalUrl ?? meta.image_original_url
    meta.image_content_kind = 'preview'

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

  private buildTransportChangePayload(): ClipboardChangePayload {
    const history = this.memoryCache
      .map((item) => this.toTransportItem(item))
      .filter((item): item is ClipboardItem => !!item)
    const latest = history.length > 0 ? history[0] : null
    return { latest, history }
  }

  private notifyTransportChange(): void {
    const listeners = Array.from(this.transportChangeListeners)
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // ignore listener errors
      }
    }
  }

  private parseFileList(content?: string | null): string[] {
    if (!content) return []
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0
        )
      }
    } catch (error) {
      clipboardLog.debug('Failed to parse file list from clipboard item', { error })
    }
    return []
  }

  private normalizeApplyPayload(payload: ClipboardApplyPayload): IClipboardItem {
    if (!payload) {
      throw new Error('Clipboard apply payload is missing.')
    }

    const base = payload.item ?? {}
    const derivedType = payload.type ?? base.type ?? (payload.files ? 'files' : undefined)
    let resolvedType: IClipboardItem['type'] | null = derivedType ?? null

    if (!resolvedType) {
      if (payload.text !== undefined || payload.html !== undefined) {
        resolvedType = 'text'
      }
    }

    if (!resolvedType) {
      throw new Error('Unable to resolve clipboard content type for auto paste.')
    }

    if (resolvedType === 'text') {
      const content = payload.text ?? base.content ?? ''
      const rawContent = payload.html ?? base.rawContent ?? null
      return {
        type: 'text',
        content,
        rawContent
      }
    }

    if (resolvedType === 'image') {
      const content = base.content ?? payload.text
      if (!content) {
        throw new Error('Image clipboard item is missing data URL content.')
      }
      return {
        type: 'image',
        content
      }
    }

    const files = payload.files ?? this.parseFileList(base.content)
    if (!files.length) {
      throw new Error('File clipboard item has no file paths to apply.')
    }

    return {
      type: 'files',
      content: JSON.stringify(files)
    }
  }

  private createNativeImageFromSource(source: string): NativeImage {
    if (!source) {
      return nativeImage.createEmpty()
    }

    if (isDataUrl(source)) {
      return nativeImage.createFromDataURL(source)
    }

    if (source.startsWith('tfile:')) {
      const normalizedUrl = toTfileUrl(source)
      const rawPath = normalizedUrl.slice('tfile://'.length)
      try {
        return nativeImage.createFromPath(decodeURIComponent(rawPath))
      } catch {
        return nativeImage.createFromPath(rawPath)
      }
    }

    if (source.startsWith('file://')) {
      try {
        return nativeImage.createFromPath(fileURLToPath(source))
      } catch {
        return nativeImage.createEmpty()
      }
    }

    return nativeImage.createFromPath(source)
  }

  private writeItemToClipboard(item: IClipboardItem, payload: ClipboardApplyPayload): void {
    if (item.type === 'text') {
      const html = item.rawContent ?? payload.html ?? undefined
      clipboard.write({
        text: item.content ?? '',
        html: html ?? undefined
      })
      this.clipboardHelper?.markText(item.content ?? '')
      return
    }

    if (item.type === 'image') {
      const source = item.content ?? ''
      const image = this.createNativeImageFromSource(source)
      if (image.isEmpty()) {
        throw new Error('Image clipboard item could not be reconstructed.')
      }
      clipboard.writeImage(image)
      this.clipboardHelper?.primeImage(image)
      return
    }

    const files = this.parseFileList(item.content)
    if (!files.length) {
      throw new Error('File clipboard item is empty.')
    }

    const resolvedPaths = files.map((filePath) => {
      try {
        return path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
      } catch {
        return filePath
      }
    })

    const fileUrlContent = resolvedPaths
      .map((filePath) => pathToFileURL(filePath).toString())
      .join('\n')
    const buffer = Buffer.from(fileUrlContent, 'utf8')

    try {
      for (const format of ['public.file-url', 'public.file-url-multiple', 'text/uri-list']) {
        clipboard.writeBuffer(format, buffer)
      }
    } catch (error) {
      clipboardLog.warn('Failed to populate file clipboard formats', { error })
    }

    // Ensure at least the path text is available as a fallback.
    clipboard.write({ text: resolvedPaths[0] ?? '' })
    this.clipboardHelper?.primeFiles(resolvedPaths)
  }

  private startTempCleanupTasks(): void {
    tempFileService.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    tempFileService.registerNamespace({
      namespace: CLIPBOARD_LIVE_IMAGE_NAMESPACE,
      retentionMs: 24 * 60 * 60 * 1000
    })
    tempFileService.startCleanup()

    if (!pollingService.isRegistered(CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID)) {
      pollingService.register(
        CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID,
        () => {
          void this.cleanupOrphanClipboardImages().catch((error) => {
            clipboardLog.warn('Clipboard temp image cleanup failed', { error })
          })
        },
        { interval: CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS, unit: 'milliseconds' }
      )
      pollingService.start()
    }
  }

  private async cleanupOrphanClipboardImages(): Promise<void> {
    if (!this.db) return

    const dirPath = tempFileService.resolveNamespaceDir(CLIPBOARD_IMAGE_NAMESPACE)
    const now = Date.now()
    const cutoff = now - CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS

    const referenced = new Set<string>()
    try {
      const rows = await this.db
        .select({ content: clipboardHistory.content })
        .from(clipboardHistory)
        .where(eq(clipboardHistory.type, 'image'))

      for (const row of rows) {
        const content = row.content ?? ''
        if (!isLikelyLocalPath(content)) continue
        if (!tempFileService.isWithinBaseDir(content)) continue
        referenced.add(path.resolve(content))
      }
    } catch (error) {
      clipboardLog.warn('Failed to load referenced clipboard image paths', { error })
      return
    }

    const collectFiles = async (root: string): Promise<string[]> => {
      const files: string[] = []
      let entries: Array<import('node:fs').Dirent>
      try {
        entries = await fs.readdir(root, { withFileTypes: true })
      } catch {
        return files
      }

      for (const entry of entries) {
        const fullPath = path.join(root, entry.name)
        if (entry.isDirectory()) {
          files.push(...(await collectFiles(fullPath)))
          continue
        }
        if (entry.isFile()) {
          files.push(fullPath)
        }
      }
      return files
    }

    const candidates = await collectFiles(dirPath)
    let cleanedCount = 0
    let cleanedBytes = 0

    for (const filePath of candidates) {
      const resolved = path.resolve(filePath)
      if (referenced.has(resolved)) continue

      try {
        const stat = await fs.stat(resolved)
        if (!Number.isFinite(stat.mtimeMs) || stat.mtimeMs > cutoff) continue
        const ok = await tempFileService.deleteFile(resolved)
        if (ok) {
          cleanedCount += 1
          cleanedBytes += stat.size
        }
      } catch {
        // ignore
      }
    }

    if (cleanedCount > 0) {
      clipboardLog.info('Cleaned orphaned clipboard images', {
        meta: { cleanedCount, cleanedBytes }
      })
    }
  }

  private async wait(ms: number): Promise<void> {
    if (!ms || ms <= 0) return
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async simulatePasteCommand(): Promise<void> {
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('osascript', [
          '-e',
          'tell application "System Events" to keystroke "v" using {command down}'
        ])
        return
      }

      if (process.platform === 'win32') {
        const script =
          "$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys('^v')"
        await execFileAsync('powershell', ['-NoLogo', '-NonInteractive', '-Command', script])
        return
      }

      if (process.platform === 'linux') {
        await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
        return
      }

      throw new Error(`Auto paste is not supported on platform: ${process.platform}`)
    } catch (error) {
      clipboardLog.error('Failed to simulate paste command', { error })
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  private async applyToActiveApp(payload: ClipboardApplyPayload): Promise<void> {
    const item = this.normalizeApplyPayload(payload)

    this.writeItemToClipboard(item, payload)

    if (payload.hideCoreBox !== false) {
      try {
        coreBoxManager.trigger(false)
      } catch (error) {
        clipboardLog.debug('Failed to hide CoreBox before auto paste', { error })
      }
    }

    const delay = Number.isFinite(payload.delayMs) ? Math.max(0, Number(payload.delayMs)) : 150
    await this.wait(delay)

    await this.simulatePasteCommand()
  }

  private mergeMetadataString(
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

  private async getActiveAppSnapshot(): Promise<Awaited<
    ReturnType<typeof activeAppService.getActiveApp>
  > | null> {
    const now = Date.now()
    if (this.activeAppCache && now - this.activeAppCache.fetchedAt < this.activeAppCacheTtlMs) {
      return this.activeAppCache.value
    }

    try {
      const activeApp = await activeAppService.getActiveApp()
      this.activeAppCache = { value: activeApp, fetchedAt: now }
      return activeApp
    } catch (error) {
      clipboardLog.error('Failed to resolve active app info', { error })
      this.activeAppCache = { value: null, fetchedAt: now }
      return null
    }
  }

  private handleMetaPatch = (clipboardId: number, patch: Record<string, unknown>): void => {
    const index = this.memoryCache.findIndex((entry) => entry.id === clipboardId)
    if (index === -1) return

    const current = this.memoryCache[index]
    const nextMeta = { ...(current.meta ?? {}), ...patch }
    const metadata = this.mergeMetadataString(current.metadata, patch)

    this.memoryCache[index] = {
      ...current,
      meta: nextMeta,
      metadata
    }
  }

  private async persistMetaEntries(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[]
  ): Promise<void> {
    if (!this.db) return
    const resolvedEntries =
      entries && entries.length > 0
        ? entries
        : Object.entries(meta).map(([key, value]) => ({ key, value }))
    const values = resolvedEntries
      .filter((entry) => entry.value !== undefined)
      .map((entry) => ({
        clipboardId,
        key: entry.key,
        value: JSON.stringify(entry.value ?? null)
      }))

    if (values.length === 0) return

    await this.db.insert(clipboardHistoryMeta).values(values)
  }

  /**
   * Save custom (non-clipboard) entry to clipboard history
   * Used by AI chat, preview, and other features
   * @param category - Entry category: 'ai-chat' | 'preview' | 'custom'
   */
  public async saveCustomEntry({
    content,
    rawContent,
    category = 'custom',
    meta
  }: {
    content: string
    rawContent?: string | null
    category?: 'ai-chat' | 'preview' | 'custom'
    meta?: Record<string, unknown>
  }): Promise<IClipboardItem | null> {
    if (!this.db) return null

    const metaEntries: ClipboardMetaEntry[] = [
      { key: 'source', value: 'custom' },
      { key: 'category', value: category }
    ]
    if (meta) {
      for (const [key, value] of Object.entries(meta)) {
        metaEntries.push({ key, value })
      }
    }

    const mergedMeta: Record<string, unknown> = {}
    for (const entry of metaEntries) {
      mergedMeta[entry.key] = entry.value
    }

    const metadata = this.mergeMetadataString(null, mergedMeta)
    const record = {
      type: 'text' as const,
      content,
      rawContent: rawContent ?? null,
      thumbnail: null,
      timestamp: new Date(),
      sourceApp: 'Talex Touch',
      isFavorite: false,
      metadata
    }

    const inserted = await this.db.insert(clipboardHistory).values(record).returning()
    if (inserted.length === 0) {
      return null
    }

    const persisted = inserted[0] as IClipboardItem
    persisted.meta = mergedMeta

    if (persisted.id) {
      await this.persistMetaEntries(persisted.id, mergedMeta)
    }

    this.updateMemoryCache(persisted)
    this.notifyTransportChange()

    for (const win of windowManager.windows) {
      if (!win.window.isDestroyed()) {
        if (this.transport) {
          void this.transport.sendTo(win.window.webContents, clipboardLegacyNewItemEvent, persisted)
        }
      }
    }

    return persisted
  }

  private startClipboardMonitoring(): void {
    if (!this.clipboardHelper) {
      return
    }
    if (!this.monitoringStarted) {
      this.clipboardHelper.bootstrap()
      this.monitoringStarted = true
    }

    this.updateClipboardPolling(true)
  }

  private async runClipboardMonitor(): Promise<void> {
    if (this.clipboardCheckInFlight) {
      return
    }
    this.clipboardCheckInFlight = true
    try {
      await this.checkClipboard()
    } catch (error) {
      clipboardLog.warn('Clipboard check failed', { error })
    } finally {
      this.clipboardCheckInFlight = false
    }
  }

  private async checkClipboard(): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }
    if (appTaskGate.isActive()) {
      return
    }
    const now = Date.now()
    if (now < this.clipboardCheckCooldownUntil) {
      return
    }
    await this.checkClipboardInternal()
  }

  private async checkClipboardInternal(): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }

    const dispose = enterPerfContext('Clipboard.check', { task: 'poll' })
    const startAt = performance.now()
    try {
      const helper = this.clipboardHelper
      helper.bootstrap()
      const formats = clipboard.availableFormats()
      if (formats.length === 0) {
        return
      }

      // Fast-path change detection: Skip processing if nothing changed
      const formatsKey = formats.sort().join(',')
      if (helper.lastFormats.length > 0 && helper.lastFormats.sort().join(',') === formatsKey) {
        // Formats haven't changed, do a quick sanity check on text/files
        const quickText = clipboard.readText()
        const quickHash = `${formatsKey}:${quickText.substring(0, 100)}`

        if (helper.lastChangeHash === quickHash) {
          // Nothing changed, skip processing
          return
        }
        helper.lastChangeHash = quickHash
      } else {
        // Formats changed, update and continue
        helper.lastFormats = formats
        helper.lastChangeHash = `${formatsKey}:${clipboard.readText().substring(0, 100)}`
      }

      const metaEntries: ClipboardMetaEntry[] = [{ key: 'formats', value: formats }]
      let item: Omit<IClipboardItem, 'timestamp' | 'id' | 'metadata' | 'meta'> | null = null

      // Priority: FILES (with image) > IMAGE > FILES (no image) > TEXT
      // Check for files first to handle video files with thumbnails correctly
      if (includesAny(formats, FILE_URL_FORMATS)) {
        const files = helper.readClipboardFiles()
        if (helper.didFilesChange(files)) {
          const serialized = JSON.stringify(files)
          let thumbnail: string | undefined
          let imageSize: { width: number; height: number } | undefined

          // Check if there's an associated image (e.g., video thumbnail)
          if (includesAny(formats, IMAGE_FORMATS)) {
            const image = clipboard.readImage()
            if (!image.isEmpty()) {
              helper.primeImage(image)
              imageSize = image.getSize()
              thumbnail = image.resize({ width: 128 }).toDataURL()
              clipboardLog.info('File with thumbnail detected', {
                meta: { width: imageSize.width, height: imageSize.height }
              })
            } else {
              helper.primeImage(null)
            }
          } else {
            helper.primeImage(null)
          }

          helper.markText('')
          metaEntries.push({ key: 'file_count', value: files.length })
          metaEntries.push({ key: 'has_sidecar_image', value: Boolean(thumbnail) })
          if (imageSize) {
            metaEntries.push({ key: 'image_size', value: imageSize })
          }
          item = {
            type: 'files',
            content: serialized,
            thumbnail
          }
        }
      }

      // Check for standalone image (only if no files detected)
      if (!item && includesAny(formats, IMAGE_FORMATS)) {
        const image = clipboard.readImage()
        if (helper.didImageChange(image)) {
          helper.markText('')
          const size = image.getSize()
          metaEntries.push({ key: 'image_size', value: size })
          const png = image.toPNG()
          const stored = await tempFileService.createFile({
            namespace: CLIPBOARD_IMAGE_NAMESPACE,
            ext: 'png',
            buffer: png,
            prefix: 'clipboard-image'
          })
          metaEntries.push({ key: 'image_file_path', value: stored.path })
          metaEntries.push({ key: 'image_file_size', value: stored.sizeBytes })
          item = {
            type: 'image',
            content: stored.path,
            thumbnail: image.resize({ width: 128 }).toDataURL()
          }
        }
      }

      if (!item && includesAny(formats, TEXT_FORMATS)) {
        const text = clipboard.readText()
        if (helper.didTextChange(text)) {
          const html = clipboard.readHTML()
          metaEntries.push({ key: 'text_length', value: text.length })
          if (html) {
            metaEntries.push({ key: 'html_length', value: html.length })
          }
          item = {
            type: 'text',
            content: text,
            rawContent: html || null
          }
        }
      }

      if (!item) {
        return
      }

      const tags = detectClipboardTags({
        type: item.type,
        content: item.content,
        rawContent: item.rawContent ?? null
      })
      if (tags.length > 0) {
        metaEntries.push({ key: 'tags', value: tags })
        for (const tag of tags) {
          metaEntries.push({ key: 'tag', value: tag })
        }
      }

      const activeApp = await this.getActiveAppSnapshot()
      if (activeApp) {
        item.sourceApp = activeApp.bundleId || activeApp.identifier || activeApp.displayName || null

        const activeAppMeta = {
          bundleId: activeApp.bundleId ?? null,
          displayName: activeApp.displayName ?? null,
          processId: activeApp.processId ?? null,
          executablePath: activeApp.executablePath ?? null,
          icon: activeApp.icon ?? null
        }

        for (const [key, value] of Object.entries(activeAppMeta)) {
          if (value !== null && value !== undefined) {
            metaEntries.push({ key: `source_${key}`, value })
          }
        }

        metaEntries.push({ key: 'source', value: activeAppMeta })
      }

      const metaObject: Record<string, unknown> = {}
      for (const { key, value } of metaEntries) {
        if (value === undefined) continue
        if (key === 'tag') continue
        metaObject[key] = value
      }

      const metadataPayload = Object.keys(metaObject).length > 0 ? JSON.stringify(metaObject) : null
      const record = {
        ...item,
        metadata: metadataPayload,
        timestamp: new Date()
      }

      const persistContext = enterPerfContext('Clipboard.persist', { type: item.type })
      const persistStart = performance.now()
      const inserted = await this.db.insert(clipboardHistory).values(record).returning()
      const persistDuration = performance.now() - persistStart
      if (persistDuration > 200) {
        clipboardLog.warn('Clipboard persist slow', {
          meta: { durationMs: Math.round(persistDuration), type: item.type }
        })
      }
      persistContext()
      if (inserted.length === 0) {
        return
      }

      const persisted = inserted[0] as IClipboardItem
      persisted.meta = metaObject

      if (persisted.id) {
        await this.persistMetaEntries(persisted.id, metaObject, metaEntries)
        setImmediate(() => {
          ocrService
            .enqueueFromClipboard({
              clipboardId: persisted.id!,
              item: persisted,
              formats
            })
            .catch((error) => {
              clipboardLog.warn('Failed to enqueue clipboard OCR', { error })
            })
        })
      }

      this.updateMemoryCache(persisted)
      this.notifyTransportChange()

      for (const win of windowManager.windows) {
        if (!win.window.isDestroyed()) {
          if (this.transport) {
            void this.transport.sendTo(
              win.window.webContents,
              clipboardLegacyNewItemEvent,
              persisted
            )
          }
        }
      }

      const activePlugin = windowManager.getAttachedPlugin()
      if (
        activePlugin?._uniqueChannelKey &&
        windowManager.shouldForwardClipboardChange(persisted.type)
      ) {
        this.transport
          ?.sendToPlugin(activePlugin.name, coreBoxClipboardChangeEvent, { item: persisted })
          .catch(() => {})
          .catch((error) => {
            clipboardLog.warn('Failed to notify plugin UI view about clipboard change', { error })
          })
      }
    } finally {
      const duration = performance.now() - startAt
      if (duration > 500) {
        this.clipboardCheckCooldownUntil = Date.now() + 5000
      }
      if (duration > 200) {
        clipboardLog.warn('Clipboard check slow', {
          meta: { durationMs: Math.round(duration) }
        })
      }
      dispose()
    }
  }

  private registerTransportHandlers(): void {
    const channel = genTouchApp().channel as ITouchChannel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    const writePayload = async (payload: ClipboardWritePayload): Promise<void> => {
      const { text, html, image, files } = payload ?? {}

      if (image) {
        const img = this.createNativeImageFromSource(image)
        if (!img.isEmpty()) {
          clipboard.writeImage(img)
          this.clipboardHelper?.primeImage(img)
        }
        return
      }

      if (files && files.length > 0) {
        const resolvedPaths = files.map((filePath) => {
          try {
            return path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
          } catch {
            return filePath
          }
        })
        const fileUrlContent = resolvedPaths
          .map((filePath) => pathToFileURL(filePath).toString())
          .join('\n')
        const buffer = Buffer.from(fileUrlContent, 'utf8')
        for (const format of ['public.file-url', 'public.file-url-multiple', 'text/uri-list']) {
          clipboard.writeBuffer(format, buffer)
        }
        clipboard.write({ text: resolvedPaths[0] ?? '' })
        this.clipboardHelper?.primeFiles(resolvedPaths)
        return
      }

      clipboard.write({ text: text ?? '', html: html ?? undefined })
      this.clipboardHelper?.markText(text ?? '')
    }

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.getLatest, () => {
        const latest = this.getLatestItem()
        return latest ? this.toTransportItem(latest) : null
      })
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.getHistory, async (request: ClipboardQueryRequest) => {
        const page = Number.isFinite(request?.page) ? Math.max(1, Number(request.page)) : 1
        const limit = Number.isFinite(request?.limit)
          ? Math.min(Math.max(Number(request.limit), 1), 100)
          : PAGE_SIZE

        if (!this.db) {
          return { items: [], total: 0, page, limit } satisfies ClipboardQueryResponse
        }

        const offset = (page - 1) * limit

        const whereClause =
          request?.type === 'favorite'
            ? eq(clipboardHistory.isFavorite, true)
            : request?.type === 'text'
              ? eq(clipboardHistory.type, 'text')
              : request?.type === 'image'
                ? eq(clipboardHistory.type, 'image')
                : undefined

        const rows = await this.db
          .select()
          .from(clipboardHistory)
          .where(whereClause)
          .orderBy(desc(clipboardHistory.timestamp))
          .limit(limit)
          .offset(offset)

        const totalResult = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(clipboardHistory)
          .where(whereClause)

        const total = totalResult[0]?.count ?? 0
        const items = rows
          .map((row) => this.toTransportItem(row as unknown as IClipboardItem))
          .filter((item): item is ClipboardItem => !!item)

        return { items, total, page, limit } satisfies ClipboardQueryResponse
      })
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.apply, async (request: ClipboardApplyRequest) => {
        if (!this.db) return
        const [row] = await this.db
          .select()
          .from(clipboardHistory)
          .where(eq(clipboardHistory.id, request.id))
          .limit(1)

        if (!row) return

        const item = row as unknown as IClipboardItem
        if (request.autoPaste === false) {
          this.writeItemToClipboard(item, { item })
          return
        }

        await this.applyToActiveApp({ item })
      })
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.delete, async (request: ClipboardDeleteRequest) => {
        if (!this.db) return
        try {
          const [row] = await this.db
            .select()
            .from(clipboardHistory)
            .where(eq(clipboardHistory.id, request.id))
            .limit(1)
          const item = row as unknown as IClipboardItem | undefined
          if (
            item?.type === 'image' &&
            typeof item.content === 'string' &&
            isLikelyLocalPath(item.content)
          ) {
            void tempFileService.deleteFile(item.content)
          }
        } catch (error) {
          clipboardLog.warn('Failed to delete clipboard image file for transport delete', { error })
        }
        await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, request.id))
        this.memoryCache = this.memoryCache.filter((item) => item.id !== request.id)
        this.notifyTransportChange()
      })
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.setFavorite,
        async (request: ClipboardSetFavoriteRequest) => {
          if (!this.db) return
          await this.db
            .update(clipboardHistory)
            .set({ isFavorite: request.isFavorite })
            .where(eq(clipboardHistory.id, request.id))

          const cached = this.memoryCache.find((item) => item.id === request.id)
          if (cached) {
            cached.isFavorite = request.isFavorite
            this.notifyTransportChange()
          }
        }
      )
    )

    this.transportDisposers.push(
      this.transport.onStream(
        ClipboardEvents.change,
        (_request: void, context: StreamContext<ClipboardChangePayload>) => {
          const listener = () => {
            if (context.isCancelled()) {
              this.transportChangeListeners.delete(listener)
              return
            }
            context.emit(this.buildTransportChangePayload())
          }

          this.transportChangeListeners.add(listener)
          listener()
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.write, async (request: ClipboardWriteRequest) => {
        if (!request) return
        if (request.type === 'image') {
          await writePayload({ image: request.value })
          return
        }
        if (request.type === 'html') {
          await writePayload({ html: request.value })
          return
        }
        await writePayload({ text: request.value })
      })
    )

    this.transportDisposers.push(
      this.transport.on(
        clipboardLegacyGetHistoryEvent,
        async (payload: ClipboardLegacyHistoryRequest = {}) => {
          if (!this.db) {
            return { history: [], total: 0, page: 1, pageSize: PAGE_SIZE }
          }

          const {
            page = 1,
            pageSize: requestedPageSize,
            keyword,
            startTime,
            endTime,
            type: itemType,
            isFavorite,
            sourceApp,
            sortOrder = 'desc'
          } = payload ?? {}

          const pageSize = requestedPageSize
            ? Math.min(Math.max(requestedPageSize, 1), 100)
            : PAGE_SIZE
          const offset = (page - 1) * pageSize

          const conditions: SQL<unknown>[] = []

          if (keyword && typeof keyword === 'string' && keyword.trim().length > 0) {
            conditions.push(sql`${clipboardHistory.content} LIKE ${`%${keyword.trim()}%`}`)
          }

          if (startTime && typeof startTime === 'number') {
            conditions.push(sql`${clipboardHistory.timestamp} >= ${new Date(startTime)}`)
          }

          if (endTime && typeof endTime === 'number') {
            conditions.push(sql`${clipboardHistory.timestamp} <= ${new Date(endTime)}`)
          }

          if (itemType && ['text', 'image', 'files'].includes(itemType)) {
            conditions.push(eq(clipboardHistory.type, itemType))
          }

          if (isFavorite !== undefined && typeof isFavorite === 'boolean') {
            conditions.push(eq(clipboardHistory.isFavorite, isFavorite))
          }

          if (sourceApp && typeof sourceApp === 'string') {
            conditions.push(eq(clipboardHistory.sourceApp, sourceApp))
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined
          const orderClause =
            sortOrder === 'asc' ? clipboardHistory.timestamp : desc(clipboardHistory.timestamp)

          const historyRows = await this.db
            .select()
            .from(clipboardHistory)
            .where(whereClause)
            .orderBy(orderClause)
            .limit(pageSize)
            .offset(offset)

          const history = await this.hydrateWithMeta(historyRows)
          const normalized = history.map((item) => this.toClientItem(item) ?? item)

          const totalResult = await this.db
            .select({ count: sql<number>`count(*)` })
            .from(clipboardHistory)
            .where(whereClause)

          const total = totalResult[0]?.count ?? 0

          return { history: normalized, total, page, pageSize }
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacySetFavoriteEvent, async (payload) => {
        const { id, isFavorite } = payload ?? {}
        if (!this.db || typeof id !== 'number') return
        await this.db
          .update(clipboardHistory)
          .set({ isFavorite })
          .where(eq(clipboardHistory.id, id))
        const cached = this.memoryCache.find((item) => item.id === id)
        if (cached) {
          cached.isFavorite = isFavorite
          this.notifyTransportChange()
        }
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyDeleteItemEvent, async (payload) => {
        const { id } = payload ?? {}
        if (!this.db || typeof id !== 'number') return
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
            void tempFileService.deleteFile(item.content)
          }
        } catch (error) {
          clipboardLog.warn('Failed to delete clipboard image file for removed item', { error })
        }

        await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, id))
        this.memoryCache = this.memoryCache.filter((item) => item.id !== id)
        this.notifyTransportChange()
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyClearHistoryEvent, async () => {
        const oneHourAgo = new Date(Date.now() - CACHE_MAX_AGE_MS)
        try {
          const rows = await this.db!.select()
            .from(clipboardHistory)
            .where(gt(clipboardHistory.timestamp, oneHourAgo))
          for (const row of rows) {
            const item = row as unknown as IClipboardItem
            if (
              item?.type === 'image' &&
              typeof item.content === 'string' &&
              isLikelyLocalPath(item.content)
            ) {
              void tempFileService.deleteFile(item.content)
            }
          }
        } catch (error) {
          clipboardLog.warn('Failed to cleanup clipboard image files for clear-history', { error })
        }

        await this.db!.delete(clipboardHistory).where(gt(clipboardHistory.timestamp, oneHourAgo))
        this.memoryCache = []
        this.notifyTransportChange()
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyApplyToActiveAppEvent, async (payload) => {
        try {
          await this.applyToActiveApp((payload ?? {}) as ClipboardApplyPayload)
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, message }
        }
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyWriteTextEvent, async (payload) => {
        const text = typeof payload?.text === 'string' ? payload.text : ''
        await writePayload({ text })
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyWriteEvent, async (payload) => {
        await writePayload(payload ?? {})
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyReadEvent, async () => {
        const formats = clipboard.availableFormats()
        const text = clipboard.readText()
        const html = clipboard.readHTML()
        const image = clipboard.readImage()
        const hasImage = !image.isEmpty()
        const files = this.clipboardHelper?.readClipboardFiles() ?? []
        const hasFiles = files.length > 0
        return { text, html, hasImage, hasFiles, formats }
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyReadImageEvent, async (payload) => {
        const image = clipboard.readImage()
        if (image.isEmpty()) {
          return null
        }
        const size = image.getSize()
        const preview = Boolean(payload?.preview)
        const previewDataUrl = image.resize({ width: 256 }).toDataURL()
        if (preview) {
          return {
            dataUrl: previewDataUrl,
            width: size.width,
            height: size.height
          }
        }

        const stored = await tempFileService.createFile({
          namespace: CLIPBOARD_LIVE_IMAGE_NAMESPACE,
          ext: 'png',
          buffer: image.toPNG(),
          prefix: 'clipboard-read'
        })
        return {
          dataUrl: previewDataUrl,
          width: size.width,
          height: size.height,
          tfileUrl: toTfileUrl(stored.path)
        }
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyReadFilesEvent, async () => {
        return this.clipboardHelper?.readClipboardFiles() ?? []
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyClearEvent, async () => {
        clipboard.clear()
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyCopyAndPasteEvent, async (payload) => {
        try {
          const { text, html, image, files, delayMs, hideCoreBox } = payload ?? {}
          let applyPayload: ClipboardApplyPayload
          if (image) {
            applyPayload = {
              type: 'image',
              item: { type: 'image', content: image },
              hideCoreBox,
              delayMs
            }
          } else if (files && files.length > 0) {
            applyPayload = { type: 'files', files, hideCoreBox, delayMs }
          } else {
            applyPayload = { type: 'text', text: text ?? '', html, hideCoreBox, delayMs }
          }
          await this.applyToActiveApp(applyPayload)
          return { success: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, message }
        }
      })
    )

    this.transportDisposers.push(
      this.transport.on(clipboardLegacyQueryEvent, async (payload) => {
        return await this.queryHistoryByMeta(payload ?? {})
      })
    )
  }

  public destroy(): void {
    this.isDestroyed = true
    pollingService.unregister(CLIPBOARD_POLL_TASK_ID)

    if (this.unsubscribeAppSetting) {
      try {
        this.unsubscribeAppSetting()
      } catch {
        // ignore unsubscribe errors
      }
      this.unsubscribeAppSetting = null
    }

    touchEventBus.off(TalexEvents.COREBOX_WINDOW_SHOWN, this.handleCoreBoxShown)
    touchEventBus.off(TalexEvents.COREBOX_WINDOW_HIDDEN, this.handleCoreBoxHidden)
    touchEventBus.off(TalexEvents.ALL_MODULES_LOADED, this.handleAllModulesLoaded)
    this.pollingSubscriptionsSetup = false

    if (this.powerListenersSetup) {
      powerMonitor.off('on-ac', this.handlePowerStateChanged)
      powerMonitor.off('on-battery', this.handlePowerStateChanged)
      this.powerListenersSetup = false
    }

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transportChangeListeners.clear()
    this.transport = null
    this.monitoringStarted = false
    this.activeAppCache = null
    this.appSettingSnapshot = null
    this.coreBoxVisible = false
    this.currentPollIntervalMs = CLIPBOARD_DEFAULT_POLL_INTERVAL_MS
  }

  onInit(): MaybePromise<void> {
    this.db = databaseModule.getDb()
    this.clipboardHelper = new ClipboardHelper()
    this.setupPollingSubscriptions()
    this.setupPowerListeners()
    this.registerTransportHandlers()
    this.startTempCleanupTasks()
    setImmediate(() => {
      this.startClipboardMonitoring()
      void this.loadInitialCache()
    })
    setImmediate(() => {
      appTaskGate
        .waitForIdle()
        .then(() => ocrService.start())
        .catch((error) => clipboardLog.error('Failed to start OCR service', { error }))
    })
    ocrService.registerClipboardMetaListener(this.handleMetaPatch)
  }

  onDestroy(): MaybePromise<void> {
    this?.destroy()
  }
}

const clipboardModule = new ClipboardModule()

export default clipboardModule
export { clipboardModule }
