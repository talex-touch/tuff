import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  BatteryStatusPayload,
  PackageInfo,
  ReadFileRequest,
  StartupRequest,
  StartupResponse
} from '@talex-touch/utils/transport/events/types'
import type { Locale } from '../utils/i18n-helper'
import type { StorageUsageIncludeOptions } from '../utils/storage-usage'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isLocalhostUrl } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { AppEvents, PlatformEvents } from '@talex-touch/utils/transport/events'
import { BrowserWindow, powerMonitor, shell, type OpenDevToolsOptions } from 'electron'
import packageJson from '../../../package.json'
import { APP_SCHEMA, FILE_SCHEMA } from '../config/default'
import { genTouchChannel } from '../core/channel-core'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { getStartupAnalytics } from '../modules/analytics'
import { appProvider } from '../modules/box-tool/addon/apps/app-provider'
import { fileProvider } from '../modules/box-tool/addon/files/file-provider'
import { buildVerificationModule } from '../modules/build-verification'
import { clipboardModule } from '../modules/clipboard'
import { databaseModule } from '../modules/database'
import {
  platformCapabilityRegistry,
  registerDefaultPlatformCapabilities
} from '../modules/platform/capability-registry'
import { storageModule } from '../modules/storage'
import { activeAppService } from '../modules/system/active-app'
import { deviceIdleService } from '../service/device-idle-service'
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
import type {
  CleanupAnalyticsOptions,
  CleanupClipboardOptions,
  CleanupDownloadsOptions,
  CleanupFileIndexOptions,
  CleanupIntelligenceOptions,
  CleanupLogsOptions,
  CleanupOcrOptions,
  CleanupTempOptions,
  CleanupUsageOptions
} from '../service/storage-maintenance'
import { tempFileService } from '../service/temp-file.service'
import { TalexTouch } from '../types'
import { checkPlatformCompatibility } from '../utils/common-util'
import { setLocale } from '../utils/i18n-helper'
import { createLogger } from '../utils/logger'
import { enterPerfContext } from '../utils/perf-context'
import { perfMonitor } from '../utils/perf-monitor'
import { getStorageUsageReport } from '../utils/storage-usage'

const BATTERY_POLL_TASK_ID = 'common-channel.battery'
const pollingService = PollingService.getInstance()
const READ_FILE_CACHE_TTL_MS = 60_000
const READ_FILE_CACHE_MAX_ENTRIES = 120
const READ_FILE_CACHE_MAX_BYTES = 256 * 1024
const READ_FILE_CACHE_TOTAL_BYTES = 2 * 1024 * 1024
const PLUGIN_TEMP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const log = createLogger('CommonChannel')

const legacyCloseEvent = defineRawEvent<void, void>('close')
const legacyHideEvent = defineRawEvent<void, void>('hide')
const legacyMinimizeEvent = defineRawEvent<void, void>('minimize')
const legacyDevToolsEvent = defineRawEvent<void, void>('dev-tools')
const legacyGetPackageEvent = defineRawEvent<void, PackageInfo>('get-package')
const legacyOpenExternalEvent = defineRawEvent<{ url: string }, void>('open-external')
const legacyGetOsEvent = defineRawEvent<void, OSInformation>('get-os')
const legacyCommonCwdEvent = defineRawEvent<void, string>('common:cwd')
const legacyCommonGetPathEvent = defineRawEvent<{ name: string }, string | null>('common:get-path')
const legacyFolderOpenEvent = defineRawEvent<{ path: string }, void>('folder:open')
const legacyOpenPromptsFolderEvent = defineRawEvent<void, void>('app:open-prompts-folder')
const legacyModuleFolderEvent = defineRawEvent<{ name: string }, void>('module:folder')
const legacyExecuteCmdEvent = defineRawEvent<
  { command: string },
  { success: boolean; error?: string }
>('execute:cmd')
const legacyAppOpenEvent = defineRawEvent<{ appName?: string; path?: string }, void>('app:open')
const legacyUrlOpenEvent = defineRawEvent<string, boolean>('url:open')
const legacyFilesIndexProgressEvent = defineRawEvent<{ paths?: string[] }, unknown>(
  'files:index-progress'
)
const legacySystemGetActiveAppEvent = defineRawEvent<{ forceRefresh?: boolean }, unknown>(
  'system:get-active-app'
)
const legacySystemGetStorageUsageEvent = defineRawEvent<{ include?: string[] }, unknown>(
  'system:get-storage-usage'
)
const legacyTempFileCreateEvent = defineRawEvent<
  unknown,
  { url: string; sizeBytes: number; createdAt: number }
>('temp-file:create')
const legacyTempFileDeleteEvent = defineRawEvent<unknown, { success: boolean }>('temp-file:delete')
const legacyStorageCleanupClipboardEvent = defineRawEvent<unknown, unknown>(
  'storage:cleanup:clipboard'
)
const legacyStorageCleanupFileIndexEvent = defineRawEvent<unknown, unknown>(
  'storage:cleanup:file-index'
)
const legacyStorageCleanupLogsEvent = defineRawEvent<unknown, unknown>('storage:cleanup:logs')
const legacyStorageCleanupTempEvent = defineRawEvent<unknown, unknown>('storage:cleanup:temp')
const legacyStorageCleanupAnalyticsEvent = defineRawEvent<unknown, unknown>(
  'storage:cleanup:analytics'
)
const legacyStorageCleanupUsageEvent = defineRawEvent<unknown, unknown>('storage:cleanup:usage')
const legacyStorageCleanupOcrEvent = defineRawEvent<unknown, unknown>('storage:cleanup:ocr')
const legacyStorageCleanupDownloadsEvent = defineRawEvent<unknown, unknown>(
  'storage:cleanup:downloads'
)
const legacyStorageCleanupIntelligenceEvent = defineRawEvent<unknown, unknown>(
  'storage:cleanup:intelligence'
)
const legacyStorageCleanupConfigEvent = defineRawEvent<void, unknown>('storage:cleanup:config')
const legacyStorageCleanupUpdatesEvent = defineRawEvent<void, unknown>('storage:cleanup:updates')
const legacyBuildVerificationEvent = AppEvents.build.getVerificationStatusLegacy
const legacyBatteryStatusEvent = AppEvents.power.batteryStatus

function safeNamespaceSegment(value: string): string {
  return value.replace(/[^\w.-]+/g, '-').slice(0, 64) || 'unknown'
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
    const transport = this.transport
    if (!transport) {
      return
    }

    const broadcastBatteryStatus = async (): Promise<void> => {
      const onBattery = safeIsOnBatteryPower()
      const percent = await safeGetBatteryPercent()
      const payload: BatteryStatusPayload = { onBattery, percent }

      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        try {
          transport.broadcastToWindow(win.id, legacyBatteryStatusEvent, payload)
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
      log.warn('[CommonChannel] Failed to initialize battery status broadcaster:', { error })
    }

    this.transportDisposers.push(
      transport.on(legacyCloseEvent, () => closeApp(app as TalexTouch.TouchApp)),
      transport.on(legacyHideEvent, () => (app as TalexTouch.TouchApp).window.window.hide()),
      transport.on(legacyMinimizeEvent, () => (app as TalexTouch.TouchApp).window.minimize()),
      transport.on(legacyDevToolsEvent, () => {
        log.debug('[dev-tools] Open dev tools!')
        ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'undocked' })
        ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'detach' })
        ;(app as TalexTouch.TouchApp).window.openDevTools({ mode: 'right' })
      }),
      transport.on(legacyGetPackageEvent, () => packageJson),
      transport.on(legacyOpenExternalEvent, (payload) => {
        const url = payload?.url
        if (url) {
          return shell.openExternal(url)
        }
        return undefined
      }),
      transport.on(legacyGetOsEvent, () => getOSInformation()),
      transport.on(legacySystemGetActiveAppEvent, (payload) =>
        activeAppService.getActiveApp(Boolean(payload?.forceRefresh))
      )
    )

    const registeredTempNamespaces = new Map<string, number | null>()
    const ensureTempNamespace = (namespace: string, retentionMs: number | null) => {
      const normalized = namespace.replace(/^\/+/, '').replace(/\\/g, '/')
      if (registeredTempNamespaces.has(normalized)) return
      registeredTempNamespaces.set(normalized, retentionMs)
      tempFileService.registerNamespace({ namespace: normalized, retentionMs })
      tempFileService.startCleanup()
    }

    this.transportDisposers.push(
      transport.on(legacyTempFileCreateEvent, async (payload, context) => {
        const tempPayload = isRecord(payload) ? payload : {}
        const pluginName = context.plugin?.name

        if (pluginName) {
          const segment = safeNamespaceSegment(pluginName)
          const namespace = `plugins/${segment}`
          const retentionMs =
            typeof tempPayload.retentionMs === 'number' &&
            Number.isFinite(tempPayload.retentionMs) &&
            tempPayload.retentionMs > 0
              ? Number(tempPayload.retentionMs)
              : PLUGIN_TEMP_RETENTION_MS

          ensureTempNamespace(namespace, retentionMs)

          const res = await tempFileService.createFile({
            namespace,
            ext: typeof tempPayload.ext === 'string' ? tempPayload.ext : undefined,
            text: typeof tempPayload.text === 'string' ? tempPayload.text : undefined,
            base64: typeof tempPayload.base64 === 'string' ? tempPayload.base64 : undefined,
            prefix: typeof tempPayload.prefix === 'string' ? tempPayload.prefix : segment
          })

          return {
            url: `${FILE_SCHEMA}://${res.path}`,
            sizeBytes: res.sizeBytes,
            createdAt: res.createdAt
          }
        }

        const namespace = typeof tempPayload.namespace === 'string' ? tempPayload.namespace : 'misc'
        const retentionMs =
          typeof tempPayload.retentionMs === 'number' &&
          Number.isFinite(tempPayload.retentionMs) &&
          tempPayload.retentionMs > 0
            ? Number(tempPayload.retentionMs)
            : 24 * 60 * 60 * 1000

        ensureTempNamespace(namespace, retentionMs)

        const res = await tempFileService.createFile({
          namespace,
          ext: typeof tempPayload.ext === 'string' ? tempPayload.ext : undefined,
          text: typeof tempPayload.text === 'string' ? tempPayload.text : undefined,
          base64: typeof tempPayload.base64 === 'string' ? tempPayload.base64 : undefined,
          prefix: typeof tempPayload.prefix === 'string' ? tempPayload.prefix : 'temp'
        })

        return {
          url: `${FILE_SCHEMA}://${res.path}`,
          sizeBytes: res.sizeBytes,
          createdAt: res.createdAt
        }
      }),
      transport.on(legacyTempFileDeleteEvent, async (payload, context) => {
        const tempPayload = isRecord(payload) ? payload : {}
        const pluginName = context.plugin?.name
        if (pluginName) {
          const segment = safeNamespaceSegment(pluginName)
          const pluginDir = tempFileService.resolveNamespaceDir(`plugins/${segment}`)

          const target =
            typeof tempPayload.url === 'string'
              ? tempPayload.url
              : typeof tempPayload.path === 'string'
                ? tempPayload.path
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
        }

        const target =
          typeof tempPayload.url === 'string'
            ? tempPayload.url
            : typeof tempPayload.path === 'string'
              ? tempPayload.path
              : ''
        const filePath = resolveTfilePath(target)
        const success = filePath ? await tempFileService.deleteFile(filePath) : false
        return { success }
      })
    )

    this.transportDisposers.push(
      transport.on(legacySystemGetStorageUsageEvent, async (payload) => {
        const usagePayload = isRecord(payload) ? payload : {}
        const storageStats = storageModule.getCacheStats()
        const clipboardStats = clipboardModule.getCacheStats()
        const includeList = Array.isArray(usagePayload.include) ? usagePayload.include : undefined
        const include = includeList
          ? includeList.reduce<StorageUsageIncludeOptions>((acc, key) => {
              if (
                key === 'modules' ||
                key === 'plugins' ||
                key === 'database' ||
                key === 'databaseTables' ||
                key === 'caches' ||
                key === 'includeOther'
              ) {
                acc[key] = true
              }
              return acc
            }, {})
          : undefined
        return await getStorageUsageReport({
          dbClient: databaseModule.getClient(),
          cacheStats: {
            'storage.lru': storageStats.cachedConfigs,
            'storage.plugins': storageStats.pluginConfigs,
            'clipboard.memory': clipboardStats.memoryItems
          },
          include
        })
      }),
      transport.on(legacyStorageCleanupClipboardEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupClipboardOptions) : undefined
        return await cleanupClipboard(options)
      }),
      transport.on(legacyStorageCleanupFileIndexEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupFileIndexOptions) : undefined
        return await cleanupFileIndex(options)
      }),
      transport.on(legacyStorageCleanupLogsEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupLogsOptions) : undefined
        return await cleanupLogs(options)
      }),
      transport.on(legacyStorageCleanupTempEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupTempOptions) : undefined
        return await cleanupTemp(options)
      }),
      transport.on(legacyStorageCleanupAnalyticsEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupAnalyticsOptions) : undefined
        return await cleanupAnalytics(options)
      }),
      transport.on(legacyStorageCleanupUsageEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupUsageOptions) : undefined
        return await cleanupUsage(options)
      }),
      transport.on(legacyStorageCleanupOcrEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupOcrOptions) : undefined
        return await cleanupOcr(options)
      }),
      transport.on(legacyStorageCleanupDownloadsEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupDownloadsOptions) : undefined
        return await cleanupDownloads(options)
      }),
      transport.on(legacyStorageCleanupIntelligenceEvent, async (payload) => {
        const options = isRecord(payload) ? (payload as CleanupIntelligenceOptions) : undefined
        return await cleanupIntelligence(options)
      }),
      transport.on(legacyStorageCleanupConfigEvent, async () => {
        return await cleanupConfig()
      }),
      transport.on(legacyStorageCleanupUpdatesEvent, async () => {
        return await cleanupUpdates()
      })
    )

    this.transportDisposers.push(
      transport.on(legacyCommonCwdEvent, () => process.cwd()),
      transport.on(legacyCommonGetPathEvent, (payload) => {
        const name = typeof payload?.name === 'string' ? payload.name : ''
        if (!name) {
          return null
        }
        try {
          return touchApp.app.getPath(name as AppPathName)
        } catch (error) {
          log.warn(`[CommonChannel] Failed to resolve app path: ${name}`, { error })
          return null
        }
      }),
      transport.on(legacyFolderOpenEvent, (payload) => {
        if (payload?.path) {
          shell.showItemInFolder(payload.path)
        }
      }),
      transport.on(legacyOpenPromptsFolderEvent, async () => {
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
      transport.on(legacyModuleFolderEvent, (payload) => {
        if (payload?.name) {
          const modulePath = path.join(
            (app as TalexTouch.TouchApp).rootPath,
            'modules',
            payload.name
          )
          shell.openPath(modulePath)

          log.debug(
            `[Channel] Open path [${modulePath}] with module folder @${payload?.name ?? 'defaults'}`
          )
        }
      }),
      transport.on(legacyExecuteCmdEvent, async (payload) => {
        if (payload?.command) {
          try {
            const error = await shell.openPath(payload.command)
            if (error) {
              log.error(`[CommonChannel] Failed to open path: ${payload.command}`, { error })
              return { success: false, error }
            }
            return { success: true }
          } catch (error) {
            log.error(`[CommonChannel] Error opening path: ${payload.command}`, { error })
            return { success: false, error: error instanceof Error ? error.message : String(error) }
          }
        }
        return { success: false, error: 'No command provided' }
      }),
      transport.on(legacyAppOpenEvent, (payload) => {
        const target = payload?.appName ?? payload?.path
        if (target) {
          shell.openPath(target)
        }
      }),
      transport.on(legacyUrlOpenEvent, (payload) => {
        if (typeof payload === 'string') {
          void onOpenUrl(payload)
          return true
        }
        return false
      }),
      transport.on(legacyFilesIndexProgressEvent, async (payload) => {
        const payloadPaths = (payload as { paths?: unknown })?.paths
        const paths = Array.isArray(payloadPaths)
          ? payloadPaths.filter((item): item is string => typeof item === 'string')
          : undefined
        return fileProvider.getIndexingProgress(paths)
      })
    )

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

      const data = await transport.sendTo(
        touchApp.window.window.webContents,
        legacyUrlOpenEvent,
        url
      )
      log.debug('open url', { meta: { url, data } })

      if (data) {
        shell.openExternal(url)
      }
    }

    touchApp.app.addListener('open-url', (event, url) => {
      event.preventDefault()

      const regex = /^https?:\/\/(?:localhost|127\.0\.0\.1)/
      if (regex.test(url) && url.includes('/#/')) {
        return
      }

      onOpenUrl(url)
    })

    touchEventBus.on(TalexEvents.OPEN_EXTERNAL_URL, (event) => onOpenUrl(event.data))

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
      transport.on(legacyBuildVerificationEvent, resolveBuildVerificationStatus),
      transport.on(AppEvents.build.getVerificationStatus, resolveBuildVerificationStatus)
    )

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
        const options =
          payload && typeof payload === 'object' ? (payload as OpenDevToolsOptions) : undefined
        touchApp.window.openDevTools(options)
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
          return electronApp.getPath(name as AppPathName)
        } catch (error) {
          log.warn(`[CommonChannel] Failed to resolve app path: ${name}`, { error })
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
            log.error(`[CommonChannel] Failed to open path: ${command}`, { error })
            return { success: false, error }
          }
          return { success: true }
        } catch (error) {
          log.error(`[CommonChannel] Error opening path: ${command}`, { error })
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
      this.transport.on(AppEvents.fileIndex.status, () => fileProvider.getIndexingStatus()),
      this.transport.on(AppEvents.fileIndex.stats, () => fileProvider.getIndexStats()),
      this.transport.on(AppEvents.fileIndex.batteryLevel, () => fileProvider.getBatteryLevel()),
      this.transport.on(AppEvents.fileIndex.rebuild, async (payload) => {
        try {
          return await fileProvider.rebuildIndex(payload ?? undefined)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, error: message }
        }
      }),
      this.transport.on(AppEvents.deviceIdle.getSettings, () => deviceIdleService.getSettings()),
      this.transport.on(AppEvents.deviceIdle.updateSettings, (payload) =>
        deviceIdleService.updateSettings(payload ?? {})
      ),
      this.transport.on(AppEvents.appIndex.getSettings, () => appProvider.getAppIndexSettings()),
      this.transport.on(AppEvents.appIndex.updateSettings, (payload) =>
        appProvider.updateAppIndexSettings(payload ?? {})
      )
    )
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
