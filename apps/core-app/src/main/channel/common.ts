import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type { ReadFileRequest } from '@talex-touch/utils/transport/events/types'
import { isLocalhostUrl } from '@talex-touch/utils'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import type { TalexTouch } from '../types'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { ChannelType } from '@talex-touch/utils/channel'
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
import { enterPerfContext } from '../utils/perf-context'

const execFileAsync = promisify(execFile)
const BATTERY_POLL_TASK_ID = 'common-channel.battery'
const pollingService = PollingService.getInstance()
const READ_FILE_CACHE_TTL_MS = 60_000
const READ_FILE_CACHE_MAX_ENTRIES = 120
const READ_FILE_CACHE_MAX_BYTES = 256 * 1024
const READ_FILE_CACHE_TOTAL_BYTES = 2 * 1024 * 1024

type ReadFileCacheEntry = {
  content: string
  size: number
  cachedAt: number
}

const readFileCache = new Map<string, ReadFileCacheEntry>()
const readFileInflight = new Map<string, Promise<string>>()
let readFileCacheBytes = 0

type BatteryStatusPayload = {
  onBattery: boolean
  percent: number | null
}

function closeApp(app: TalexTouch.TouchApp): void {
  app.window.close()

  app.app.quit()

  process.exit(0)
}

function getOSInformation(): any {
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
    const fileUrl = source.startsWith('file:')
      ? source
      : source.replace(`${FILE_SCHEMA}:`, 'file:')
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
    cachedAt: Date.now(),
  })
  readFileCacheBytes += size

  pruneReadFileCache()
}

function pruneReadFileCache(): void {
  while (
    readFileCache.size > READ_FILE_CACHE_MAX_ENTRIES
    || readFileCacheBytes > READ_FILE_CACHE_TOTAL_BYTES
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

  constructor() {
    super(CommonChannelModule.key, {
      create: false,
      dirName: 'channel'
    })
  }

  async onInit({ app }: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel = genTouchChannel(app as TalexTouch.TouchApp)
    this.channel = channel
    this.transport = getTuffTransportMain(
      channel,
      (channel as any)?.keyManager ?? channel,
    )

    const broadcastBatteryStatus = async (): Promise<void> => {
      const onBattery = safeIsOnBatteryPower()
      const percent = await safeGetBatteryPercent()
      const payload: BatteryStatusPayload = { onBattery, percent }

      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        try {
          ;(channel as any).broadcastTo?.(win, ChannelType.MAIN, 'power:battery-status', payload)
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
      pollingService.register(
        BATTERY_POLL_TASK_ID,
        () => broadcastBatteryStatus(),
        { interval: 120_000, unit: 'milliseconds' }
      )
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

    channel.regChannel(ChannelType.MAIN, 'common:cwd', process.cwd)

    channel.regChannel(ChannelType.MAIN, 'folder:open', ({ data }) => {
      if (data?.path) {
        shell.showItemInFolder(data.path)
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

    channel.regChannel(ChannelType.MAIN, 'url:open', ({ data }) => onOpenUrl(data as any))

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

    function getOpenUrlDecision(url: string): OpenUrlDecision {
      if (!url || url.startsWith('/') || url.startsWith('#')) return 'skip'

      let parsed: URL
      try {
        parsed = new URL(url)
      }
      catch {
        return 'skip'
      }

      const protocol = parsed.protocol.replace(':', '')

      if (shouldSkipPromptProtocols.has(protocol)) return 'skip'
      if (protocol === 'file') return 'open'

      if ((protocol === 'http' || protocol === 'https') && isLocalhostUrl(url)) {
        return 'open'
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

    ;(app as TalexTouch.TouchApp).app.addListener('open-url', (event, url) => {
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

    this.transportDisposers.push(
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
          cacheHit: false,
        })
        const task = fs.readFile(resolvedPath, { encoding: 'utf8' })
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
      }),
    )

    this.transportDisposers.push(
      this.channel.regChannel(
        ChannelType.MAIN,
        AppEvents.fileIndex.status.toEventName(),
        () => fileProvider.getIndexingStatus(),
      ),
      this.channel.regChannel(
        ChannelType.MAIN,
        AppEvents.fileIndex.stats.toEventName(),
        () => fileProvider.getIndexStats(),
      ),
      this.channel.regChannel(
        ChannelType.MAIN,
        AppEvents.fileIndex.batteryLevel.toEventName(),
        () => fileProvider.getBatteryLevel(),
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
        },
      ),
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
