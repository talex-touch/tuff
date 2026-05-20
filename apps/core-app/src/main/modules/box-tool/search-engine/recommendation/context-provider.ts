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
  network: boolean
  bluetooth: boolean
  focus: boolean
  power: boolean
  location: boolean
}

const DEFAULT_CONTEXT_SOURCES: RecommendationContextSources = {
  time: true,
  foregroundApp: true,
  clipboard: true,
  network: true,
  bluetooth: true,
  focus: true,
  power: true,
  location: true
}

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
    const [clipboard, foregroundApp, systemState] = await Promise.all([
      sources.clipboard ? this.getClipboardContext() : Promise.resolve(undefined),
      sources.foregroundApp ? this.getForegroundAppContext() : Promise.resolve(undefined),
      this.getSystemContext(sources)
    ])

    return {
      time: sources.time ? this.getTimeContext() : NEUTRAL_TIME_CONTEXT,
      clipboard,
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
   * Retrieves clipboard context if content is recent (within 5 seconds).
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

      const isRecent = Date.now() - new Date(latest.timestamp).getTime() < 5000
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
   * Dynamic import prevents circular dependency with activeApp module.
   */
  private async getForegroundAppContext(): Promise<ContextSignal['foregroundApp']> {
    try {
      const { activeAppService } = await import('../../../system/active-app')
      const activeApp = await activeAppService.getActiveApp({
        includeIcon: false
      })

      if (!activeApp || !activeApp.bundleId) {
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
        network: raw.network !== false,
        bluetooth: raw.bluetooth !== false,
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
    if (
      !sources.network &&
      !sources.power &&
      !sources.focus &&
      !sources.bluetooth &&
      !sources.location
    ) {
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

    if (sources.bluetooth) {
      const bluetooth = this.getBluetoothContext()
      state.bluetoothAvailable = bluetooth.available
      state.bluetoothConnectedCount = bluetooth.connectedCount
      if (!bluetooth.available) unavailableSignals.push('bluetooth')
    }

    if (sources.location) {
      state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      state.locationBucket = this.hashContent(
        `${state.timezone || 'unknown'}:${this.getNetworkBucketForLocation()}`
      )
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

  private getBluetoothContext(): { available: boolean; connectedCount: number } {
    return { available: false, connectedCount: 0 }
  }

  private getNetworkBucketForLocation(): string {
    const network = this.getNetworkContext()
    return network.networkIdHash || network.networkType || 'unknown'
  }

  /**
   * Generates cache key from context signal.
   */
  generateCacheKey(context: ContextSignal): string {
    const parts: string[] = [context.time.timeSlot, context.time.dayOfWeek.toString()]

    if (context.clipboard) {
      parts.push(`cb:${context.clipboard.type}:${context.clipboard.content}`)
    }

    if (context.foregroundApp) {
      parts.push(`fg:${context.foregroundApp.bundleId}`)
    }

    if (context.systemState) {
      const batteryBucket =
        typeof context.systemState.batteryLevel === 'number'
          ? Math.floor(context.systemState.batteryLevel / 20) * 20
          : 'unknown'
      parts.push(
        `net:${context.systemState.isOnline ? '1' : '0'}`,
        `nt:${context.systemState.networkType || 'unknown'}`,
        `nid:${context.systemState.networkIdHash || 'none'}`,
        `bat:${batteryBucket}`,
        `pow:${context.systemState.powerMode || 'unknown'}`,
        `dnd:${context.systemState.isDNDEnabled ? '1' : '0'}`,
        `bt:${
          context.systemState.bluetoothAvailable
            ? (context.systemState.bluetoothConnectedCount ?? 0)
            : 'na'
        }`,
        `loc:${context.systemState.locationBucket || 'none'}`
      )
    }

    return parts.join('|')
  }
}

export { ContextSignal, TimePattern }
