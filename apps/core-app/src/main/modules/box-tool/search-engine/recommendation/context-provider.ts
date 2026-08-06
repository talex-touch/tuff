import type { ContextSignal, TimePattern } from '@talex-touch/utils/core-box'
import type { IClipboardItem } from '../../../clipboard'
import * as crypto from 'node:crypto'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { StorageList } from '@talex-touch/utils'
import { createLogger } from '../../../../utils/logger'

const contextProviderLog = createLogger('RecommendationEngine').child('ContextProvider')
const execFileAsync = promisify(execFile)

interface RecommendationContextSources {
  time: boolean
  foregroundApp: boolean
  clipboard: boolean
  selection: boolean
  network: boolean
  focus: boolean
  power: boolean
  location: boolean
}

const DEFAULT_CONTEXT_SOURCES: RecommendationContextSources = {
  time: true,
  foregroundApp: true,
  clipboard: true,
  selection: true,
  network: true,
  focus: true,
  power: true,
  location: true
}

/**
 * Clipboard/selection entries older than this are treated as "not part of the
 * current task". 5s only covered a copy immediately followed by the shortcut;
 * 30s covers copy → switch app → open CoreBox.
 */
const CONTEXT_CONTENT_FRESHNESS_MS = 30_000
const TIMEZONE_CHANGE_WINDOW_MS = 48 * 60 * 60 * 1000
const RECOMMENDATION_RUNTIME_CONFIG = 'recommendation-runtime'

const NEUTRAL_TIME_CONTEXT: TimePattern = {
  hourOfDay: 12,
  dayOfWeek: 1,
  isWorkingHours: true,
  timeSlot: 'afternoon'
}

/**
 * Context provider for recommendation engine.
 * Gathers temporal, clipboard, and foreground app state for intelligent matching.
 *
 * @remarks
 * Uses dynamic imports to avoid circular dependencies with clipboard and activeApp modules.
 * This is intentional - see plan.prd for future refactoring.
 */
export class ContextProvider {
  /**
   * Retrieves complete current context signal.
   */
  async getCurrentContext(): Promise<ContextSignal> {
    const sources = await this.getContextSources()
    const [clipboard, selection, foregroundApp, systemState] = await Promise.all([
      sources.clipboard ? this.getClipboardContext() : Promise.resolve(undefined),
      sources.selection ? this.getSelectionContext() : Promise.resolve(undefined),
      sources.foregroundApp ? this.getForegroundAppContext() : Promise.resolve(undefined),
      this.getSystemContext(sources)
    ])

    return {
      time: sources.time ? this.getTimeContext() : NEUTRAL_TIME_CONTEXT,
      clipboard,
      selection,
      foregroundApp,
      systemState
    }
  }

  /**
   * Determines current time pattern for time-based recommendations.
   */
  getTimeContext(): TimePattern {
    const now = new Date()
    const hour = now.getHours()
    const dayOfWeek = now.getDay()

    let timeSlot: TimePattern['timeSlot']
    if (hour >= 6 && hour < 12) timeSlot = 'morning'
    else if (hour >= 12 && hour < 18) timeSlot = 'afternoon'
    else if (hour >= 18 && hour < 22) timeSlot = 'evening'
    else timeSlot = 'night'

    return {
      hourOfDay: hour,
      dayOfWeek,
      isWorkingHours: hour >= 9 && hour < 18 && dayOfWeek >= 1 && dayOfWeek <= 5,
      timeSlot
    }
  }

  /**
   * Retrieves clipboard context if content is recent
   * (within {@link CONTEXT_CONTENT_FRESHNESS_MS}).
   *
   * @remarks
   * Dynamic import prevents circular dependency with clipboard module.
   */
  private async getClipboardContext(): Promise<ContextSignal['clipboard']> {
    try {
      const { clipboardModule } = await import('../../../clipboard')

      const latest = clipboardModule.getLatestItem()
      if (!latest || !latest.timestamp) {
        return undefined
      }

      const isRecent =
        Date.now() - new Date(latest.timestamp).getTime() < CONTEXT_CONTENT_FRESHNESS_MS
      if (!isRecent) {
        return undefined
      }

      return {
        type: latest.type,
        content: this.hashContent(latest.content || ''),
        timestamp: new Date(latest.timestamp).getTime(),
        ...this.detectClipboardContentType(latest)
      }
    } catch (error) {
      contextProviderLog.debug('Failed to get clipboard context', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
      return undefined
    }
  }

  /**
   * Retrieves the latest captured text selection, same freshness window and
   * privacy tier as the clipboard: only the hash and the detected shape leave
   * this method. Nothing here triggers a capture — the store only holds what
   * an explicit user-initiated capture already produced.
   */
  private async getSelectionContext(): Promise<ContextSignal['selection']> {
    try {
      const { selectionSnapshotStore } = await import('../../../system/selection-snapshot-store')

      const latest = selectionSnapshotStore.get()
      if (!latest) return undefined

      if (Date.now() - latest.capturedAt >= CONTEXT_CONTENT_FRESHNESS_MS) {
        return undefined
      }

      return {
        content: this.hashContent(latest.text),
        timestamp: latest.capturedAt,
        ...this.detectClipboardContentType({ type: 'text', content: latest.text } as IClipboardItem)
      }
    } catch (error) {
      contextProviderLog.debug('Failed to get selection context', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
      return undefined
    }
  }

  /**
   * Detects semantic type of clipboard content.
   */
  private detectClipboardContentType(item: IClipboardItem): {
    contentType?: 'url' | 'text' | 'code' | 'file'
    meta?: Record<string, unknown>
  } {
    const meta: Record<string, unknown> = {}
    let contentType: 'url' | 'text' | 'code' | 'file' = 'text'

    if (item.type === 'text') {
      const content = item.content || ''
      meta.textLength = content.length

      const urlPattern = /^https?:\/\//i
      if (urlPattern.test(content.trim())) {
        try {
          const url = new URL(content.trim())
          contentType = 'url'
          meta.isUrl = true
          meta.urlDomain = url.hostname
          meta.protocol = url.protocol
        } catch {
          // Not a valid URL
        }
      }

      if (contentType === 'text') {
        const pathMatch = content.match(/\.([a-z0-9]+)$/i)
        if (pathMatch) {
          const ext = pathMatch[1].toLowerCase()
          const fileTypeInfo = this.categorizeFileType(ext)
          if (fileTypeInfo.fileType !== 'other') {
            contentType = 'file'
            meta.fileExtension = ext
            meta.fileType = fileTypeInfo.fileType
            meta.language = fileTypeInfo.language
          }
        }
      }
    }

    if (item.type === 'files') {
      try {
        const files = JSON.parse(item.content || '[]')
        if (files.length > 0) {
          const firstFile = files[0]
          const extMatch = firstFile.match(/\.([a-z0-9]+)$/i)
          if (extMatch) {
            const ext = extMatch[1].toLowerCase()
            const fileTypeInfo = this.categorizeFileType(ext)
            contentType = 'file'
            meta.fileExtension = ext
            meta.fileType = fileTypeInfo.fileType
            meta.language = fileTypeInfo.language
          }
        }
      } catch {}
    }

    return { contentType, meta }
  }

  /**
   * Categorizes file extension into broad types.
   */
  private categorizeFileType(ext: string): {
    fileType: 'code' | 'text' | 'image' | 'document' | 'other'
    language?: string
  } {
    const codeExts = new Map([
      ['js', 'javascript'],
      ['jsx', 'javascript'],
      ['ts', 'typescript'],
      ['tsx', 'typescript'],
      ['py', 'python'],
      ['java', 'java'],
      ['kt', 'kotlin'],
      ['swift', 'swift'],
      ['c', 'c'],
      ['cpp', 'cpp'],
      ['cs', 'csharp'],
      ['go', 'go'],
      ['rs', 'rust'],
      ['php', 'php'],
      ['rb', 'ruby'],
      ['scala', 'scala'],
      ['html', 'html'],
      ['css', 'css'],
      ['scss', 'scss'],
      ['vue', 'vue'],
      ['svelte', 'svelte']
    ])

    const textExts = new Set(['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml'])
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'psd', 'ai'])
    const docExts = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

    if (codeExts.has(ext)) {
      return { fileType: 'code', language: codeExts.get(ext) }
    }
    if (textExts.has(ext)) return { fileType: 'text' }
    if (imageExts.has(ext)) return { fileType: 'image' }
    if (docExts.has(ext)) return { fileType: 'document' }
    return { fileType: 'other' }
  }

  /**
   * Retrieves foreground application context.
   *
   * @remarks
   * Prefers the snapshot CoreBox takes before it steals focus; a live query
   * here would describe Touch, not the app the user came from. Dynamic import
   * prevents circular dependency with activeApp module.
   */
  private async getForegroundAppContext(): Promise<ContextSignal['foregroundApp']> {
    try {
      const { foregroundAppSnapshotStore, isSelfActiveApp } =
        await import('../../../system/foreground-app-snapshot')

      const snapshot = foregroundAppSnapshotStore.get()
      let activeApp = snapshot?.app ?? null
      if (!activeApp) {
        const { activeAppService } = await import('../../../system/active-app')
        activeApp = await activeAppService.getActiveApp({
          includeIcon: false
        })
      }

      if (!activeApp || !activeApp.bundleId) {
        return undefined
      }

      // Touch in the foreground is "no foreground signal", not a candidate to
      // penalise: scoring treats a self-match as an already-open app (−50).
      if (isSelfActiveApp(activeApp)) {
        return undefined
      }

      return {
        bundleId: activeApp.bundleId,
        name: activeApp.displayName || activeApp.identifier || ''
      }
    } catch (error) {
      contextProviderLog.debug('Failed to get foreground app context', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
      return undefined
    }
  }

  /**
   * Generates privacy-safe hash of content.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  private async getContextSources(): Promise<RecommendationContextSources> {
    const { getMainConfig, isMainStorageReady } = await import('../../../storage')

    if (!isMainStorageReady()) {
      return DEFAULT_CONTEXT_SOURCES
    }

    try {
      const settings = getMainConfig(StorageList.APP_SETTING)
      const raw = settings?.recommendation?.contextSources
      if (!raw || typeof raw !== 'object') {
        return DEFAULT_CONTEXT_SOURCES
      }

      return {
        time: raw.time !== false,
        foregroundApp: raw.foregroundApp !== false,
        clipboard: raw.clipboard !== false,
        selection: raw.selection !== false,
        network: raw.network !== false,
        focus: raw.focus !== false,
        power: raw.power !== false,
        location: raw.location !== false
      }
    } catch (error) {
      contextProviderLog.debug('Failed to load recommendation context settings', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
      return DEFAULT_CONTEXT_SOURCES
    }
  }

  /**
   * Retrieves system state context.
   */
  private async getSystemContext(
    sources: RecommendationContextSources
  ): Promise<ContextSignal['systemState']> {
    if (!sources.network && !sources.power && !sources.focus && !sources.location) {
      return undefined
    }

    const unavailableSignals: string[] = []
    const state: NonNullable<ContextSignal['systemState']> = {
      isOnline: true,
      isDNDEnabled: false,
      unavailableSignals
    }

    if (sources.network) {
      const network = this.getNetworkContext()
      state.isOnline = network.isOnline
      state.networkType = network.networkType
      state.networkIdHash = network.networkIdHash
      if (!network.available) unavailableSignals.push('network')
    }

    if (sources.power) {
      const power = await this.getPowerContext()
      if (power) {
        state.batteryLevel = power.batteryLevel
        state.isCharging = power.isCharging
        state.isOnBattery = power.isOnBattery
        state.powerMode = power.powerMode
      } else {
        unavailableSignals.push('power')
      }
    }

    if (sources.focus) {
      const focus = await this.getFocusContext()
      state.isDNDEnabled = focus.isDNDEnabled
      state.focusMode = focus.focusMode
      if (!focus.available) unavailableSignals.push('focus')
    }

    if (sources.location) {
      state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      state.locationBucket = this.hashContent(
        `${state.timezone || 'unknown'}:${this.getNetworkBucketForLocation()}`
      )
      state.timezoneChanged = await this.resolveTimezoneChanged(state.timezone)
    }

    if (unavailableSignals.length === 0) {
      delete state.unavailableSignals
    }

    return state
  }

  private getNetworkContext(): {
    available: boolean
    isOnline: boolean
    networkType: NonNullable<ContextSignal['systemState']>['networkType']
    networkIdHash?: string
  } {
    try {
      const interfaces = os.networkInterfaces()
      const active = Object.entries(interfaces).filter(([, entries]) =>
        entries?.some((entry) => !entry.internal && Boolean(entry.address))
      )
      const names = active.map(([name]) => name).sort()
      const isOnline = active.length > 0

      return {
        available: true,
        isOnline,
        networkType: this.resolveNetworkType(names, isOnline),
        networkIdHash: names.length ? this.hashContent(names.join('|')) : undefined
      }
    } catch {
      return { available: false, isOnline: true, networkType: 'unknown' }
    }
  }

  private resolveNetworkType(
    names: string[],
    isOnline: boolean
  ): NonNullable<ContextSignal['systemState']>['networkType'] {
    if (!isOnline) return 'offline'
    const text = names.join(' ').toLowerCase()
    if (/(wi-?fi|wlan|airport|en0)/.test(text)) return 'wifi'
    if (/(cell|wwan|lte|5g)/.test(text)) return 'cellular'
    if (/(eth|lan|en|bridge)/.test(text)) return 'wired'
    return 'unknown'
  }

  private async getPowerContext(): Promise<{
    batteryLevel?: number
    isCharging: boolean
    isOnBattery: boolean
    powerMode: 'charging' | 'battery' | 'unknown'
  } | null> {
    try {
      const { deviceIdleService } = await import('../../../../service/device-idle-service')
      const status = await deviceIdleService.getBatteryStatus()
      if (!status) {
        const isOnBattery = deviceIdleService.isOnBatteryPower()
        return {
          isCharging: !isOnBattery,
          isOnBattery,
          powerMode: isOnBattery ? 'battery' : 'charging'
        }
      }
      return {
        batteryLevel: status.level,
        isCharging: status.charging,
        isOnBattery: status.onBattery,
        powerMode: status.onBattery ? 'battery' : 'charging'
      }
    } catch {
      return null
    }
  }

  private async getFocusContext(): Promise<{
    available: boolean
    isDNDEnabled: boolean
    focusMode: 'active' | 'inactive' | 'unknown'
  }> {
    if (process.platform !== 'darwin') {
      return { available: false, isDNDEnabled: false, focusMode: 'unknown' }
    }

    try {
      const { stdout } = await execFileAsync('defaults', ['read', 'com.apple.ncprefs', 'dnd_prefs'])
      const enabled = /\buserPref\s*=\s*1\b|\benabled\s*=\s*1\b/i.test(stdout)
      return {
        available: true,
        isDNDEnabled: enabled,
        focusMode: enabled ? 'active' : 'inactive'
      }
    } catch {
      return { available: false, isDNDEnabled: false, focusMode: 'unknown' }
    }
  }

  /**
   * "Traveling" signal: true while the system timezone differs from the one we
   * last persisted, for {@link TIMEZONE_CHANGE_WINDOW_MS} after the switch.
   * The persisted record is runtime state, not a user setting, so it lives in
   * its own config file rather than in app settings.
   */
  private async resolveTimezoneChanged(timezone: string | undefined): Promise<boolean> {
    if (!timezone) return false

    try {
      const { getConfig, saveConfig, isMainStorageReady } = await import('../../../storage')
      if (!isMainStorageReady()) return false

      const stored = getConfig(RECOMMENDATION_RUNTIME_CONFIG) as {
        lastTimezone?: unknown
        timezoneChangedAt?: unknown
      }
      const lastTimezone = typeof stored?.lastTimezone === 'string' ? stored.lastTimezone : null
      const changedAt =
        typeof stored?.timezoneChangedAt === 'number' ? stored.timezoneChangedAt : null
      const now = Date.now()

      if (lastTimezone === timezone) {
        return changedAt != null && now - changedAt < TIMEZONE_CHANGE_WINDOW_MS
      }

      // First run has no baseline — record the timezone without claiming a trip.
      const timezoneChangedAt = lastTimezone == null ? null : now
      saveConfig(
        RECOMMENDATION_RUNTIME_CONFIG,
        JSON.stringify({ ...stored, lastTimezone: timezone, timezoneChangedAt })
      )
      return timezoneChangedAt != null
    } catch (error) {
      contextProviderLog.debug('Failed to resolve timezone change signal', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
      return false
    }
  }

  private getNetworkBucketForLocation(): string {
    const network = this.getNetworkContext()
    return network.networkIdHash || network.networkType || 'unknown'
  }

  /**
   * Generates cache key from context signal.
   *
   * @remarks
   * Only SLOW-MOVING context belongs here (time slot, workday/weekend, online
   * flag). Volatile signals — clipboard, selection, foreground app, battery,
   * power mode, DND, network identity — are deliberately absent: with them in
   * the key the 15-min background refresh warmed a key the user's own request
   * could never hit, so every visible request recomputed from scratch. They
   * are re-applied per request by the engine's volatile re-rank stage instead.
   */
  generateCacheKey(context: ContextSignal): string {
    const parts: string[] = [context.time.timeSlot, resolveDayType(context.time.dayOfWeek)]

    if (context.systemState) {
      parts.push(`net:${context.systemState.isOnline ? '1' : '0'}`)
    }

    return parts.join('|')
  }
}

/** Workday/weekend instead of the raw weekday: 7 key variants collapse to 2. */
function resolveDayType(dayOfWeek: number): 'workday' | 'weekend' {
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'workday'
}

export { ContextSignal, TimePattern }
