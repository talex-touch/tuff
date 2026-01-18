import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type {
  ReadFileRequest,
  StartupRequest,
  StartupResponse
} from '@talex-touch/utils/transport/events/types'
import { TalexTouch } from '../types'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { isLocalhostUrl } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { AppEvents, PlatformEvents } from '@talex-touch/utils/transport/events'
import { BrowserWindow, powerMonitor, shell } from 'electron'
import packageJson from '../../../package.json'
import { APP_SCHEMA, FILE_SCHEMA } from '../config/default'
import { genTouchChannel } from '../core/channel-core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { getStartupAnalytics } from '../modules/analytics'
import { fileProvider } from '../modules/box-tool/addon/files/file-provider'
import { buildVerificationModule } from '../modules/build-verification'
import { activeAppService } from '../modules/system/active-app'
import type { Locale } from '../utils/i18n-helper'
import { setLocale } from '../utils/i18n-helper'
import { enterPerfContext } from '../utils/perf-context'
import { perfMonitor } from '../utils/perf-monitor'
import { tempFileService } from '../service/temp-file.service'
import { getStorageUsageReport } from '../utils/storage-usage'
import { databaseModule } from '../modules/database'
import { storageModule } from '../modules/storage'
import { clipboardModule } from '../modules/clipboard'
import { checkPlatformCompatibility } from '../utils/common-util'
import {
  platformCapabilityRegistry,
  registerDefaultPlatformCapabilities
} from '../modules/platform/capability-registry'
import {
  cleanupAnalytics,
  cleanupClipboard,
  cleanupConfig,
  cleanupDownloads,
  cleanupFileIndex,
  cleanupIntelligence,
  cleanupLogs,
  cleanupOcr,
  cleanupTemp,
  cleanupUpdates,
  cleanupUsage
} from '../service/storage-maintenance'

const execFileAsync = promisify(execFile)
const BATTERY_POLL_TASK_ID = 'common-channel.battery'
const pollingService = PollingService.getInstance()
const READ_FILE_CACHE_TTL_MS = 60_000
const READ_FILE_CACHE_MAX_ENTRIES = 120
const READ_FILE_CACHE_MAX_BYTES = 256 * 1024
const READ_FILE_CACHE_TOTAL_BYTES = 2 * 1024 * 1024
const PLUGIN_TEMP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function safeNamespaceSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64) || 'unknown'
}

function resolveTfilePath(urlOrPath: string): string {
  if (!urlOrPath) return ''
  if (urlOrPath.startsWith(`${FILE_SCHEMA}://`)) {
    return decodeURIComponent(urlOrPath.slice(`${FILE_SCHEMA}://`.length))
  }
  return urlOrPath
}

interface ReadFileCacheEntry {
  content: string
  size: number
  cachedAt: number
}

const readFileCache = new Map<string, ReadFileCacheEntry>()
const readFileInflight = new Map<string, Promise<string>>()
let readFileCacheBytes = 0

interface BatteryStatusPayload {
  onBattery: boolean
  percent: number | null
}

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

type KeyManagerHolder = { keyManager?: unknown }
type BroadcastCapable = {
  broadcastTo?: (
    window: BrowserWindow,
    channelType: ChannelType,
    eventName: string,
    payload?: unknown
  ) => void
}

interface RendererPerfReport {
  kind: string
  at: number
  eventName: string
  durationMs: number
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

  process.exit(0)
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

  if (source.startsWith('file:') || source.startsWith(`${FILE_SCHEMA}:`)) {
    const fileUrl = source.startsWith('file:') ? source : source.replace(`${FILE_SCHEMA}:`, 'file:')
    try {
      return fileURLToPath(fileUrl)
    } catch {
      return null
    }
  }

  if (path.isAbsolute(source) || path.win32.isAbsolute(source)) {
    return source
  }

  return null
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

    const broadcastBatteryStatus = async (): Promise<void> => {
      const onBattery = safeIsOnBatteryPower()
      const percent = await safeGetBatteryPercent()
      const payload: BatteryStatusPayload = { onBattery, percent }

      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        try {
          ;(channel as unknown as BroadcastCapable).broadcastTo?.(
            win,
            ChannelType.MAIN,
            'power:battery-status',
            payload
          )
        } catch {
          // Ignore broadcast errors
        }
      }
    }

    // Smart polling management
    const startPolling = () => {
      if (pollingService.isRegistered(BATTERY_POLL_TASK_ID)) {
        return
      }
      // Poll every 2 minutes when on battery to save resources
      pollingService.register(BATTERY_POLL_TASK_ID, () => broadcastBatteryStatus(), {
        interval: 120_000,
        unit: 'milliseconds'
      })
      pollingService.start()
    }

    const stopPolling = () => {
      pollingService.unregister(BATTERY_POLL_TASK_ID)
    }

    // Start battery status broadcast (best-effort)
    try {
      // Emit once on startup
      void broadcastBatteryStatus()

      if (safeIsOnBatteryPower()) {
        startPolling()
      }

      // Subscribe to power source changes for immediate updates
      powerMonitor.on('on-ac', () => {
        stopPolling()
        void broadcastBatteryStatus()
      })

      powerMonitor.on('on-battery', () => {
        startPolling()
        void broadcastBatteryStatus()
      })
    } catch (error) {
      console.warn('[CommonChannel] Failed to initialize battery status broadcaster:', error)
    }

    channel.regChannel(ChannelType.MAIN, 'close', () => closeApp(app as TalexTouch.TouchApp))
    channel.regChannel(ChannelType.MAIN, 'hide', () =>
      (app as TalexTouch.TouchApp).window.window.hide()
    )

    channel.regChannel(ChannelType.MAIN, 'minimize', () =>
      (app as TalexTouch.TouchApp).window.minimize()
    )
    channel.regChannel(ChannelType.MAIN, 'dev-tools', () => {
      console.debug('[dev-tools] Open dev tools!')
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'undocked' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'detach' })
      ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'right' })
    })
    channel.regChannel(ChannelType.MAIN, 'get-package', () => packageJson)
    channel.regChannel(ChannelType.MAIN, 'open-external', ({ data }) =>
      shell.openExternal(data!.url)
    )

    channel.regChannel(ChannelType.MAIN, 'get-os', () => getOSInformation())
    const systemGetActiveApp = async ({ data }: { data?: { forceRefresh?: boolean } }) =>
      activeAppService.getActiveApp(Boolean(data?.forceRefresh))
    channel.regChannel(ChannelType.MAIN, 'system:get-active-app', systemGetActiveApp)
    channel.regChannel(ChannelType.PLUGIN, 'system:get-active-app', systemGetActiveApp)

    const registeredTempNamespaces = new Map<string, number | null>()
    const ensureTempNamespace = (namespace: string, retentionMs: number | null) => {
      const normalized = namespace.replace(/^\/+/, '').replace(/\\/g, '/')
      if (registeredTempNamespaces.has(normalized)) return
      registeredTempNamespaces.set(normalized, retentionMs)
      tempFileService.registerNamespace({ namespace: normalized, retentionMs })
      tempFileService.startCleanup()
    }

    channel.regChannel(ChannelType.MAIN, 'temp-file:create', async ({ data }) => {
      const namespace = typeof data?.namespace === 'string' ? data.namespace : 'misc'
      const retentionMs =
        typeof data?.retentionMs === 'number' &&
        Number.isFinite(data.retentionMs) &&
        data.retentionMs > 0
          ? Number(data.retentionMs)
          : 24 * 60 * 60 * 1000

      ensureTempNamespace(namespace, retentionMs)

      const res = await tempFileService.createFile({
        namespace,
        ext: typeof data?.ext === 'string' ? data.ext : undefined,
        text: typeof data?.text === 'string' ? data.text : undefined,
        base64: typeof data?.base64 === 'string' ? data.base64 : undefined,
        prefix: typeof data?.prefix === 'string' ? data.prefix : 'temp'
      })

      return {
        url: `${FILE_SCHEMA}://${res.path}`,
        sizeBytes: res.sizeBytes,
        createdAt: res.createdAt
      }
    })

    channel.regChannel(ChannelType.MAIN, 'temp-file:delete', async ({ data }) => {
      const target =
        typeof data?.url === 'string' ? data.url : typeof data?.path === 'string' ? data.path : ''
      const filePath = resolveTfilePath(target)
      const success = filePath ? await tempFileService.deleteFile(filePath) : false
      return { success }
    })

    channel.regChannel(ChannelType.PLUGIN, 'temp-file:create', async (ctx: any) => {
      const pluginName = typeof ctx?.plugin === 'string' ? ctx.plugin : 'unknown'
      const segment = safeNamespaceSegment(pluginName)
      const namespace = `plugins/${segment}`
      const retentionMs =
        typeof ctx?.data?.retentionMs === 'number' &&
        Number.isFinite(ctx.data.retentionMs) &&
        ctx.data.retentionMs > 0
          ? Number(ctx.data.retentionMs)
          : PLUGIN_TEMP_RETENTION_MS

      ensureTempNamespace(namespace, retentionMs)

      const res = await tempFileService.createFile({
        namespace,
        ext: typeof ctx?.data?.ext === 'string' ? ctx.data.ext : undefined,
        text: typeof ctx?.data?.text === 'string' ? ctx.data.text : undefined,
        base64: typeof ctx?.data?.base64 === 'string' ? ctx.data.base64 : undefined,
        prefix: typeof ctx?.data?.prefix === 'string' ? ctx.data.prefix : segment
      })

      return {
        url: `${FILE_SCHEMA}://${res.path}`,
        sizeBytes: res.sizeBytes,
        createdAt: res.createdAt
      }
    })

    channel.regChannel(ChannelType.PLUGIN, 'temp-file:delete', async (ctx: any) => {
      const pluginName = typeof ctx?.plugin === 'string' ? ctx.plugin : 'unknown'
      const segment = safeNamespaceSegment(pluginName)
      const pluginDir = tempFileService.resolveNamespaceDir(`plugins/${segment}`)

      const target =
        typeof ctx?.data?.url === 'string'
          ? ctx.data.url
          : typeof ctx?.data?.path === 'string'
            ? ctx.data.path
            : ''
      const filePath = resolveTfilePath(target)
      if (!filePath) return { success: false }

      const resolvedPluginDir = path.resolve(pluginDir)
      const resolvedFilePath = path.resolve(filePath)
      if (!resolvedFilePath.startsWith(`${resolvedPluginDir}${path.sep}`)) {
        return { success: false }
      }

      const success = await tempFileService.deleteFile(resolvedFilePath)
      return { success }
    })

    channel.regChannel(ChannelType.MAIN, 'system:get-storage-usage', async ({ data }) => {
      const storageStats = storageModule.getCacheStats()
      const clipboardStats = clipboardModule.getCacheStats()
      return await getStorageUsageReport({
        dbClient: databaseModule.getClient(),
        cacheStats: {
          'storage.lru': storageStats.cachedConfigs,
          'storage.plugins': storageStats.pluginConfigs,
          'clipboard.memory': clipboardStats.memoryItems
        },
        include: data?.include
      })
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:clipboard', async ({ data }) => {
      return await cleanupClipboard(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:file-index', async ({ data }) => {
      return await cleanupFileIndex(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:logs', async ({ data }) => {
      return await cleanupLogs(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:temp', async ({ data }) => {
      return await cleanupTemp(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:analytics', async ({ data }) => {
      return await cleanupAnalytics(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:usage', async ({ data }) => {
      return await cleanupUsage(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:ocr', async ({ data }) => {
      return await cleanupOcr(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:downloads', async ({ data }) => {
      return await cleanupDownloads(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:intelligence', async ({ data }) => {
      return await cleanupIntelligence(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:config', async () => {
      return await cleanupConfig()
    })

    channel.regChannel(ChannelType.MAIN, 'storage:cleanup:updates', async () => {
      return await cleanupUpdates()
    })

    channel.regChannel(ChannelType.MAIN, 'common:cwd', process.cwd)

    channel.regChannel(ChannelType.MAIN, 'common:get-path', ({ data }) => {
      const name = typeof data?.name === 'string' ? data.name : ''
      if (!name) {
        return null
      }
      try {
        return touchApp.app.getPath(name as any)
      } catch (error) {
        console.warn(`[CommonChannel] Failed to resolve app path: ${name}`, error)
        return null
      }
    })

    channel.regChannel(ChannelType.MAIN, 'folder:open', ({ data }) => {
      if (data?.path) {
        shell.showItemInFolder(data.path)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'app:open-prompts-folder', async () => {
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
    })

    channel.regChannel(ChannelType.MAIN, 'module:folder', ({ data }) => {
      if (data?.name) {
        const modulePath = path.join(
          (app as TalexTouch.TouchApp).rootPath,
          'modules',
          data?.name ? data.name : undefined
        )
        shell.openPath(modulePath)

        console.debug(
          `[Channel] Open path [${modulePath}] with module folder @${data?.name ?? 'defaults'}`
        )
      }
    })

    channel.regChannel(ChannelType.MAIN, 'execute:cmd', async ({ data }) => {
      if (data?.command) {
        try {
          const error = await shell.openPath(data.command)
          if (error) {
            console.error(`[CommonChannel] Failed to open path: ${data.command}, error: ${error}`)
            return { success: false, error }
          }
          return { success: true }
        } catch (error) {
          console.error(`[CommonChannel] Error opening path: ${data.command}`, error)
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
      return { success: false, error: 'No command provided' }
    })

    channel.regChannel(ChannelType.MAIN, 'app:open', ({ data }) => {
      if (data?.appName || data?.path) {
        shell.openPath(data.appName || data.path)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'url:open', ({ data }) => {
      if (typeof data === 'string') {
        void onOpenUrl(data)
      }
    })

    channel.regChannel(ChannelType.MAIN, 'files:index-progress', async ({ data }) => {
      const paths = Array.isArray(data?.paths) ? data.paths : undefined
      return fileProvider.getIndexingProgress(paths)
    })

    // Analytics channels
    channel.regChannel(ChannelType.MAIN, 'analytics:get-current', () => {
      const analytics = getStartupAnalytics()
      return analytics.getCurrentMetrics()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:get-history', () => {
      const analytics = getStartupAnalytics()
      return analytics.getHistory()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:get-summary', () => {
      const analytics = getStartupAnalytics()
      return analytics.getPerformanceSummary()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:export', () => {
      const analytics = getStartupAnalytics()
      return analytics.exportMetrics()
    })

    channel.regChannel(ChannelType.MAIN, 'analytics:report', async ({ data }) => {
      const analytics = getStartupAnalytics()
      await analytics.reportMetrics(data?.endpoint)
      return { success: true }
    })

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

    function isFrontendLocalUrl(parsed: URL): boolean {
      if (!isLocalhostUrl(parsed.toString())) return false

      if (rendererOrigin && parsed.origin === rendererOrigin) return true

      const hash = parsed.hash || ''
      return hash.startsWith('#/') || parsed.pathname.includes('/#/')
    }

    function getOpenUrlDecision(url: string): OpenUrlDecision {
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

    async function onOpenUrl(url: string) {
      const decision = getOpenUrlDecision(url)
      if (decision === 'skip') return
      if (decision === 'open') {
        shell.openExternal(url)
        return
      }

      const data = await channel.send(ChannelType.MAIN, 'url:open', url)
      console.debug('open url', url, data)

      if (data.data) {
        shell.openExternal(url)
      }
    }

    touchApp.app.addListener('open-url', (event, url) => {
      event.preventDefault()

      const regex =
        /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/
      if (regex.test(url) && url.includes('/#/')) {
        return
      }

      onOpenUrl(url)
    })

    touchEventBus.on(TalexEvents.OPEN_EXTERNAL_URL, (event) => onOpenUrl(event.data))

    channel.regChannel(ChannelType.MAIN, 'build:get-verification-status', () => {
      try {
        if (buildVerificationModule?.getVerificationStatus) {
          const status = buildVerificationModule.getVerificationStatus()
          return {
            isOfficialBuild: status.isOfficialBuild,
            verificationFailed: status.verificationFailed,
            hasOfficialKey: status.isOfficialBuild || status.verificationFailed
          }
        }
      } catch (error) {
        console.warn('[CommonChannel] Failed to get build verification status:', error)
      }
      return {
        isOfficialBuild: false,
        verificationFailed: false,
        hasOfficialKey: false
      }
    })

    this.registerTransportHandlers()
  }

  private registerTransportHandlers(): void {
    if (!this.transport || !this.channel) {
      return
    }
    const touchApp = this.touchApp
    if (!touchApp) {
      return
    }
    const electronApp = touchApp.app

    registerDefaultPlatformCapabilities()

    this.transportDisposers.push(
      this.transport.on<StartupRequest, StartupResponse>(
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
            platformWarning: checkPlatformCompatibility() ?? undefined,
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
      this.transport.on(PlatformEvents.capabilities.list, (payload) => {
        return platformCapabilityRegistry.list(payload ?? {})
      }),
      this.transport.on(AppEvents.window.close, () => closeApp(touchApp)),
      this.transport.on(AppEvents.window.hide, () => touchApp.window.window.hide()),
      this.transport.on(AppEvents.window.minimize, () => touchApp.window.minimize()),
      this.transport.on(AppEvents.window.focus, () => touchApp.window.window.focus()),
      this.transport.on(AppEvents.debug.openDevTools, (payload) => {
        const options = payload && typeof payload === 'object' ? payload : undefined
        touchApp.window.openDevTools(options as any)
      }),
      this.transport.on(AppEvents.system.getCwd, () => process.cwd()),
      this.transport.on(AppEvents.system.getOS, () => getOSInformation()),
      this.transport.on(AppEvents.system.getPackage, () => packageJson),
      this.transport.on(AppEvents.system.getPath, (payload) => {
        const name = typeof payload?.name === 'string' ? payload.name : ''
        if (!name) {
          return null
        }
        try {
          return electronApp.getPath(name as any)
        } catch (error) {
          console.warn(`[CommonChannel] Failed to resolve app path: ${name}`, error)
          return null
        }
      }),
      this.transport.on(AppEvents.system.openExternal, (payload) => {
        const url = typeof payload?.url === 'string' ? payload.url : ''
        if (url) {
          return shell.openExternal(url)
        }
        return undefined
      }),
      this.transport.on(AppEvents.system.showInFolder, (payload) => {
        const target = typeof payload?.path === 'string' ? payload.path : ''
        if (target) {
          shell.showItemInFolder(target)
        }
      }),
      this.transport.on(AppEvents.system.openApp, (payload) => {
        const target = payload?.appName || payload?.path
        if (target) {
          void shell.openPath(target)
        }
        return undefined
      }),
      this.transport.on(AppEvents.system.executeCommand, async (payload) => {
        const command = typeof payload?.command === 'string' ? payload.command : ''
        if (!command) {
          return { success: false, error: 'No command provided' }
        }
        try {
          const error = await shell.openPath(command)
          if (error) {
            console.error(`[CommonChannel] Failed to open path: ${command}, error: ${error}`)
            return { success: false, error }
          }
          return { success: true }
        } catch (error) {
          console.error(`[CommonChannel] Error opening path: ${command}`, error)
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      }),
      this.transport.on(AppEvents.i18n.setLocale, (payload) => {
        const locale = getOptionalStringProp(payload, 'locale')
        if (locale && isLocale(locale)) {
          setLocale(locale)
        }
      }),
      this.transport.on(AppEvents.analytics.perfReport, (payload) => {
        if (isRendererPerfReport(payload)) {
          perfMonitor.recordRendererReport(payload)
        }
      }),
      this.transport.on<ReadFileRequest, string>(AppEvents.system.readFile, async (payload) => {
        const source = payload?.source?.trim()
        const resolvedPath = source ? resolveLocalFilePath(source) : null
        if (!resolvedPath) {
          throw new Error('Unsupported file source')
        }

        const cached = getCachedReadFile(resolvedPath)
        if (cached) {
          return cached.content
        }

        const inflight = readFileInflight.get(resolvedPath)
        if (inflight) {
          return await inflight
        }

        const fileName = path.basename(resolvedPath)
        const ext = path.extname(resolvedPath).toLowerCase()
        const dispose = enterPerfContext('system.readFile', {
          fileName,
          ext,
          cacheHit: false
        })
        const task = fs
          .readFile(resolvedPath, { encoding: 'utf8' })
          .then((content) => {
            setCachedReadFile(resolvedPath, content)
            return content
          })
          .finally(() => {
            readFileInflight.delete(resolvedPath)
            dispose()
          })

        readFileInflight.set(resolvedPath, task)
        return await task
      }),
      this.transport.onStream(AppEvents.fileIndex.progress, (_payload, context) => {
        fileProvider.registerProgressStream(context)
      })
    )

    this.transportDisposers.push(
      this.channel.regChannel(ChannelType.MAIN, AppEvents.fileIndex.status.toEventName(), () =>
        fileProvider.getIndexingStatus()
      ),
      this.channel.regChannel(ChannelType.MAIN, AppEvents.fileIndex.stats.toEventName(), () =>
        fileProvider.getIndexStats()
      ),
      this.channel.regChannel(
        ChannelType.MAIN,
        AppEvents.fileIndex.batteryLevel.toEventName(),
        () => fileProvider.getBatteryLevel()
      ),
      this.channel.regChannel(
        ChannelType.MAIN,
        AppEvents.fileIndex.rebuild.toEventName(),
        async ({ data }) => {
          try {
            return await fileProvider.rebuildIndex(data)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { success: false, error: message }
          }
        }
      )
    )
  }

  onDestroy(): MaybePromise<void> {
    console.log('[CommonChannel] CommonChannelModule destroyed')

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
  try {
    return powerMonitor.isOnBatteryPower()
  } catch {
    return false
  }
}

async function safeGetBatteryPercent(): Promise<number | null> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('pmset', ['-g', 'batt'])
      const match = /\b(\d{1,3})%\b/.exec(stdout)
      if (!match) return null
      const value = Number.parseInt(match[1], 10)
      if (Number.isNaN(value)) return null
      return Math.max(0, Math.min(100, value))
    }

    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance -ClassName Win32_Battery | Select-Object -ExpandProperty EstimatedChargeRemaining | Select-Object -First 1'
      ])
      const value = Number.parseInt(stdout.trim(), 10)
      if (Number.isNaN(value)) return null
      return Math.max(0, Math.min(100, value))
    }

    if (process.platform === 'linux') {
      try {
        const powerSupplyPath = '/sys/class/power_supply'
        // Check if directory exists
        await fs.access(powerSupplyPath).catch(() => {
          throw new Error('No power supply class')
        })

        const files = await fs.readdir(powerSupplyPath)
        // Find first battery (BAT0, BAT1, etc.)
        const bat = files.find((f) => f.startsWith('BAT'))
        if (bat) {
          const capacityPath = path.join(powerSupplyPath, bat, 'capacity')
          const content = await fs.readFile(capacityPath, 'utf8')
          const val = Number.parseInt(content.trim(), 10)
          if (!Number.isNaN(val)) return Math.max(0, Math.min(100, val))
        }
      } catch {
        // Fallback or ignore
      }
    }

    return null
  } catch {
    return null
  }
}

const commonChannelModule = new CommonChannelModule()

export { commonChannelModule }
