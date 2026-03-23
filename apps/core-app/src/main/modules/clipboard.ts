import type { AppSetting, MaybePromise, ModuleKey } from '@talex-touch/utils'
import type {
  ClipboardActionResult,
  ClipboardApplyRequest,
  ClipboardChangePayload,
  ClipboardCopyAndPasteRequest,
  ClipboardDeleteRequest,
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse,
  ClipboardItem,
  ClipboardMetaQueryRequest,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardReadImageRequest,
  ClipboardReadImageResponse,
  ClipboardReadResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'
import type {
  HandlerContext,
  ITuffTransportMain,
  StreamContext
} from '@talex-touch/utils/transport/main'
import type { SQL } from 'drizzle-orm'
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
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { CAPABILITY_AUTH_MIN_VERSION } from '@talex-touch/utils/plugin'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { TuffInputType } from '@talex-touch/utils/transport/events/types'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { clipboard, nativeImage, powerMonitor } from 'electron'
import { genTouchApp } from '../core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { dbWriteScheduler } from '../db/db-write-scheduler'
import { clipboardHistory, clipboardHistoryMeta } from '../db/schema'
import { withSqliteRetry } from '../db/sqlite-retry'
import { appTaskGate } from '../service/app-task-gate'
import { tempFileService } from '../service/temp-file.service'
import { createLogger } from '../utils/logger'
import { enterPerfContext } from '../utils/perf-context'
import { perfMonitor } from '../utils/perf-monitor'
import { BaseModule } from './abstract-base-module'
import { coreBoxManager } from './box-tool/core-box/manager'
import { windowManager } from './box-tool/core-box/window'
import { detectClipboardTags } from './clipboard-tagging'
import { databaseModule } from './database'
import { ocrService } from './ocr/ocr-service'
import { getPermissionModule } from './permission'
import { pluginModule } from './plugin/plugin-module'
import { getMainConfig, isMainStorageReady, subscribeMainConfig } from './storage'
import { activeAppService } from './system/active-app'
import {
  buildPhaseDiagnostics,
  summarizePhaseDurations,
  toPerfSeverity,
  trackPhase,
  trackPhaseAsync,
  type ClipboardPhaseDurations
} from './clipboard/clipboard-phase-diagnostics'

const clipboardLog = createLogger('Clipboard')
const CLIPBOARD_POLL_TASK_ID = 'clipboard.monitor'
const CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID = 'clipboard.active-app.refresh'
const CLIPBOARD_ACTIVE_APP_REFRESH_INTERVAL_MS = 1500
const CLIPBOARD_VISIBLE_POLL_INTERVAL_MS = 500
const CLIPBOARD_DEFAULT_POLL_INTERVAL_MS = 3000
const CLIPBOARD_SLOW_THRESHOLD_MS = 200
const CLIPBOARD_COOLDOWN_TRIGGER_MS = 500
const CLIPBOARD_COOLDOWN_BASE_MS = 800
const CLIPBOARD_COOLDOWN_MAX_MS = 3000
const CLIPBOARD_NATIVE_WATCH_ENV = 'TUFF_CLIPBOARD_NATIVE_WATCH'
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

const HTML_FORMATS = new Set(['text/html', 'public.html'])

interface ClipboardMetaEntry {
  key: string
  value: unknown
}

interface ClipboardWritePayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
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

interface ClipboardWatcherHandle {
  stop: () => void
  readonly isRunning?: boolean
}

interface ClipboardWatcherModule {
  startWatch?: (callback: () => void) => ClipboardWatcherHandle
}

interface ClipboardStageBJob {
  generation: number
  clipboardId: number
  item: IClipboardItem
  formats: string[]
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

interface LegacyClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: number | null
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

interface LegacyClipboardQueryRequest {
  keyword?: string
  startTime?: number
  endTime?: number
  type?: 'all' | 'favorite' | 'text' | 'image' | 'files'
  isFavorite?: boolean
  sourceApp?: string
  page?: number
  pageSize?: number
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

interface LegacyClipboardQueryResponse {
  history: LegacyClipboardItem[]
  total: number
  page: number
  pageSize: number
  limit?: number
}

const PAGE_SIZE = 20
const CACHE_MAX_COUNT = 20
const CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const execFileAsync = promisify(execFile)
const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'
const CLIPBOARD_LIVE_IMAGE_NAMESPACE = 'clipboard/live-images'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID = 'clipboard.temp-images.cleanup'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000
const CLIPBOARD_META_QUEUE_LIMIT = 6
const CLIPBOARD_META_LOG_THROTTLE_MS = 5_000
const CLIPBOARD_STAGE_B_LOG_THROTTLE_MS = 5_000
const clipboardLegacyGetLatestEvent = defineRawEvent<void, LegacyClipboardItem | null>(
  'clipboard:get-latest'
)
const clipboardLegacyGetHistoryEvent = defineRawEvent<
  LegacyClipboardQueryRequest,
  LegacyClipboardQueryResponse
>('clipboard:get-history')
const clipboardLegacySetFavoriteEvent = defineRawEvent<ClipboardSetFavoriteRequest, void>(
  'clipboard:set-favorite'
)
const clipboardLegacyDeleteItemEvent = defineRawEvent<ClipboardDeleteRequest, void>(
  'clipboard:delete-item'
)
const clipboardLegacyClearHistoryEvent = defineRawEvent<void, void>('clipboard:clear-history')
const clipboardLegacyApplyToActiveAppEvent = defineRawEvent<
  ClipboardApplyPayload,
  ClipboardActionResult
>('clipboard:apply-to-active-app')
const clipboardLegacyCopyAndPasteEvent = defineRawEvent<
  ClipboardCopyAndPasteRequest,
  ClipboardActionResult
>('clipboard:copy-and-paste')
const clipboardLegacyWriteTextEvent = defineRawEvent<{ text?: string }, void>(
  'clipboard:write-text'
)
const clipboardLegacyWriteEvent = defineRawEvent<ClipboardWriteRequest, void>('clipboard:write')
const clipboardLegacyReadEvent = defineRawEvent<void, ClipboardReadResponse>('clipboard:read')
const clipboardLegacyReadImageEvent = defineRawEvent<
  ClipboardReadImageRequest,
  ClipboardReadImageResponse | null
>('clipboard:read-image')
const clipboardLegacyReadFilesEvent = defineRawEvent<void, string[]>('clipboard:read-files')
const clipboardLegacyClearEvent = defineRawEvent<void, void>('clipboard:clear')
const clipboardLegacyGetImageUrlEvent = defineRawEvent<
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse
>('clipboard:get-image-url')

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
  if (/^tfile:\/\//i.test(raw)) {
    const tail = raw.replace(/^tfile:\/\//i, '')
    const tailIndex = tail.search(/[?#]/)
    const body = tailIndex >= 0 ? tail.slice(0, tailIndex) : tail
    resolvedPath = decodeStable(body.startsWith('/') ? body : `/${body}`)
  } else if (raw.startsWith('tfile:')) {
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
  public lastFormatsKey: string = ''
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
    this.lastFormats = [...this.lastFormats].sort()
    this.lastFormatsKey = this.lastFormats.join(',')
    const formatsKey = this.lastFormatsKey
    const textSignature = this.getTextQuickSignature(this.lastText)

    let filesSignature = '0:0'
    if (includesAny(this.lastFormats, FILE_URL_FORMATS)) {
      try {
        this.lastFiles = this.readClipboardFiles()
      } catch {
        this.lastFiles = []
      }
      filesSignature = this.getFilesQuickSignature(this.lastFiles)
    } else {
      this.lastFiles = []
    }

    if (includesAny(this.lastFormats, IMAGE_FORMATS)) {
      try {
        const image = clipboard.readImage()
        this.lastImageHash = this.getImageQuickSignature(image.isEmpty() ? null : image)
      } catch {
        this.lastImageHash = ''
      }
    } else {
      this.lastImageHash = ''
    }

    this.lastChangeHash = `${formatsKey}|t:${textSignature}|f:${filesSignature}|i:${this.lastImageHash}`
  }

  private getImageHash(image: NativeImage): string {
    if (!image || image.isEmpty()) return ''

    const size = image.getSize()
    // Use a tiny resize + dataURL for fast fingerprinting.
    // Avoids image.toBitmap() which allocates a full RGBA buffer
    // (e.g. 33MB for 4K images) just to sample 1KB.
    const tiny = image.resize({ width: 16, height: 16 })
    const fingerprint = tiny.toDataURL().substring(0, 200)
    return `${size.width}x${size.height}:${crypto.createHash('sha1').update(fingerprint).digest('hex')}`
  }

  public getTextQuickSignature(text: string): string {
    if (!text) return '0:0'
    const edgeLength = 160
    const head = text.slice(0, edgeLength)
    const tail = text.length > edgeLength ? text.slice(-edgeLength) : ''
    const digest = crypto.createHash('sha1').update(head).update('\0').update(tail).digest('hex')
    return `${text.length}:${digest}`
  }

  public getFilesQuickSignature(files: string[]): string {
    if (files.length === 0) return '0:0'
    const digest = crypto.createHash('sha1')
    for (const filePath of files) {
      digest.update(filePath)
      digest.update('\n')
    }
    return `${files.length}:${digest.digest('hex')}`
  }

  public getImageQuickSignature(image: NativeImage | null | undefined): string {
    if (!image || image.isEmpty()) return ''
    return this.getImageHash(image)
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
  private clipboardCheckPending = false
  private clipboardStageBJob: ClipboardStageBJob | null = null
  private clipboardStageBInFlight = false
  private clipboardStageBGeneration = 0
  private activeAppRefreshInFlight = false
  private lastStageBLogAt = 0
  private clipboardNativeWatcher: ClipboardWatcherHandle | null = null
  private clipboardNativeWatchInitTried = false
  private lastMetaQueuePressureLogAt = 0
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

  private readonly activeAppCacheTtlMs = 5000

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
    return 3
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
    const interval = settings.interval ?? 3

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
      {
        interval: intervalMs,
        unit: 'milliseconds',
        initialDelayMs,
        lane: 'realtime',
        backpressure: 'latest_wins',
        dedupeKey: CLIPBOARD_POLL_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 5000,
        jitterMs: 50
      }
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

  private isNativeClipboardWatcherEnabled(): boolean {
    const raw = process.env[CLIPBOARD_NATIVE_WATCH_ENV]
    if (!raw) return true
    const normalized = raw.trim().toLowerCase()
    return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
  }

  private resolveClipboardWatcherModule(value: unknown): ClipboardWatcherModule | null {
    if (!value || typeof value !== 'object') {
      return null
    }
    const pushCandidate = (target: unknown, list: unknown[]): void => {
      if (!target || typeof target !== 'object') return
      if (!list.includes(target)) {
        list.push(target)
      }
    }

    const source = value as {
      default?: unknown
      ['module.exports']?: unknown
    }
    const candidates: unknown[] = []

    pushCandidate(source, candidates)
    pushCandidate(source.default, candidates)
    pushCandidate(source['module.exports'], candidates)

    const nestedDefault = source.default as { default?: unknown; ['module.exports']?: unknown }
    if (nestedDefault && typeof nestedDefault === 'object') {
      pushCandidate(nestedDefault.default, candidates)
      pushCandidate(nestedDefault['module.exports'], candidates)
    }

    const nestedModuleExports = source['module.exports'] as {
      default?: unknown
      ['module.exports']?: unknown
    }
    if (nestedModuleExports && typeof nestedModuleExports === 'object') {
      pushCandidate(nestedModuleExports.default, candidates)
      pushCandidate(nestedModuleExports['module.exports'], candidates)
    }

    for (const candidate of candidates) {
      const watcherModule = candidate as ClipboardWatcherModule
      if (typeof watcherModule.startWatch === 'function') {
        return watcherModule
      }
    }

    return null
  }

  private async startNativeClipboardWatcher(): Promise<void> {
    if (this.isDestroyed) return
    if (this.clipboardNativeWatcher) return
    if (this.clipboardNativeWatchInitTried) return

    this.clipboardNativeWatchInitTried = true

    if (!this.isNativeClipboardWatcherEnabled()) {
      clipboardLog.info('Clipboard native watcher disabled by env', {
        meta: { env: CLIPBOARD_NATIVE_WATCH_ENV }
      })
      return
    }

    try {
      const rawModule = await import('@crosscopy/clipboard')
      const watcherModule = this.resolveClipboardWatcherModule(rawModule)
      if (!watcherModule || typeof watcherModule.startWatch !== 'function') {
        const exportKeys =
          rawModule && typeof rawModule === 'object' ? Object.keys(rawModule as object) : []
        clipboardLog.warn('Clipboard native watcher module has no startWatch API', {
          meta: { exportKeys: exportKeys.join(',') }
        })
        return
      }

      const watcher = watcherModule.startWatch(() => {
        if (this.isDestroyed) return
        setImmediate(() => {
          void this.runClipboardMonitor({ bypassCooldown: true })
        })
      })

      this.clipboardNativeWatcher = watcher
      clipboardLog.info('Clipboard native watcher started', {
        meta: { running: watcher.isRunning ?? true }
      })
    } catch (error) {
      clipboardLog.warn('Clipboard native watcher unavailable, fallback to polling only', { error })
    }
  }

  private stopNativeClipboardWatcher(): void {
    if (!this.clipboardNativeWatcher) return
    const watcher = this.clipboardNativeWatcher
    this.clipboardNativeWatcher = null
    try {
      watcher.stop()
    } catch (error) {
      clipboardLog.debug('Failed to stop clipboard native watcher', { error })
    }
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
    const phaseDurations: ClipboardPhaseDurations = {}
    try {
      await trackPhaseAsync(phaseDurations, 'gate.waitForIdle', async () => {
        await appTaskGate.waitForIdle()
      })

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
        clipboardLog.warn('Clipboard cache hydrate slow', {
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

  public async getItemById(id: number): Promise<IClipboardItem | null> {
    if (!this.db || !Number.isFinite(id)) {
      return null
    }

    const cached = this.memoryCache.find((item) => item.id === id)
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

  private toLegacyClipboardItem(item: IClipboardItem | null): LegacyClipboardItem | null {
    const normalized = this.toClientItem(item)
    if (!normalized) return null

    const timestampValue =
      normalized.timestamp instanceof Date
        ? normalized.timestamp.getTime()
        : normalized.timestamp
          ? new Date(normalized.timestamp).getTime()
          : null

    return {
      id: normalized.id,
      type: normalized.type,
      content: normalized.content ?? '',
      thumbnail: normalized.thumbnail ?? null,
      rawContent: normalized.rawContent ?? null,
      sourceApp: normalized.sourceApp ?? null,
      timestamp: Number.isFinite(timestampValue) ? timestampValue : null,
      isFavorite: normalized.isFavorite ?? null,
      metadata: normalized.metadata ?? null,
      meta: normalized.meta ?? null
    }
  }

  private toClipboardQueryRequest(
    request: ClipboardQueryRequest | LegacyClipboardQueryRequest | null | undefined
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

  private async queryClipboardHistory(
    request: ClipboardQueryRequest | LegacyClipboardQueryRequest | null | undefined
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

  private readClipboardSnapshot(): ClipboardReadResponse {
    const formats = clipboard.availableFormats()
    const text = clipboard.readText()
    const html = clipboard.readHTML()
    const image = clipboard.readImage()
    const hasImage = !image.isEmpty()
    const files = this.clipboardHelper?.readClipboardFiles() ?? []
    const hasFiles = files.length > 0
    return { text, html, hasImage, hasFiles, formats }
  }

  private async readClipboardImage(
    request: ClipboardReadImageRequest
  ): Promise<ClipboardReadImageResponse | null> {
    const image = clipboard.readImage()
    if (image.isEmpty()) {
      return null
    }
    const size = image.getSize()
    const preview = request?.preview ?? true
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
        {
          interval: CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS,
          unit: 'milliseconds',
          lane: 'maintenance',
          backpressure: 'coalesce',
          dedupeKey: CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID,
          maxInFlight: 1,
          timeoutMs: 60_000,
          jitterMs: 2000
        }
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

  private getActiveAppSnapshot(): Awaited<ReturnType<typeof activeAppService.getActiveApp>> | null {
    const now = Date.now()
    if (this.activeAppCache && now - this.activeAppCache.fetchedAt < this.activeAppCacheTtlMs) {
      return this.activeAppCache.value
    }
    this.scheduleActiveAppRefresh()
    return this.activeAppCache?.value ?? null
  }

  private scheduleActiveAppRefresh(): void {
    if (this.activeAppRefreshInFlight || this.isDestroyed) return
    this.activeAppRefreshInFlight = true
    setImmediate(() => {
      void this.refreshActiveAppSnapshot().finally(() => {
        this.activeAppRefreshInFlight = false
      })
    })
  }

  private async refreshActiveAppSnapshot(): Promise<void> {
    if (this.isDestroyed) return
    const now = Date.now()
    try {
      const activeApp = await activeAppService.getActiveApp({
        includeIcon: false
      })
      this.activeAppCache = { value: activeApp, fetchedAt: now }
    } catch (error) {
      clipboardLog.debug('Failed to refresh active app info', { error })
      this.activeAppCache = { value: null, fetchedAt: now }
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

  private shouldLogStageB(now: number): boolean {
    if (now - this.lastStageBLogAt < CLIPBOARD_STAGE_B_LOG_THROTTLE_MS) return false
    this.lastStageBLogAt = now
    return true
  }

  private enqueueClipboardStageB(job: Omit<ClipboardStageBJob, 'generation'>): void {
    this.clipboardStageBGeneration += 1
    this.clipboardStageBJob = {
      ...job,
      generation: this.clipboardStageBGeneration
    }

    if (this.clipboardStageBInFlight) {
      const now = Date.now()
      if (this.shouldLogStageB(now)) {
        clipboardLog.debug('Clipboard stage-b coalesced by latest generation', {
          meta: { generation: this.clipboardStageBGeneration, clipboardId: job.clipboardId }
        })
      }
      return
    }

    setImmediate(() => {
      void this.runClipboardStageBLoop()
    })
  }

  private async runClipboardStageBLoop(): Promise<void> {
    if (this.clipboardStageBInFlight) return
    this.clipboardStageBInFlight = true
    try {
      while (this.clipboardStageBJob && !this.isDestroyed) {
        const job = this.clipboardStageBJob
        this.clipboardStageBJob = null
        await this.processClipboardStageBJob(job)
      }
    } finally {
      this.clipboardStageBInFlight = false
    }
  }

  private async processClipboardStageBJob(job: ClipboardStageBJob): Promise<void> {
    const latestGeneration = this.clipboardStageBGeneration
    if (job.generation < latestGeneration) {
      return
    }

    if (!job.item.id) return

    try {
      await ocrService.enqueueFromClipboard({
        clipboardId: job.item.id,
        item: job.item,
        formats: job.formats
      })
    } catch (error) {
      clipboardLog.warn('Failed to enqueue clipboard OCR', { error })
    }

    const activeApp = this.getActiveAppSnapshot()
    if (!activeApp) {
      return
    }

    if (job.generation < this.clipboardStageBGeneration) {
      return
    }

    const sourceApp =
      activeApp.bundleId ||
      activeApp.identifier ||
      activeApp.displayName ||
      job.item.sourceApp ||
      null
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

    if (this.db) {
      try {
        const current = this.memoryCache.find((entry) => entry.id === job.clipboardId)
        const nextMetadata = this.mergeMetadataString(current?.metadata, patch)
        await this.withDbWrite(
          'clipboard.stage-b.source',
          () =>
            this.db!.update(clipboardHistory)
              .set({
                sourceApp,
                metadata: nextMetadata
              })
              .where(eq(clipboardHistory.id, job.clipboardId)),
          { droppable: true }
        )
      } catch (error) {
        clipboardLog.debug('Clipboard stage-b source update skipped', { error })
      }
    }

    this.handleMetaPatch(job.clipboardId, patch)
    const index = this.memoryCache.findIndex((entry) => entry.id === job.clipboardId)
    if (index >= 0) {
      this.memoryCache[index] = {
        ...this.memoryCache[index],
        sourceApp
      }
    }

    this.persistMetaEntriesSafely(
      job.clipboardId,
      patch,
      Object.entries(patch).map(([key, value]) => ({ key, value })),
      { droppable: true }
    )
  }

  private async withDbWrite<T>(
    label: string,
    operation: () => Promise<T>,
    options?: { droppable?: boolean }
  ): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), options)
  }

  private shouldLogMetaQueuePressure(now: number): boolean {
    if (now - this.lastMetaQueuePressureLogAt < CLIPBOARD_META_LOG_THROTTLE_MS) return false
    this.lastMetaQueuePressureLogAt = now
    return true
  }

  private async persistMetaEntries(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[],
    options?: { droppable?: boolean }
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

    await this.withDbWrite(
      'clipboard.meta',
      () => this.db!.insert(clipboardHistoryMeta).values(values),
      options
    )
  }

  private isForeignKeyConstraintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /foreign key constraint failed/i.test(message)
  }

  private isDroppedDbWriteTaskError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('DB write task dropped')
  }

  private persistMetaEntriesSafely(
    clipboardId: number,
    meta: Record<string, unknown>,
    entries?: ClipboardMetaEntry[],
    options?: { droppable?: boolean }
  ): void {
    void this.persistMetaEntries(clipboardId, meta, entries, options).catch((error) => {
      if (this.isDestroyed) return

      if (this.isDroppedDbWriteTaskError(error)) {
        clipboardLog.debug('Clipboard meta write dropped due to queue pressure', {
          meta: { clipboardId }
        })
        return
      }

      if (this.isForeignKeyConstraintError(error)) {
        clipboardLog.warn('Clipboard meta write skipped because parent entry is missing', {
          meta: { clipboardId }
        })
        return
      }

      clipboardLog.warn('Clipboard meta write failed', { error, meta: { clipboardId } })
    })
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

    const inserted = await this.withDbWrite('clipboard.custom.persist', () =>
      this.db!.insert(clipboardHistory).values(record).returning()
    )
    if (inserted.length === 0) {
      return null
    }

    const persisted = inserted[0] as IClipboardItem
    persisted.meta = mergedMeta

    if (persisted.id) {
      const queueStats = dbWriteScheduler.getStats()
      if (queueStats.queued >= CLIPBOARD_META_QUEUE_LIMIT) {
        const now = Date.now()
        if (this.shouldLogMetaQueuePressure(now)) {
          clipboardLog.warn('Clipboard meta skipped (queue pressure)', {
            meta: { queued: queueStats.queued }
          })
        }
      } else {
        this.persistMetaEntriesSafely(persisted.id, mergedMeta, undefined, { droppable: true })
      }
    }

    this.updateMemoryCache(persisted)
    this.notifyTransportChange()

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
    this.ensureActiveAppRefreshTask()
    this.scheduleActiveAppRefresh()
    void this.startNativeClipboardWatcher()
  }

  private ensureActiveAppRefreshTask(): void {
    if (pollingService.isRegistered(CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID)) {
      return
    }

    pollingService.register(
      CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID,
      () => {
        this.scheduleActiveAppRefresh()
      },
      {
        interval: CLIPBOARD_ACTIVE_APP_REFRESH_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'realtime',
        backpressure: 'latest_wins',
        dedupeKey: CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 2000,
        jitterMs: 120
      }
    )
    pollingService.start()
  }

  private async runClipboardMonitor(options?: { bypassCooldown?: boolean }): Promise<void> {
    if (this.clipboardCheckInFlight) {
      this.clipboardCheckPending = true
      return
    }
    this.clipboardCheckInFlight = true
    let bypassCooldown = options?.bypassCooldown ?? false
    try {
      do {
        this.clipboardCheckPending = false
        try {
          await this.checkClipboard({ bypassCooldown })
        } catch (error) {
          clipboardLog.warn('Clipboard check failed', { error })
        }
        bypassCooldown = bypassCooldown || this.clipboardCheckPending
      } while (this.clipboardCheckPending && !this.isDestroyed)
    } finally {
      this.clipboardCheckInFlight = false
      this.clipboardCheckPending = false
    }
  }

  private async checkClipboard(options?: { bypassCooldown?: boolean }): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }
    if (appTaskGate.isActive()) {
      return
    }
    const now = Date.now()
    if (!options?.bypassCooldown && now < this.clipboardCheckCooldownUntil) {
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
    const phaseDurations: ClipboardPhaseDurations = {}
    try {
      const helper = this.clipboardHelper
      trackPhase(phaseDurations, 'helper.bootstrap', () => {
        helper.bootstrap()
      })

      const formats = trackPhase(phaseDurations, 'clipboard.availableFormats', () => {
        return clipboard.availableFormats()
      })
      if (formats.length === 0) {
        return
      }

      // Fast-path change detection: Skip processing if nothing changed
      const sortedFormats = trackPhase(phaseDurations, 'signature.sortFormats', () => {
        return [...formats].sort()
      })
      const formatsKey = trackPhase(phaseDurations, 'signature.formatsKey', () => {
        return sortedFormats.join(',')
      })
      const hasFileFormats = includesAny(formats, FILE_URL_FORMATS)
      const hasImageFormats = includesAny(formats, IMAGE_FORMATS)
      const hasTextFormats = includesAny(formats, TEXT_FORMATS)
      const hasHtmlFormats = includesAny(formats, HTML_FORMATS)
      let prefetchedText: string | undefined
      let prefetchedFiles: string[] | undefined
      let prefetchedImage: NativeImage | null | undefined

      const readPrefetchedText = (): string => {
        if (prefetchedText !== undefined) return prefetchedText
        prefetchedText = trackPhase(phaseDurations, 'clipboard.readText', () =>
          clipboard.readText()
        )
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

      const lastFormatsKey = helper.lastFormatsKey
      const sameFormats = helper.lastFormats.length > 0 && lastFormatsKey === formatsKey
      if (sameFormats && helper.lastChangeHash === quickHash) {
        return
      }

      helper.lastFormats = sortedFormats
      helper.lastFormatsKey = formatsKey
      helper.lastChangeHash = quickHash

      const metaEntries: ClipboardMetaEntry[] = [{ key: 'formats', value: formats }]
      let item: Omit<IClipboardItem, 'timestamp' | 'id' | 'metadata' | 'meta'> | null = null

      // Read image once and cache to avoid duplicate clipboard.readImage() calls.
      // Each readImage() call is synchronous and can cost 20-100ms for large images.
      let cachedImage: NativeImage | null = hasImageFormats ? readPrefetchedImage() : null

      // Priority: FILES (with image) > IMAGE > FILES (no image) > TEXT
      // Check for files first to handle video files with thumbnails correctly
      if (hasFileFormats) {
        const files = readPrefetchedFiles()
        if (trackPhase(phaseDurations, 'diff.files', () => helper.didFilesChange(files))) {
          const serialized = trackPhase(phaseDurations, 'files.serialize', () =>
            JSON.stringify(files)
          )
          let thumbnail: string | undefined
          let imageSize: { width: number; height: number } | undefined

          // Check if there's an associated image (e.g., video thumbnail)
          if (cachedImage) {
            const currentImage = cachedImage
            trackPhase(phaseDurations, 'image.prime', () => {
              helper.primeImage(currentImage)
            })
            imageSize = trackPhase(phaseDurations, 'image.size', () => currentImage.getSize())
            thumbnail = trackPhase(phaseDurations, 'image.thumbnail', () => {
              return currentImage.resize({ width: 128 }).toDataURL()
            })
            clipboardLog.info('File with thumbnail detected', {
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
          item = {
            type: 'files',
            content: serialized,
            thumbnail
          }
        }
      }

      // Check for standalone image (only if no files detected)
      if (!item && cachedImage) {
        const currentImage = cachedImage
        if (trackPhase(phaseDurations, 'diff.image', () => helper.didImageChange(currentImage))) {
          trackPhase(phaseDurations, 'text.markEmpty', () => {
            helper.markText('')
          })
          const size = trackPhase(phaseDurations, 'image.size', () => currentImage.getSize())
          metaEntries.push({ key: 'image_size', value: size })

          // Generate thumbnail synchronously (lightweight, ~128px)
          const thumbnail = trackPhase(phaseDurations, 'image.thumbnail', () => {
            return currentImage.resize({ width: 128 }).toDataURL()
          })

          // Yield to event loop before heavy PNG encoding + file I/O
          await trackPhaseAsync(
            phaseDurations,
            'eventLoop.yieldBeforeImageEncode',
            async () =>
              await new Promise<void>((resolve) => {
                setImmediate(resolve)
              })
          )

          const png = trackPhase(phaseDurations, 'image.encodePng', () => currentImage.toPNG())

          // Release the cached image reference before async file I/O
          // to allow GC to reclaim the NativeImage and PNG buffer sooner
          cachedImage = null

          const stored = await trackPhaseAsync(
            phaseDurations,
            'image.persistTempFile',
            async () => {
              return await tempFileService.createFile({
                namespace: CLIPBOARD_IMAGE_NAMESPACE,
                ext: 'png',
                buffer: png,
                prefix: 'clipboard-image'
              })
            }
          )
          metaEntries.push({ key: 'image_file_path', value: stored.path })
          metaEntries.push({ key: 'image_file_size', value: stored.sizeBytes })
          item = {
            type: 'image',
            content: stored.path,
            thumbnail
          }
        }
      }

      if (!item && hasTextFormats) {
        const text = readPrefetchedText()
        if (trackPhase(phaseDurations, 'diff.text', () => helper.didTextChange(text))) {
          const html = hasHtmlFormats
            ? trackPhase(phaseDurations, 'clipboard.readHTML', () => clipboard.readHTML())
            : ''
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

      const metadataPayload = trackPhase(phaseDurations, 'meta.stringify', () => {
        return Object.keys(metaObject).length > 0 ? JSON.stringify(metaObject) : null
      })
      const record = {
        ...item,
        metadata: metadataPayload,
        timestamp: new Date()
      }

      // Yield before DB write to avoid stacking all heavy work in one tick
      await trackPhaseAsync(
        phaseDurations,
        'eventLoop.yieldBeforePersist',
        async () =>
          await new Promise<void>((resolve) => {
            setImmediate(resolve)
          })
      )

      const persistContext = enterPerfContext('Clipboard.persist', { type: item.type })
      const persistStart = performance.now()
      let inserted: IClipboardItem[] = []
      try {
        const queueStats = dbWriteScheduler.getStats()
        inserted = await trackPhaseAsync(phaseDurations, 'db.persistInsert', async () => {
          return await this.withDbWrite('clipboard.persist', () =>
            this.db!.insert(clipboardHistory).values(record).returning()
          )
        })
        const persistDuration = performance.now() - persistStart
        if (persistDuration > 200) {
          const contentLength = typeof item.content === 'string' ? item.content.length : 0
          const thumbnailLength = typeof item.thumbnail === 'string' ? item.thumbnail.length : 0
          clipboardLog.warn('Clipboard persist slow', {
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
      if (inserted.length === 0) {
        return
      }

      const persisted = inserted[0] as IClipboardItem
      persisted.meta = metaObject

      if (persisted.id) {
        const queueStats = dbWriteScheduler.getStats()
        if (queueStats.queued >= CLIPBOARD_META_QUEUE_LIMIT) {
          const now = Date.now()
          if (this.shouldLogMetaQueuePressure(now)) {
            clipboardLog.warn('Clipboard meta skipped (queue pressure)', {
              meta: { queued: queueStats.queued }
            })
          }
        } else {
          this.persistMetaEntriesSafely(persisted.id, metaObject, metaEntries, {
            droppable: true
          })
        }
        this.enqueueClipboardStageB({
          clipboardId: persisted.id!,
          item: persisted,
          formats
        })
      }

      this.updateMemoryCache(persisted)
      this.notifyTransportChange()

      const activePlugin = windowManager.getAttachedPlugin()
      if (
        activePlugin?._uniqueChannelKey &&
        windowManager.shouldForwardClipboardChange(persisted.type)
      ) {
        this.transport
          ?.sendToPlugin(activePlugin.name, CoreBoxEvents.clipboard.change, { item: persisted })
          .catch(() => {})
          .catch((error) => {
            clipboardLog.warn('Failed to notify plugin UI view about clipboard change', { error })
          })
      }
    } finally {
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
        this.clipboardCheckCooldownUntil = Date.now() + cooldownMs
      } else {
        this.clipboardCheckCooldownUntil = 0
      }

      pollingService.setTaskMeta(CLIPBOARD_POLL_TASK_ID, {
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
        clipboardLog.warn('Clipboard check slow', {
          meta: {
            durationMs: roundedDurationMs,
            cooldownMs,
            ...phaseDiagnostics
          }
        })
      }
      dispose()
    }
  }

  private extractPayloadSdkApi(payload: unknown): number | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }
    const sdkapi = (payload as { _sdkapi?: number })._sdkapi
    return typeof sdkapi === 'number' ? sdkapi : undefined
  }

  private resolveSdkApiForPluginCall(pluginId: string, payload: unknown): number | undefined {
    const payloadSdkApi = this.extractPayloadSdkApi(payload)
    const plugin = pluginModule.pluginManager?.getPluginByName(pluginId) as
      | { sdkapi?: number }
      | undefined
    const declaredSdkApi = typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined

    if (
      typeof declaredSdkApi === 'number' &&
      declaredSdkApi >= CAPABILITY_AUTH_MIN_VERSION &&
      typeof payloadSdkApi === 'number' &&
      payloadSdkApi !== declaredSdkApi
    ) {
      const error = new Error(
        `Plugin sdkapi mismatch: payload=${payloadSdkApi}, declared=${declaredSdkApi}`
      ) as Error & { code?: string; pluginId?: string }
      error.code = 'SDKAPI_MISMATCH'
      error.pluginId = pluginId
      throw error
    }

    return declaredSdkApi ?? payloadSdkApi
  }

  private enforceClipboardPermission(
    pluginId: string | undefined,
    permissionId: 'clipboard:read' | 'clipboard:write',
    payload: unknown
  ): void {
    if (!pluginId) {
      return
    }

    const permModule = getPermissionModule()
    if (!permModule) {
      return
    }

    const sdkapi = this.resolveSdkApiForPluginCall(pluginId, payload)
    try {
      permModule.enforcePermission(pluginId, permissionId, sdkapi)
    } catch (error) {
      const permissionError = error as Error & {
        code?: string
        permissionId?: string
        pluginId?: string
        showRequest?: boolean
      }
      if (permissionError.code === 'PERMISSION_DENIED') {
        const wrappedError = new Error(
          `[CLIPBOARD_CAPABILITY_UNAVAILABLE] ${permissionError.message}`
        ) as Error & {
          code?: string
          permissionId?: string
          pluginId?: string
          showRequest?: boolean
        }
        wrappedError.code = 'CLIPBOARD_CAPABILITY_UNAVAILABLE'
        wrappedError.permissionId = permissionId
        wrappedError.pluginId = pluginId
        wrappedError.showRequest = permissionError.showRequest
        throw wrappedError
      }
      throw error
    }
  }

  private registerTransportHandlers(): void {
    const channel = genTouchApp().channel
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
      this.transport.on(ClipboardEvents.getLatest, (_request: void, context: HandlerContext) => {
        this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
        const latest = this.getLatestItem()
        return latest ? this.toTransportItem(latest) : null
      })
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.getHistory,
        async (request: ClipboardQueryRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
          const { rows, total, page, limit } = await this.queryClipboardHistory(request)
          const items = rows
            .map((row) => this.toTransportItem(row))
            .filter((item): item is ClipboardItem => !!item)

          return { items, total, page, limit, pageSize: limit } satisfies ClipboardQueryResponse
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.apply,
        async (request: ClipboardApplyRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
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
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.delete,
        async (request: ClipboardDeleteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
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
            clipboardLog.warn('Failed to delete clipboard image file for transport delete', {
              error
            })
          }
          await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, request.id))
          this.memoryCache = this.memoryCache.filter((item) => item.id !== request.id)
          this.notifyTransportChange()
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.setFavorite,
        async (request: ClipboardSetFavoriteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
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
      this.transport.on(
        ClipboardEvents.clearHistory,
        async (_request: void, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', undefined)
          if (!this.db) {
            return
          }
          await this.cleanupHistory({ type: 'all' })
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.getImageUrl,
        async (
          request: ClipboardGetImageUrlRequest,
          context: HandlerContext
        ): Promise<ClipboardGetImageUrlResponse> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
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
      )
    )

    this.transportDisposers.push(
      this.transport.onStream(
        ClipboardEvents.change,
        (_request: void, context: StreamContext<ClipboardChangePayload>) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
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
      this.transport.on(
        ClipboardEvents.write,
        async (request: ClipboardWriteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          if (!request) return
          const hasDirectPayload =
            typeof request.text === 'string' ||
            typeof request.html === 'string' ||
            typeof request.image === 'string' ||
            (Array.isArray(request.files) && request.files.length > 0)

          if (hasDirectPayload) {
            await writePayload({
              text: request.text,
              html: request.html,
              image: request.image,
              files: request.files
            })
            return
          }

          if (request.type === 'image') {
            await writePayload({ image: request.value ?? '' })
            return
          }
          if (request.type === 'html') {
            await writePayload({ html: request.value ?? '' })
            return
          }
          await writePayload({ text: request.value ?? '' })
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.read,
        async (_request: void, context: HandlerContext): Promise<ClipboardReadResponse> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
          return this.readClipboardSnapshot()
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.readImage,
        async (
          request: ClipboardReadImageRequest,
          context: HandlerContext
        ): Promise<ClipboardReadImageResponse | null> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
          return await this.readClipboardImage(request)
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.readFiles,
        async (_request: void, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
          return this.clipboardHelper?.readClipboardFiles() ?? []
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.clear, async (_request: void, context: HandlerContext) => {
        this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', undefined)
        clipboard.clear()
      })
    )

    this.transportDisposers.push(
      this.transport.on(
        ClipboardEvents.copyAndPaste,
        async (
          request: ClipboardCopyAndPasteRequest,
          context: HandlerContext
        ): Promise<ClipboardActionResult> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          try {
            const { text, html, image, files, delayMs, hideCoreBox } = request ?? {}
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
        }
      )
    )

    this.transportDisposers.push(
      this.transport.on(ClipboardEvents.queryMeta, async (payload, context) => {
        this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', payload)
        return await this.queryHistoryByMeta(payload ?? {})
      })
    )

    // Legacy raw IPC compatibility for older plugin bundles.
    this.transportDisposers.push(
      this.transport.on(
        clipboardLegacyGetLatestEvent,
        (_request: void, context: HandlerContext): LegacyClipboardItem | null => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
          return this.toLegacyClipboardItem(this.getLatestItem() ?? null)
        }
      ),
      this.transport.on(
        clipboardLegacyGetHistoryEvent,
        async (
          request: LegacyClipboardQueryRequest,
          context: HandlerContext
        ): Promise<LegacyClipboardQueryResponse> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
          const { rows, total, page, limit } = await this.queryClipboardHistory(request)
          return {
            history: rows
              .map((row) => this.toLegacyClipboardItem(row))
              .filter((item): item is LegacyClipboardItem => Boolean(item)),
            total,
            page,
            pageSize: limit,
            limit
          }
        }
      ),
      this.transport.on(
        clipboardLegacySetFavoriteEvent,
        async (request: ClipboardSetFavoriteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          if (!this.db || !Number.isFinite(request?.id)) return
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
      ),
      this.transport.on(
        clipboardLegacyDeleteItemEvent,
        async (request: ClipboardDeleteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          if (!this.db || !Number.isFinite(request?.id)) return
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
            clipboardLog.warn('Failed to delete clipboard image file for legacy delete', { error })
          }
          await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, request.id))
          this.memoryCache = this.memoryCache.filter((item) => item.id !== request.id)
          this.notifyTransportChange()
        }
      ),
      this.transport.on(
        clipboardLegacyClearHistoryEvent,
        async (_request: void, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', undefined)
          if (!this.db) return
          await this.cleanupHistory({ type: 'all' })
        }
      ),
      this.transport.on(
        clipboardLegacyApplyToActiveAppEvent,
        async (
          request: ClipboardApplyPayload,
          context: HandlerContext
        ): Promise<ClipboardActionResult> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          try {
            const hasInlinePayload =
              typeof request?.text === 'string' ||
              typeof request?.html === 'string' ||
              Array.isArray(request?.files) ||
              request?.type === 'image' ||
              request?.item?.type === 'image'

            if (!hasInlinePayload && this.db && Number.isFinite(request?.item?.id)) {
              const [row] = await this.db
                .select()
                .from(clipboardHistory)
                .where(eq(clipboardHistory.id, Number(request.item?.id)))
                .limit(1)
              if (row) {
                await this.applyToActiveApp({
                  item: row as unknown as IClipboardItem,
                  hideCoreBox: request.hideCoreBox,
                  delayMs: request.delayMs
                })
                return { success: true }
              }
            }

            await this.applyToActiveApp(request ?? {})
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { success: false, message }
          }
        }
      ),
      this.transport.on(
        clipboardLegacyCopyAndPasteEvent,
        async (
          request: ClipboardCopyAndPasteRequest,
          context: HandlerContext
        ): Promise<ClipboardActionResult> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          try {
            const { text, html, image, files, delayMs, hideCoreBox } = request ?? {}
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
        }
      ),
      this.transport.on(
        clipboardLegacyWriteTextEvent,
        async (request: { text?: string }, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          await writePayload({ text: request?.text ?? '' })
        }
      ),
      this.transport.on(
        clipboardLegacyWriteEvent,
        async (request: ClipboardWriteRequest, context: HandlerContext) => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', request)
          if (!request) return
          const hasDirectPayload =
            typeof request.text === 'string' ||
            typeof request.html === 'string' ||
            typeof request.image === 'string' ||
            (Array.isArray(request.files) && request.files.length > 0)
          if (hasDirectPayload) {
            await writePayload({
              text: request.text,
              html: request.html,
              image: request.image,
              files: request.files
            })
            return
          }
          if (request.type === 'image') {
            await writePayload({ image: request.value ?? '' })
            return
          }
          if (request.type === 'html') {
            await writePayload({ html: request.value ?? '' })
            return
          }
          await writePayload({ text: request.value ?? '' })
        }
      ),
      this.transport.on(
        clipboardLegacyReadEvent,
        async (_request: void, context: HandlerContext): Promise<ClipboardReadResponse> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
          return this.readClipboardSnapshot()
        }
      ),
      this.transport.on(
        clipboardLegacyReadImageEvent,
        async (
          request: ClipboardReadImageRequest,
          context: HandlerContext
        ): Promise<ClipboardReadImageResponse | null> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
          return await this.readClipboardImage(request)
        }
      ),
      this.transport.on(
        clipboardLegacyReadFilesEvent,
        async (_request: void, context: HandlerContext): Promise<string[]> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', undefined)
          return this.clipboardHelper?.readClipboardFiles() ?? []
        }
      ),
      this.transport.on(
        clipboardLegacyClearEvent,
        async (_request: void, context: HandlerContext): Promise<void> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:write', undefined)
          clipboard.clear()
        }
      ),
      this.transport.on(
        clipboardLegacyGetImageUrlEvent,
        async (
          request: ClipboardGetImageUrlRequest,
          context: HandlerContext
        ): Promise<ClipboardGetImageUrlResponse> => {
          this.enforceClipboardPermission(context.plugin?.name, 'clipboard:read', request)
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
      )
    )
  }

  public destroy(): void {
    this.isDestroyed = true
    pollingService.unregister(CLIPBOARD_POLL_TASK_ID)
    pollingService.unregister(CLIPBOARD_ACTIVE_APP_REFRESH_TASK_ID)
    this.stopNativeClipboardWatcher()

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
    this.clipboardCheckInFlight = false
    this.clipboardCheckPending = false
    this.clipboardStageBJob = null
    this.clipboardStageBInFlight = false
    this.clipboardStageBGeneration = 0
    this.activeAppRefreshInFlight = false
    this.clipboardCheckCooldownUntil = 0
    this.clipboardNativeWatchInitTried = false
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
