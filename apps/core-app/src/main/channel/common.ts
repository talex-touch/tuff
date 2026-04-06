import type {
  AppSetting,
  MaybePromise,
  ModuleInitContext,
  ModuleKey,
  PlatformCapability
} from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  AppIndexAddPathRequest,
  AppIndexAddPathResult,
  AutoStartGetResponse,
  AutoStartUpdateRequest,
  AutoStartUpdateResponse,
  BatteryStatusPayload,
  FileIndexAddPathRequest,
  FileIndexAddPathResult,
  PlatformCapabilityListRequest,
  ReadFileRequest,
  SecureValueGetRequest,
  SecureValueSetRequest,
  StartupRequest,
  StartupResponse,
  TraySettingsGetResponse,
  TraySettingsUpdateRequest,
  TraySettingsUpdateResponse
} from '@talex-touch/utils/transport/events/types'
import type { Locale } from '../utils/i18n-helper'
import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { StorageList, isLocalhostUrl } from '@talex-touch/utils'
import { normalizeAbsolutePath } from '@talex-touch/utils/common/utils/safe-path'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import { AppEvents, PlatformEvents } from '@talex-touch/utils/transport/events'
import {
  BrowserWindow,
  app,
  dialog,
  powerMonitor,
  safeStorage,
  shell,
  type OpenDevToolsOptions,
  type OpenDialogOptions
} from 'electron'
import packageJson from '../../../package.json'
import { APP_SCHEMA, FILE_SCHEMA } from '../config/default'
import { genTouchChannel } from '../core/channel-core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { getStartupAnalytics } from '../modules/analytics'
import { appProvider } from '../modules/box-tool/addon/apps/app-provider'
import { fileProvider } from '../modules/box-tool/addon/files/file-provider'
import { buildVerificationModule } from '../modules/build-verification'
import { databaseModule } from '../modules/database'
import { createDbUtils } from '../db/utils'
import {
  platformCapabilityRegistry,
  registerDefaultPlatformCapabilities
} from '../modules/platform/capability-registry'
import { nativeShareService } from '../modules/flow-bus/native-share'
import { activeAppService, isActiveAppCapabilityAvailable } from '../modules/system/active-app'
import { getMainConfig, saveMainConfig, storageModule } from '../modules/storage'
import { getNetworkService } from '../modules/network'
import { deviceIdleService } from '../service/device-idle-service'
import { TalexTouch } from '../types'
import { setLocale } from '../utils/i18n-helper'
import { createLogger } from '../utils/logger'
import { safeOpHandler, toErrorMessage } from '../utils/safe-handler'
import { enterPerfContext } from '../utils/perf-context'
import { perfMonitor } from '../utils/perf-monitor'

const BATTERY_POLL_TASK_ID = 'common-channel.battery'
const pollingService = PollingService.getInstance()
const execFileAsync = promisify(execFile)
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const READ_FILE_CACHE_TTL_MS = 60_000
const READ_FILE_CACHE_MAX_ENTRIES = 120
const READ_FILE_CACHE_MAX_BYTES = 256 * 1024
const READ_FILE_CACHE_TOTAL_BYTES = 2 * 1024 * 1024
const SECURE_STORE_FILE = 'secure-store.json'
const SECURE_STORE_KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i
const DIALOG_APPROVED_TTL_MS = 10 * 60 * 1000
const DIALOG_APPROVED_MAX = 200
const TUFF_CLI_DETECT_CACHE_TTL_MS = 60_000
const TUFF_CLI_DETECT_TIMEOUT_MS = 1_500
const TUFF_CLI_COMMAND_CANDIDATES =
  process.platform === 'win32' ? ['tuff.cmd', 'tuff.exe', 'tuff'] : ['tuff']
const TUFF_CLI_CAPABILITY: PlatformCapability = {
  id: 'platform.tuff-cli',
  name: 'Tuff CLI',
  description: 'CLI 工具联动能力（Beta，开发中）',
  scope: 'plugin',
  status: 'beta'
}
const ACTIVE_APP_CAPABILITY: PlatformCapability = {
  id: 'platform.active-app',
  name: 'Active App',
  description: '当前前台应用与窗口上下文读取能力',
  scope: 'system',
  status: 'beta',
  sensitive: true
}
const NATIVE_SHARE_CAPABILITY: PlatformCapability = {
  id: 'platform.native-share',
  name: 'Native Share',
  description: '系统原生分享目标与分发能力',
  scope: 'system',
  status: 'beta'
}
const SYSTEM_PERMISSION_CAPABILITY: PlatformCapability = {
  id: 'platform.permission-checker',
  name: 'Permission Checker',
  description: '系统权限状态检查与设置跳转能力',
  scope: 'system',
  status: 'beta',
  sensitive: true
}
const log = createLogger('CommonChannel')

type RuntimeTraySettings = {
  showTray: boolean
  hideDock: boolean
  experimentalTray: boolean
  available: boolean
}

type RuntimeTrayManager = {
  applyRuntimeSettings?: () => RuntimeTraySettings
  getRuntimeSettingsSnapshot?: () => RuntimeTraySettings
}

const dialogApprovedPaths = new Map<string, number>()
let tuffCliDetectionCache: { available: boolean; checkedAt: number } | null = null

function normalizeSafeNamespaceSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return normalized || 'unknown'
}

// Preset import/export events
const dialogOpenFileEvent = defineRawEvent<
  {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  },
  { filePaths?: string[] }
>('dialog:open-file')

const dialogSaveFileEvent = defineRawEvent<
  { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
  { filePath?: string }
>('dialog:save-file')

const fsWriteFileEvent = defineRawEvent<{ path: string; data: string }, { success: boolean }>(
  'fs:write-file'
)
const fsReadFileEvent = defineRawEvent<{ path: string }, { data?: string; error?: string }>(
  'fs:read-file'
)
const wallpaperListImagesEvent = defineRawEvent<
  { folderPath: string; recursive?: boolean },
  { images: string[] }
>('wallpaper:list-images')
const wallpaperGetDesktopEvent = defineRawEvent<void, { path: string | null; error?: string }>(
  'wallpaper:get-desktop'
)
const wallpaperCopyToLibraryEvent = defineRawEvent<
  { sourcePath: string; type: 'file' | 'folder' },
  { storedPath: string | null; skippedCount: number; error?: string }
>('wallpaper:copy-to-library')
const batteryStatusEvent = AppEvents.power.batteryStatus

function resolveTfilePath(urlOrPath: string): string {
  if (!urlOrPath) return ''
  if (!urlOrPath.startsWith(`${FILE_SCHEMA}:`)) {
    return urlOrPath
  }

  const normalizeDecodedPath = (value: string): string => {
    const normalized = value.replace(/\\/g, '/')
    if (/^\/[a-z]:\//i.test(normalized)) {
      return normalized.slice(1)
    }
    if (/^[a-z]:\//i.test(normalized)) {
      return normalized
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

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

  try {
    const parsed = new URL(urlOrPath)
    if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
      return normalizeDecodedPath(decodeStable(`${parsed.hostname}:${parsed.pathname}`))
    }
    const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
    return normalizeDecodedPath(decodeStable(merged))
  } catch {
    const fullPrefix = `${FILE_SCHEMA}://`
    const compactPrefix = `${FILE_SCHEMA}:`
    const rawWithTail = urlOrPath.startsWith(fullPrefix)
      ? urlOrPath.slice(fullPrefix.length)
      : urlOrPath.slice(compactPrefix.length)
    const tailIndex = rawWithTail.search(/[?#]/)
    const body = tailIndex >= 0 ? rawWithTail.slice(0, tailIndex) : rawWithTail
    return normalizeDecodedPath(decodeStable(body))
  }
}

function isImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

async function listWallpaperImages(folderPath: string, recursive = false): Promise<string[]> {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const results: string[] = []
    for (const entry of entries) {
      const entryPath = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        if (recursive) {
          results.push(...(await listWallpaperImages(entryPath, true)))
        }
        continue
      }
      if (entry.isFile() && isImagePath(entry.name)) {
        results.push(entryPath)
      }
    }
    return results
  } catch (error) {
    log.warn('[CommonChannel] Failed to list wallpaper images', {
      meta: { folderPath, recursive, error: toErrorMessage(error) }
    })
    return []
  }
}

async function computeFileHash(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

async function execFileOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args)
    return typeof stdout === 'string' ? stdout.trim() : null
  } catch {
    return null
  }
}

async function getDesktopWallpaperPath(): Promise<string | null> {
  if (process.platform === 'win32') {
    const output = await execFileOutput('reg', [
      'query',
      'HKCU\\Control Panel\\Desktop',
      '/v',
      'WallPaper'
    ])
    if (!output) return null
    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.toLowerCase().startsWith('wallpaper'))
    if (!line) return null
    const parts = line.split(/\s{2,}/)
    return parts[parts.length - 1] || null
  }

  if (process.platform === 'darwin') {
    const output = await execFileOutput('osascript', [
      '-e',
      'tell application "System Events" to get POSIX path of (get picture of item 1 of desktops)'
    ])
    return output || null
  }

  if (process.platform === 'linux') {
    const output = await execFileOutput('gsettings', [
      'get',
      'org.gnome.desktop.background',
      'picture-uri'
    ])
    if (!output) return null
    const cleaned = output.replace(/^'+|'+$/g, '')
    if (!cleaned || cleaned === 'none') return null
    if (cleaned.startsWith('file://')) {
      return decodeURI(cleaned.replace('file://', ''))
    }
    return cleaned
  }

  return null
}

async function copyWallpaperFileToLibrary(
  sourcePath: string,
  libraryRoot: string,
  dbUtils: ReturnType<typeof createDbUtils> | null
): Promise<{ storedPath: string | null; skippedCount: number }> {
  if (!isImagePath(sourcePath)) {
    return { storedPath: null, skippedCount: 0 }
  }

  const ext = path.extname(sourcePath).toLowerCase()
  const hash = await computeFileHash(sourcePath)
  const storedPath = path.join(libraryRoot, `${hash}${ext}`)

  if (dbUtils) {
    const existing = await dbUtils.getWallpaperAssetByHash(hash)
    if (existing?.storedPath && (await fileExists(existing.storedPath))) {
      return { storedPath: existing.storedPath, skippedCount: 1 }
    }
  }

  if (await fileExists(storedPath)) {
    return { storedPath, skippedCount: 1 }
  }

  await fs.mkdir(libraryRoot, { recursive: true })
  await fs.copyFile(sourcePath, storedPath)
  const stat = await fs.stat(sourcePath)

  if (dbUtils) {
    await dbUtils.upsertWallpaperAsset({
      hash,
      originalPath: sourcePath,
      storedPath,
      type: 'file',
      size: stat.size,
      ext,
      createdAt: Date.now()
    })
  }

  return { storedPath, skippedCount: 0 }
}

async function copyWallpaperFolderToLibrary(
  sourcePath: string,
  libraryRoot: string,
  dbUtils: ReturnType<typeof createDbUtils> | null
): Promise<{ storedPath: string | null; skippedCount: number }> {
  const images = await listWallpaperImages(sourcePath, true)
  if (images.length === 0) {
    return { storedPath: null, skippedCount: 0 }
  }

  const folderName = normalizeSafeNamespaceSegment(path.basename(sourcePath))
  const folderHash = createHash('sha1').update(sourcePath).digest('hex').slice(0, 8)
  const folderDir = path.join(libraryRoot, 'folders', `${folderName}-${folderHash}`)
  await fs.mkdir(folderDir, { recursive: true })

  let skippedCount = 0
  for (const imagePath of images) {
    try {
      const ext = path.extname(imagePath).toLowerCase()
      const hash = await computeFileHash(imagePath)
      const storedPath = path.join(folderDir, `${hash}${ext}`)

      if (dbUtils) {
        const existing = await dbUtils.getWallpaperAssetByHash(hash)
        if (existing?.storedPath && (await fileExists(existing.storedPath))) {
          skippedCount += 1
          continue
        }
      }
      if (await fileExists(storedPath)) {
        skippedCount += 1
        continue
      }

      await fs.copyFile(imagePath, storedPath)
      const stat = await fs.stat(imagePath)

      if (dbUtils) {
        await dbUtils.upsertWallpaperAsset({
          hash,
          originalPath: imagePath,
          storedPath,
          type: 'file',
          size: stat.size,
          ext,
          createdAt: Date.now()
        })
      }
    } catch (error) {
      skippedCount += 1
      log.warn('[CommonChannel] Failed to copy wallpaper file from folder source', {
        meta: { sourcePath, imagePath, error: toErrorMessage(error) }
      })
    }
  }

  return { storedPath: folderDir, skippedCount }
}

interface ReadFileCacheEntry {
  content: string
  size: number
  cachedAt: number
}

const readFileCache = new Map<string, ReadFileCacheEntry>()
const readFileInflight = new Map<string, Promise<string>>()
let readFileCacheBytes = 0

interface OSInformation {
  arch: ReturnType<typeof os.arch>
  cpus: ReturnType<typeof os.cpus>
  endianness: ReturnType<typeof os.endianness>
  freemem: ReturnType<typeof os.freemem>
  homedir: ReturnType<typeof os.homedir>
  hostname: ReturnType<typeof os.hostname>
  loadavg: ReturnType<typeof os.loadavg>
  networkInterfaces: ReturnType<typeof os.networkInterfaces>
  platform: ReturnType<typeof os.platform>
  release: ReturnType<typeof os.release>
  tmpdir: ReturnType<typeof os.tmpdir>
  totalmem: ReturnType<typeof os.totalmem>
  type: ReturnType<typeof os.type>
  uptime: ReturnType<typeof os.uptime>
  userInfo: ReturnType<typeof os.userInfo>
  version: ReturnType<typeof os.version>
}

interface KeyManagerHolder {
  keyManager?: unknown
}
type AppPathName = Parameters<Electron.App['getPath']>[0]
interface RendererPerfReport {
  kind: string
  at: number
  eventName: string
  durationMs: number
  level?: 'warn' | 'error'
  meta?: Record<string, unknown>
  payloadPreview?: unknown
  stack?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getOptionalStringProp(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const prop = value[key]
  return typeof prop === 'string' ? prop : undefined
}

function normalizeCapabilityQuery(payload: unknown): PlatformCapabilityListRequest {
  const query: PlatformCapabilityListRequest = {}
  const scope = getOptionalStringProp(payload, 'scope')
  if (scope === 'system' || scope === 'plugin' || scope === 'ai') {
    query.scope = scope
  }
  const status = getOptionalStringProp(payload, 'status')
  if (status === 'stable' || status === 'beta' || status === 'alpha') {
    query.status = status
  }
  return query
}

function matchCapabilityQuery(
  capability: PlatformCapability,
  query: PlatformCapabilityListRequest
): boolean {
  if (query.scope && capability.scope !== query.scope) return false
  if (query.status && capability.status !== query.status) return false
  return true
}

async function detectTuffCliAvailability(): Promise<boolean> {
  const now = Date.now()
  if (
    tuffCliDetectionCache &&
    now - tuffCliDetectionCache.checkedAt <= TUFF_CLI_DETECT_CACHE_TTL_MS
  ) {
    return tuffCliDetectionCache.available
  }

  for (const command of TUFF_CLI_COMMAND_CANDIDATES) {
    try {
      await execFileAsync(command, ['--version'], {
        timeout: TUFF_CLI_DETECT_TIMEOUT_MS,
        windowsHide: true
      })
      tuffCliDetectionCache = { available: true, checkedAt: now }
      return true
    } catch (error) {
      const code = getOptionalStringProp(error, 'code')
      const signal = getOptionalStringProp(error, 'signal')
      if (code !== 'ENOENT' && signal !== 'SIGTERM') {
        log.debug('[CommonChannel] Tuff CLI probe failed', {
          meta: {
            command,
            code,
            signal,
            error: toErrorMessage(error)
          }
        })
      }
    }
  }

  tuffCliDetectionCache = { available: false, checkedAt: now }
  return false
}

async function listPlatformCapabilities(
  query: PlatformCapabilityListRequest
): Promise<PlatformCapability[]> {
  const capabilities = platformCapabilityRegistry.list(query)
  const appendDynamicCapability = (capability: PlatformCapability): void => {
    if (capabilities.some((item) => item.id === capability.id)) {
      return
    }
    if (matchCapabilityQuery(capability, query)) {
      capabilities.push(capability)
    }
  }

  if (await isActiveAppCapabilityAvailable()) {
    appendDynamicCapability(ACTIVE_APP_CAPABILITY)
  }

  if (nativeShareService.getAvailableTargets().length > 0) {
    appendDynamicCapability(NATIVE_SHARE_CAPABILITY)
  }

  if (
    process.platform === 'darwin' ||
    process.platform === 'win32' ||
    process.platform === 'linux'
  ) {
    appendDynamicCapability(SYSTEM_PERMISSION_CAPABILITY)
  }

  const tuffCliAvailable = await detectTuffCliAvailability()
  if (tuffCliAvailable) {
    appendDynamicCapability(TUFF_CLI_CAPABILITY)
  }
  return capabilities
}

function isLocale(value: string): value is Locale {
  return value === 'zh-CN' || value === 'en-US'
}

function getKeyManager(value: unknown): unknown {
  if (!isRecord(value)) return undefined
  if (!('keyManager' in value)) return undefined
  return (value as KeyManagerHolder).keyManager
}

function isRendererPerfReport(value: unknown): value is RendererPerfReport {
  if (!isRecord(value)) return false

  return (
    typeof value.kind === 'string' &&
    typeof value.at === 'number' &&
    typeof value.eventName === 'string' &&
    typeof value.durationMs === 'number'
  )
}

function closeApp(app: TalexTouch.TouchApp): void {
  app.window.close()

  app.app.quit()
}

function getOSInformation(): OSInformation {
  return {
    arch: os.arch(),
    cpus: os.cpus(),
    endianness: os.endianness(),
    freemem: os.freemem(),
    homedir: os.homedir(),
    hostname: os.hostname(),
    loadavg: os.loadavg(),
    networkInterfaces: os.networkInterfaces(),
    platform: os.platform(),
    release: os.release(),
    tmpdir: os.tmpdir(),
    totalmem: os.totalmem(),
    type: os.type(),
    uptime: os.uptime(),
    userInfo: os.userInfo(),
    version: os.version()
  }
}

function resolveLocalFilePath(source: string): string | null {
  if (!source) return null

  if (source.startsWith('file:')) {
    try {
      return normalizeAbsolutePath(fileURLToPath(source))
    } catch {
      return null
    }
  }

  if (source.startsWith(`${FILE_SCHEMA}:`)) {
    return normalizeAbsolutePath(resolveTfilePath(source))
  }

  return normalizeAbsolutePath(source)
}

function recordDialogPath(pathValue: string): void {
  const normalized = normalizeAbsolutePath(pathValue)
  if (!normalized) {
    return
  }

  dialogApprovedPaths.set(normalized, Date.now())
  if (dialogApprovedPaths.size <= DIALOG_APPROVED_MAX) {
    return
  }

  const entries = Array.from(dialogApprovedPaths.entries()).sort((a, b) => a[1] - b[1])
  for (const [key] of entries.slice(0, entries.length - DIALOG_APPROVED_MAX)) {
    dialogApprovedPaths.delete(key)
  }
}

function ensureApprovedDialogPath(pathValue: string): string {
  const normalized = normalizeAbsolutePath(pathValue)
  if (!normalized) {
    throw new Error('Invalid file path')
  }

  const timestamp = dialogApprovedPaths.get(normalized)
  if (!timestamp) {
    throw new Error('Path is not approved')
  }

  if (Date.now() - timestamp > DIALOG_APPROVED_TTL_MS) {
    dialogApprovedPaths.delete(normalized)
    throw new Error('Path approval expired')
  }

  return normalized
}

function getCachedReadFile(path: string): ReadFileCacheEntry | null {
  const entry = readFileCache.get(path)
  if (!entry) {
    return null
  }
  if (Date.now() - entry.cachedAt > READ_FILE_CACHE_TTL_MS) {
    readFileCache.delete(path)
    readFileCacheBytes = Math.max(0, readFileCacheBytes - entry.size)
    return null
  }
  readFileCache.delete(path)
  readFileCache.set(path, entry)
  return entry
}

function setCachedReadFile(path: string, content: string): void {
  const size = Buffer.byteLength(content, 'utf8')
  if (size > READ_FILE_CACHE_MAX_BYTES) {
    return
  }

  const existing = readFileCache.get(path)
  if (existing) {
    readFileCache.delete(path)
    readFileCacheBytes = Math.max(0, readFileCacheBytes - existing.size)
  }

  readFileCache.set(path, {
    content,
    size,
    cachedAt: Date.now()
  })
  readFileCacheBytes += size

  pruneReadFileCache()
}

function pruneReadFileCache(): void {
  while (
    readFileCache.size > READ_FILE_CACHE_MAX_ENTRIES ||
    readFileCacheBytes > READ_FILE_CACHE_TOTAL_BYTES
  ) {
    const oldest = readFileCache.keys().next().value as string | undefined
    if (!oldest) {
      break
    }
    const entry = readFileCache.get(oldest)
    if (entry) {
      readFileCacheBytes = Math.max(0, readFileCacheBytes - entry.size)
    }
    readFileCache.delete(oldest)
  }
}

export class CommonChannelModule extends BaseModule {
  static key: symbol = Symbol.for('CommonChannel')
  name: ModuleKey = CommonChannelModule.key

  private channel: ReturnType<typeof genTouchChannel> | null = null
  private transport: ITuffTransportMain | null = null
  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private transportDisposers: Array<() => void> = []
  private batteryPollTimer: NodeJS.Timeout | undefined
  private touchApp: TalexTouch.TouchApp | null = null

  constructor() {
    super(CommonChannelModule.key, {
      create: false,
      dirName: 'channel'
    })
  }

  async onInit({ app }: ModuleInitContext<TalexEvents>): Promise<void> {
    const touchApp = app as TalexTouch.TouchApp
    this.touchApp = touchApp
    const channel = genTouchChannel(touchApp)
    this.channel = channel
    this.transport = getTuffTransportMain(channel, getKeyManager(channel) ?? channel)
    const transport = this.transport
    if (!transport) {
      return
    }

    this.setupBatteryStatusBroadcast(transport)
    this.registerLegacyDialogWallpaperHandlers(transport, touchApp)

    const onOpenUrl = this.createOpenUrlHandler()
    this.bindOpenUrlListeners(touchApp, onOpenUrl)

    this.registerBuildVerificationStatusHandlers(transport)
    this.registerTransportHandlers()
  }

  private setupBatteryStatusBroadcast(
    transport: NonNullable<CommonChannelModule['transport']>
  ): void {
    const broadcastBatteryStatus = async (): Promise<void> => {
      const onBattery = safeIsOnBatteryPower()
      const percent = await safeGetBatteryPercent()
      const payload: BatteryStatusPayload = { onBattery, percent }

      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        try {
          transport.broadcastToWindow(win.id, batteryStatusEvent, payload)
        } catch {
          // Ignore broadcast errors
        }
      }
    }

    const startPolling = () => {
      if (pollingService.isRegistered(BATTERY_POLL_TASK_ID)) {
        return
      }
      pollingService.register(BATTERY_POLL_TASK_ID, () => broadcastBatteryStatus(), {
        interval: 120_000,
        unit: 'milliseconds'
      })
      pollingService.start()
    }

    const stopPolling = () => {
      pollingService.unregister(BATTERY_POLL_TASK_ID)
    }

    try {
      void broadcastBatteryStatus()

      if (safeIsOnBatteryPower()) {
        startPolling()
      }

      powerMonitor.on('on-ac', () => {
        stopPolling()
        void broadcastBatteryStatus()
      })

      powerMonitor.on('on-battery', () => {
        startPolling()
        void broadcastBatteryStatus()
      })
    } catch (error) {
      log.warn('[CommonChannel] Failed to initialize battery status broadcaster:', { error })
    }
  }

  private registerLegacyDialogWallpaperHandlers(
    transport: NonNullable<CommonChannelModule['transport']>,
    touchApp: TalexTouch.TouchApp
  ): void {
    this.transportDisposers.push(
      transport.on(dialogOpenFileEvent, async (payload) => {
        const options = isRecord(payload) ? payload : {}
        const dialogOptions: OpenDialogOptions = {
          title: typeof options.title === 'string' ? options.title : undefined,
          defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : undefined,
          buttonLabel: typeof options.buttonLabel === 'string' ? options.buttonLabel : undefined,
          filters: Array.isArray(options.filters)
            ? (options.filters as OpenDialogOptions['filters'])
            : undefined,
          properties: Array.isArray(options.properties)
            ? (options.properties as OpenDialogOptions['properties'])
            : ['openFile']
        }
        const result = await dialog.showOpenDialog(
          BrowserWindow.getFocusedWindow() ?? touchApp.window.window,
          dialogOptions
        )
        const filePaths = result.canceled ? [] : (result.filePaths ?? [])
        filePaths.forEach(recordDialogPath)
        return { filePaths }
      }),
      transport.on(wallpaperListImagesEvent, async (payload) => {
        const folderPath = typeof payload?.folderPath === 'string' ? payload.folderPath : ''
        const recursive = Boolean(payload?.recursive)
        if (!folderPath) {
          return { images: [] }
        }
        return { images: await listWallpaperImages(folderPath, recursive) }
      }),
      transport.on(wallpaperGetDesktopEvent, async () => {
        try {
          const desktopPath = await getDesktopWallpaperPath()
          if (desktopPath) {
            return { path: desktopPath }
          }
          const error = 'Desktop wallpaper path is unavailable on current system.'
          log.warn('[CommonChannel] Desktop wallpaper path is unavailable')
          return { path: null, error }
        } catch (error) {
          const message = toErrorMessage(error)
          log.warn('[CommonChannel] Failed to read desktop wallpaper path', {
            meta: { error: message }
          })
          return { path: null, error: message }
        }
      }),
      transport.on(wallpaperCopyToLibraryEvent, async (payload) => {
        const rawSourcePath = typeof payload?.sourcePath === 'string' ? payload.sourcePath : ''
        const sourcePath = resolveTfilePath(rawSourcePath).trim()
        const type = payload?.type === 'folder' ? 'folder' : 'file'
        if (!sourcePath) {
          return { storedPath: null, skippedCount: 0, error: 'Wallpaper source path is empty.' }
        }
        try {
          const stat = await fs.stat(sourcePath)
          if (type === 'folder' && !stat.isDirectory()) {
            return {
              storedPath: null,
              skippedCount: 0,
              error: 'Wallpaper source is not a directory.'
            }
          }
          if (type === 'file' && !stat.isFile()) {
            return { storedPath: null, skippedCount: 0, error: 'Wallpaper source is not a file.' }
          }
          if (type === 'file' && !isImagePath(sourcePath)) {
            return {
              storedPath: null,
              skippedCount: 0,
              error: 'Wallpaper source file is not a supported image.'
            }
          }
        } catch (error) {
          const message = toErrorMessage(error)
          log.warn('[CommonChannel] Wallpaper source path validation failed', {
            meta: { sourcePath, type, error: message }
          })
          return { storedPath: null, skippedCount: 0, error: message }
        }
        const dbUtils = this.getDbUtils()
        const libraryRoot = path.join(touchApp.app.getPath('userData'), 'wallpapers')
        try {
          if (type === 'folder') {
            const result = await copyWallpaperFolderToLibrary(sourcePath, libraryRoot, dbUtils)
            if (!result.storedPath) {
              return {
                storedPath: null,
                skippedCount: result.skippedCount,
                error: 'No supported images were found in the selected folder.'
              }
            }
            return result
          }
          return await copyWallpaperFileToLibrary(sourcePath, libraryRoot, dbUtils)
        } catch (error) {
          const message = toErrorMessage(error)
          log.warn('[CommonChannel] Failed to copy wallpaper to library', {
            meta: { sourcePath, type, error: message }
          })
          return { storedPath: null, skippedCount: 0, error: message }
        }
      })
    )
  }

  private createOpenUrlHandler(): (url: string) => Promise<void> {
    type OpenUrlDecision = 'skip' | 'open' | 'confirm'

    const shouldSkipPromptProtocols = new Set([APP_SCHEMA, FILE_SCHEMA])
    const rendererBaseUrl = process.env.ELECTRON_RENDERER_URL
    const rendererOrigin = (() => {
      if (!rendererBaseUrl) return null
      try {
        return new URL(rendererBaseUrl).origin
      } catch {
        return null
      }
    })()

    const isFrontendLocalUrl = (parsed: URL): boolean => {
      if (!isLocalhostUrl(parsed.toString())) return false

      if (rendererOrigin && parsed.origin === rendererOrigin) return true

      const hash = parsed.hash || ''
      return hash.startsWith('#/') || parsed.pathname.includes('/#/')
    }

    const getOpenUrlDecision = (url: string): OpenUrlDecision => {
      if (!url || url.startsWith('/') || url.startsWith('#')) return 'skip'

      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return 'skip'
      }

      const protocol = parsed.protocol.replace(':', '')

      if (shouldSkipPromptProtocols.has(protocol)) return 'skip'
      if (protocol === 'file') return 'open'

      if ((protocol === 'http' || protocol === 'https') && isLocalhostUrl(url)) {
        if (isFrontendLocalUrl(parsed)) {
          return 'skip'
        }
        return 'confirm'
      }

      return 'confirm'
    }

    return async (url: string) => {
      const decision = getOpenUrlDecision(url)
      if (decision === 'skip') return
      if (decision === 'open') {
        shell.openExternal(url)
        return
      }

      log.debug('open url', { meta: { url, decision } })
      shell.openExternal(url)
    }
  }

  private bindOpenUrlListeners(
    touchApp: TalexTouch.TouchApp,
    onOpenUrl: (url: string) => Promise<void>
  ): void {
    touchApp.app.addListener('open-url', (event, url) => {
      event.preventDefault()

      const regex = /^https?:\/\/(?:localhost|127\.0\.0\.1)/
      if (regex.test(url) && url.includes('/#/')) {
        return
      }

      void onOpenUrl(url)
    })

    touchEventBus.on(TalexEvents.OPEN_EXTERNAL_URL, (event) => {
      void onOpenUrl(event.data)
    })
  }

  private registerBuildVerificationStatusHandlers(
    transport: NonNullable<CommonChannelModule['transport']>
  ): void {
    const resolveBuildVerificationStatus = () => {
      try {
        if (buildVerificationModule?.getVerificationStatus) {
          const status = buildVerificationModule.getVerificationStatus()
          return {
            isOfficialBuild: status.isOfficialBuild,
            verificationFailed: status.verificationFailed,
            hasOfficialKey: status.isVerified
          }
        }
      } catch (error) {
        log.warn('[CommonChannel] Failed to get build verification status:', { error })
      }
      return {
        isOfficialBuild: false,
        verificationFailed: false,
        hasOfficialKey: false
      }
    }

    this.transportDisposers.push(
      transport.on(AppEvents.build.getVerificationStatus, resolveBuildVerificationStatus)
    )
  }

  private getDbUtils(): ReturnType<typeof createDbUtils> | null {
    if (this.dbUtils) {
      return this.dbUtils
    }

    try {
      this.dbUtils = createDbUtils(databaseModule.getDb())
      return this.dbUtils
    } catch (error) {
      log.warn('[CommonChannel] Failed to initialize database utils for wallpaper', { error })
      return null
    }
  }

  private registerTransportHandlers(): void {
    if (!this.transport || !this.channel) {
      return
    }
    const touchApp = this.touchApp
    if (!touchApp) {
      return
    }

    const transport = this.transport
    const registerSafeHandler = this.createSafeOperationHandler(transport)

    registerDefaultPlatformCapabilities()

    this.registerSystemTransportHandlers(transport, touchApp, registerSafeHandler)
    this.registerIndexSettingsTransportHandlers(transport)
    this.registerPresetTransportHandlers(transport, registerSafeHandler)
  }

  private createSafeOperationHandler(transport: NonNullable<CommonChannelModule['transport']>) {
    return <TReq, TExtra extends Record<string, unknown> = Record<string, never>>(
      event: TuffEvent<TReq, unknown> & { toEventName: () => string },
      handler: (payload: TReq, context: HandlerContext) => Promise<void | TExtra> | void | TExtra
    ) =>
      transport.on(
        event,
        safeOpHandler(handler, {
          onError: (error) => {
            log.warn(`[CommonChannel] Handler failed: ${event.toEventName()}`, {
              error: toErrorMessage(error)
            })
          }
        })
      )
  }

  private getAppSettingsSnapshot(): AppSetting {
    return getMainConfig(StorageList.APP_SETTING) as AppSetting
  }

  private updateAutoStart(enabled: AutoStartUpdateRequest): AutoStartUpdateResponse {
    const appSettings = this.getAppSettingsSnapshot()
    const startSilent = appSettings?.window?.startSilent === true

    const options: Electron.Settings = {
      openAtLogin: enabled === true,
      openAsHidden: enabled === true && startSilent
    }

    app.setLoginItemSettings(options)
    return app.getLoginItemSettings().openAtLogin
  }

  private getAutoStartStatus(): AutoStartGetResponse {
    return app.getLoginItemSettings().openAtLogin
  }

  private getRuntimeTrayManager(touchApp: TalexTouch.TouchApp): RuntimeTrayManager | null {
    const key = Symbol.for('TrayManager')
    const module = touchApp.moduleManager.getModule(key) as RuntimeTrayManager | undefined
    return module ?? null
  }

  private buildTraySettingsFromAppSettings(
    appSettings: AppSetting,
    touchApp: TalexTouch.TouchApp
  ): TraySettingsGetResponse {
    const setup = appSettings?.setup ?? {}
    const experimentalTray = setup.experimentalTray === true
    const trayManager = this.getRuntimeTrayManager(touchApp)
    const available = experimentalTray && trayManager !== null

    if (available && trayManager?.getRuntimeSettingsSnapshot) {
      return trayManager.getRuntimeSettingsSnapshot()
    }

    return {
      showTray: setup.showTray !== false,
      hideDock: setup.hideDock === true,
      experimentalTray,
      available
    }
  }

  private updateTraySettings(
    payload: TraySettingsUpdateRequest | undefined,
    touchApp: TalexTouch.TouchApp
  ): TraySettingsUpdateResponse {
    const appSettings = this.getAppSettingsSnapshot()
    const setup = appSettings?.setup ?? {}

    const nextShowTray =
      typeof payload?.showTray === 'boolean' ? payload.showTray : setup.showTray !== false
    const nextHideDock =
      typeof payload?.hideDock === 'boolean' ? payload.hideDock : setup.hideDock === true

    saveMainConfig(StorageList.APP_SETTING, {
      ...appSettings,
      setup: {
        ...setup,
        showTray: nextShowTray,
        hideDock: nextHideDock
      }
    })

    const updatedSettings = this.getAppSettingsSnapshot()
    const trayManager = this.getRuntimeTrayManager(touchApp)
    if (trayManager?.applyRuntimeSettings) {
      return trayManager.applyRuntimeSettings()
    }

    return this.buildTraySettingsFromAppSettings(updatedSettings, touchApp)
  }

  private registerSystemTransportHandlers(
    transport: NonNullable<CommonChannelModule['transport']>,
    touchApp: TalexTouch.TouchApp,
    registerSafeHandler: ReturnType<CommonChannelModule['createSafeOperationHandler']>
  ): void {
    const electronApp = touchApp.app

    this.transportDisposers.push(
      transport.on<StartupRequest, StartupResponse>(
        AppEvents.system.startup,
        (payload, context) => {
          const rendererStartTime =
            typeof payload?.rendererStartTime === 'number' ? payload.rendererStartTime : Date.now()
          const currentTime = Date.now()

          const sender = context.sender as Electron.WebContents | undefined
          const senderId = sender?.id ?? touchApp.window.window.webContents.id
          const primaryRendererId = touchApp.window.window.webContents.id

          if (senderId === primaryRendererId) {
            const analytics = getStartupAnalytics()
            analytics.setRendererProcessMetrics({
              startTime: rendererStartTime,
              readyTime: currentTime,
              domContentLoaded: undefined,
              firstInteractive: undefined,
              loadEventEnd: undefined
            })
          }

          return {
            id: senderId,
            version: touchApp.version,
            path: {
              rootPath: touchApp.rootPath,
              appPath: electronApp.getAppPath(),
              appDataPath: electronApp.getPath('appData'),
              userDataPath: electronApp.getPath('userData'),
              tempPath: electronApp.getPath('temp'),
              homePath: electronApp.getPath('home'),
              exePath: electronApp.getPath('exe'),
              modulePath: path.join(touchApp.rootPath, 'modules'),
              configPath: path.join(touchApp.rootPath, 'config'),
              pluginPath: path.join(touchApp.rootPath, 'plugins')
            },
            isPackaged: electronApp.isPackaged,
            isDev: touchApp.version === TalexTouch.AppVersion.DEV,
            isRelease: touchApp.version === TalexTouch.AppVersion.RELEASE,
            platform: process.platform,
            arch: process.arch,
            t: {
              _s: process.getCreationTime() ?? Date.now(),
              s: rendererStartTime,
              e: currentTime,
              p: process.uptime(),
              h: process.hrtime()
            }
          }
        }
      ),
      transport.on(PlatformEvents.capabilities.list, async (payload) => {
        const query = normalizeCapabilityQuery(payload)
        return await listPlatformCapabilities(query)
      }),
      transport.on(AppEvents.window.close, () => closeApp(touchApp)),
      transport.on(AppEvents.window.hide, () => touchApp.window.window.hide()),
      transport.on(AppEvents.window.minimize, () => touchApp.window.minimize()),
      transport.on(AppEvents.window.focus, () => touchApp.window.window.focus()),
      transport.on(AppEvents.debug.openDevTools, (payload) => {
        const options =
          payload && typeof payload === 'object' ? (payload as OpenDevToolsOptions) : undefined
        touchApp.window.openDevTools(options)
      }),
      transport.on(AppEvents.system.getCwd, () => process.cwd()),
      transport.on(AppEvents.system.getOS, () => getOSInformation()),
      transport.on(AppEvents.system.getPackage, () => packageJson),
      transport.on<void, AutoStartGetResponse>(AppEvents.system.autoStartGet, () =>
        this.getAutoStartStatus()
      ),
      transport.on<AutoStartUpdateRequest, AutoStartUpdateResponse>(
        AppEvents.system.autoStartUpdate,
        (enabled) => this.updateAutoStart(enabled)
      ),
      transport.on<void, TraySettingsGetResponse>(AppEvents.system.traySettingsGet, () =>
        this.buildTraySettingsFromAppSettings(this.getAppSettingsSnapshot(), touchApp)
      ),
      transport.on<TraySettingsUpdateRequest, TraySettingsUpdateResponse>(
        AppEvents.system.traySettingsUpdate,
        (payload) => this.updateTraySettings(payload, touchApp)
      ),
      transport.on(AppEvents.system.getPath, (payload) => {
        const name = typeof payload?.name === 'string' ? payload.name : ''
        if (!name) {
          return null
        }
        try {
          return electronApp.getPath(name as AppPathName)
        } catch (error) {
          log.warn(`[CommonChannel] Failed to resolve app path: ${name}`, { error })
          return null
        }
      }),
      transport.on(AppEvents.system.getActiveApp, async (payload) => {
        return await activeAppService.getActiveApp(Boolean(payload?.forceRefresh))
      }),
      transport.on<SecureValueGetRequest, string | null>(
        AppEvents.system.getSecureValue,
        async (payload) => {
          const key = typeof payload?.key === 'string' ? payload.key : ''
          if (!key) {
            return null
          }
          return await this.getSecureValue(key)
        }
      ),
      transport.on<SecureValueSetRequest, void>(
        AppEvents.system.setSecureValue,
        async (payload) => {
          const key = typeof payload?.key === 'string' ? payload.key : ''
          if (!key) {
            throw new Error('Missing secure storage key')
          }
          await this.setSecureValue(key, payload?.value ?? null)
        }
      ),
      transport.on(AppEvents.system.openExternal, (payload) => {
        const url = typeof payload?.url === 'string' ? payload.url : ''
        if (url) {
          return shell.openExternal(url)
        }
        return undefined
      }),
      transport.on(AppEvents.system.showInFolder, (payload) => {
        const target = typeof payload?.path === 'string' ? payload.path : ''
        if (target) {
          shell.showItemInFolder(target)
        }
      }),
      transport.on(AppEvents.system.openApp, (payload) => {
        const target = payload?.appName || payload?.path
        if (target) {
          void shell.openPath(target)
        }
        return undefined
      }),
      transport.on(AppEvents.system.openPromptsFolder, async () => {
        const basePath = storageModule.filePath
        if (!basePath) {
          throw new Error('Config path not available')
        }

        const promptFilePath = path.join(basePath, 'intelligence', 'prompt-library')
        try {
          await fs.stat(promptFilePath)
          shell.showItemInFolder(promptFilePath)
          return
        } catch {
          // Ignore and fallback to opening config root
        }

        const error = await shell.openPath(basePath)
        if (error) {
          throw new Error(error)
        }
      }),
      registerSafeHandler(
        AppEvents.system.executeCommand,
        async (payload: { command?: string }) => {
          const command = typeof payload?.command === 'string' ? payload.command : ''
          if (!command) {
            throw new Error('No command provided')
          }

          const error = await shell.openPath(command)
          if (error) {
            throw new Error(error)
          }
        }
      ),
      transport.on(AppEvents.i18n.setLocale, (payload) => {
        const locale = getOptionalStringProp(payload, 'locale')
        if (locale && isLocale(locale)) {
          setLocale(locale)
        }
      }),
      transport.on(AppEvents.analytics.perfReport, (payload) => {
        if (isRendererPerfReport(payload)) {
          perfMonitor.recordRendererReport(payload)
        }
      }),
      transport.on<ReadFileRequest, string>(AppEvents.system.readFile, async (payload) => {
        return await this.readSystemFile(payload)
      }),
      transport.onStream(AppEvents.fileIndex.progress, (_payload, context) => {
        fileProvider.registerProgressStream(context)
      })
    )
  }

  private registerIndexSettingsTransportHandlers(
    transport: NonNullable<CommonChannelModule['transport']>
  ): void {
    this.transportDisposers.push(
      transport.on(AppEvents.fileIndex.status, () => fileProvider.getIndexingStatus()),
      transport.on(AppEvents.fileIndex.stats, () => fileProvider.getIndexStats()),
      transport.on(AppEvents.fileIndex.failedFiles, () => fileProvider.getFailedFiles()),
      transport.on(AppEvents.fileIndex.batteryLevel, () => fileProvider.getBatteryLevel()),
      transport.on<FileIndexAddPathRequest, FileIndexAddPathResult>(
        AppEvents.fileIndex.addPath,
        (payload) => {
          const inputPath = getOptionalStringProp(payload, 'path')
          if (!inputPath) {
            return { success: false, status: 'invalid', reason: 'path-empty' }
          }
          return fileProvider.addWatchPath(inputPath)
        }
      ),
      transport.on(AppEvents.fileIndex.rebuild, async (payload) => {
        try {
          return await fileProvider.rebuildIndex(payload ?? undefined)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, error: message }
        }
      }),
      transport.on(AppEvents.deviceIdle.getSettings, () => deviceIdleService.getSettings()),
      transport.on(AppEvents.deviceIdle.updateSettings, (payload) =>
        deviceIdleService.updateSettings(payload ?? {})
      ),
      transport.on(AppEvents.appIndex.getSettings, () => appProvider.getAppIndexSettings()),
      transport.on(AppEvents.appIndex.updateSettings, (payload) =>
        appProvider.updateAppIndexSettings(payload ?? {})
      ),
      transport.on<AppIndexAddPathRequest, AppIndexAddPathResult>(
        AppEvents.appIndex.addPath,
        (payload) => {
          const inputPath = getOptionalStringProp(payload, 'path')
          if (!inputPath) {
            return { success: false, status: 'invalid', reason: 'path-empty' }
          }
          return appProvider.addAppByPath(inputPath)
        }
      )
    )
  }

  private registerPresetTransportHandlers(
    transport: NonNullable<CommonChannelModule['transport']>,
    registerSafeHandler: ReturnType<CommonChannelModule['createSafeOperationHandler']>
  ): void {
    this.transportDisposers.push(
      transport.on(dialogSaveFileEvent, async (payload) => {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) return { filePath: undefined }

        const result = await dialog.showSaveDialog(win, {
          title: payload?.title ?? 'Save File',
          defaultPath: payload?.defaultPath,
          filters: payload?.filters
        })

        const filePath = result.canceled ? undefined : result.filePath
        if (filePath) {
          recordDialogPath(filePath)
        }
        return { filePath }
      }),
      registerSafeHandler(fsWriteFileEvent, async (payload: { path?: string; data?: string }) => {
        if (!payload?.path || typeof payload.data !== 'string') {
          throw new Error('Path and data are required')
        }
        const targetPath = ensureApprovedDialogPath(payload.path)
        await fs.writeFile(targetPath, payload.data, 'utf-8')
      }),
      transport.on(fsReadFileEvent, async (payload) => {
        if (!payload?.path) {
          return { error: 'Path is required' }
        }

        try {
          const targetPath = ensureApprovedDialogPath(payload.path)
          const data = await fs.readFile(targetPath, 'utf-8')
          return { data }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { error: message }
        }
      })
    )
  }

  private async readSystemFile(payload: ReadFileRequest): Promise<string> {
    const source = payload?.source?.trim()
    const resolvedPath = source ? resolveLocalFilePath(source) : null
    const resolvedSource = source || resolvedPath || ''
    const allowMissing = payload?.allowMissing === true
    const timeoutMs =
      typeof payload?.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs)
        ? Math.max(0, Math.trunc(payload.timeoutMs))
        : 0
    const isAbortError = (error: unknown): boolean =>
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    const isNetworkTimeoutError = (error: unknown): boolean =>
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'NETWORK_TIMEOUT') ||
      (error instanceof Error && /NETWORK_TIMEOUT/i.test(error.message))
    const withTimeoutError = (timeout: number): Error => {
      const error = new Error(`Read file timeout after ${timeout}ms`) as Error & { code?: string }
      error.code = 'ETIMEDOUT'
      return error
    }
    const isFileMissingError = (error: unknown): boolean =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'

    if (!resolvedPath) {
      throw new Error('Unsupported file source')
    }

    const cached = getCachedReadFile(resolvedPath)
    if (cached) {
      return cached.content
    }

    const inflight = readFileInflight.get(resolvedPath)
    if (inflight) {
      try {
        return await inflight
      } catch (error) {
        if (allowMissing && isFileMissingError(error)) {
          return ''
        }
        throw error
      }
    }

    const fileName = path.basename(resolvedPath)
    const ext = path.extname(resolvedPath).toLowerCase()
    const dispose = enterPerfContext('system.readFile', {
      fileName,
      ext,
      cacheHit: false
    })

    const task = getNetworkService()
      .readText(resolvedSource, {
        allowMissing,
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined
      })
      .then((content) => {
        setCachedReadFile(resolvedPath, content)
        return content
      })
      .catch((error) => {
        if (timeoutMs > 0 && (isAbortError(error) || isNetworkTimeoutError(error))) {
          throw withTimeoutError(timeoutMs)
        }
        if (allowMissing && isFileMissingError(error)) {
          return ''
        }
        throw error
      })
      .finally(() => {
        readFileInflight.delete(resolvedPath)
        dispose()
      })

    readFileInflight.set(resolvedPath, task)
    return await task
  }

  private normalizeSecureStoreKey(rawKey: string): string {
    const key = rawKey.trim()
    if (!SECURE_STORE_KEY_PATTERN.test(key)) {
      throw new Error('Invalid secure storage key')
    }
    return key
  }

  private resolveSecureStorePath(): string {
    const touchApp = this.touchApp
    if (!touchApp) {
      throw new Error('App context is not ready')
    }
    return path.join(touchApp.rootPath, 'config', SECURE_STORE_FILE)
  }

  private async readSecureStoreFile(): Promise<Record<string, string>> {
    const storePath = this.resolveSecureStorePath()
    try {
      const raw = await fs.readFile(storePath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) {
        return {}
      }
      const store: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          store[key] = value
        }
      }
      return store
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return {}
      }
      log.warn('[CommonChannel] Failed to read secure store file', { error: toErrorMessage(error) })
      return {}
    }
  }

  private async writeSecureStoreFile(store: Record<string, string>): Promise<void> {
    const storePath = this.resolveSecureStorePath()
    await fs.mkdir(path.dirname(storePath), { recursive: true })
    await fs.writeFile(storePath, JSON.stringify(store), 'utf-8')
  }

  private async getSecureValue(rawKey: string): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }

    const key = this.normalizeSecureStoreKey(rawKey)
    const store = await this.readSecureStoreFile()
    const encrypted = store[key]
    if (!encrypted) {
      return null
    }

    try {
      const buffer = Buffer.from(encrypted, 'base64')
      return safeStorage.decryptString(buffer)
    } catch (error) {
      log.warn('[CommonChannel] Failed to decrypt secure value', {
        error: toErrorMessage(error)
      })
      return null
    }
  }

  private async setSecureValue(rawKey: string, value: string | null): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable')
    }

    const key = this.normalizeSecureStoreKey(rawKey)
    const store = await this.readSecureStoreFile()

    if (typeof value !== 'string' || !value.length) {
      delete store[key]
      await this.writeSecureStoreFile(store)
      return
    }

    const encrypted = safeStorage.encryptString(value).toString('base64')
    store[key] = encrypted
    await this.writeSecureStoreFile(store)
  }

  onDestroy(): MaybePromise<void> {
    log.info('[CommonChannel] CommonChannelModule destroyed')

    if (this.batteryPollTimer) {
      clearInterval(this.batteryPollTimer)
      this.batteryPollTimer = undefined
    }

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null
    this.channel = null
  }
}

function safeIsOnBatteryPower(): boolean {
  return deviceIdleService.isOnBatteryPower()
}

async function safeGetBatteryPercent(): Promise<number | null> {
  return deviceIdleService.getBatteryPercent()
}

const commonChannelModule = new CommonChannelModule()

export { commonChannelModule }
