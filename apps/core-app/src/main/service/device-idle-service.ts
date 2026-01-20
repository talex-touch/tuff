import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { powerMonitor } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import {
  getMainConfig,
  isMainStorageReady,
  saveMainConfig,
  subscribeMainConfig
} from '../modules/storage'

const execFileAsync = promisify(execFile)
const deviceIdleLog = getLogger('device-idle-service')

export interface DeviceIdleSettings {
  idleThresholdMs: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  forceAfterHours: number
}

export interface DeviceBatteryStatus {
  level: number
  charging: boolean
  onBattery: boolean
}

export interface DeviceIdleSnapshot {
  idleMs: number | null
  battery: DeviceBatteryStatus | null
}

export interface DeviceIdlePolicy {
  idleThresholdMs: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  lastRunAt?: number
  forceAfterMs?: number
}

export interface DeviceIdleDecision {
  allowed: boolean
  reason?: string
  forced?: boolean
  snapshot: DeviceIdleSnapshot
}

const DEFAULT_DEVICE_IDLE_SETTINGS: DeviceIdleSettings = {
  idleThresholdMs: 60 * 60 * 1000,
  minBatteryPercent: 60,
  blockBatteryBelowPercent: 15,
  allowWhenCharging: true,
  forceAfterHours: 48
}

export class DeviceIdleService {
  private static instance: DeviceIdleService | null = null
  private settings: DeviceIdleSettings = { ...DEFAULT_DEVICE_IDLE_SETTINGS }
  private settingsLoaded = false
  private storageReadyHooked = false
  private unsubscribeSettings: (() => void) | null = null

  private constructor() {
    this.ensureSettingsLoaded()
    this.setupStorageReadyHook()
  }

  static getInstance(): DeviceIdleService {
    if (!DeviceIdleService.instance) {
      DeviceIdleService.instance = new DeviceIdleService()
    }
    return DeviceIdleService.instance
  }

  getSettings(): DeviceIdleSettings {
    this.ensureSettingsLoaded()
    return { ...this.settings }
  }

  updateSettings(input: Partial<DeviceIdleSettings>): DeviceIdleSettings {
    this.ensureSettingsLoaded()
    this.settings = this.normalizeSettings({ ...this.settings, ...input })
    saveMainConfig(StorageList.DEVICE_IDLE_SETTINGS, this.settings)
    return { ...this.settings }
  }

  getDefaultPolicy(): DeviceIdlePolicy {
    this.ensureSettingsLoaded()
    return {
      idleThresholdMs: this.settings.idleThresholdMs,
      minBatteryPercent: this.settings.minBatteryPercent,
      blockBatteryBelowPercent: this.settings.blockBatteryBelowPercent,
      allowWhenCharging: this.settings.allowWhenCharging,
      forceAfterMs: this.settings.forceAfterHours * 60 * 60 * 1000
    }
  }

  async getSnapshot(): Promise<DeviceIdleSnapshot> {
    return {
      idleMs: this.getSystemIdleMs(),
      battery: await this.getBatteryStatus()
    }
  }

  async canRun(overrides?: Partial<DeviceIdlePolicy>): Promise<DeviceIdleDecision> {
    const policy = this.resolvePolicy(overrides)
    const snapshot = await this.getSnapshot()
    const now = Date.now()
    const forceAfterMs = policy.forceAfterMs ?? 0
    const forced =
      typeof policy.lastRunAt === 'number' &&
      forceAfterMs > 0 &&
      now - policy.lastRunAt >= forceAfterMs

    if (!forced) {
      if (snapshot.idleMs !== null && snapshot.idleMs < policy.idleThresholdMs) {
        return { allowed: false, reason: 'not-idle', snapshot }
      }
    }

    const battery = snapshot.battery
    if (battery) {
      if (battery.level < policy.blockBatteryBelowPercent) {
        return { allowed: false, reason: 'battery-critical', snapshot }
      }
      if (battery.level < policy.minBatteryPercent) {
        if (!(battery.charging && policy.allowWhenCharging)) {
          return { allowed: false, reason: 'battery-low', snapshot }
        }
      }
    }

    return { allowed: true, forced, snapshot }
  }

  getSystemIdleMs(): number | null {
    try {
      if (typeof powerMonitor.getSystemIdleTime === 'function') {
        return powerMonitor.getSystemIdleTime() * 1000
      }
    } catch (error) {
      deviceIdleLog.warn('Failed to read system idle time', { error })
    }
    return null
  }

  async getBatteryStatus(): Promise<DeviceBatteryStatus | null> {
    try {
      const onBattery = this.safeIsOnBatteryPower()
      const percent = await this.getBatteryPercent()
      if (percent !== null) {
        return {
          level: percent,
          charging: !onBattery,
          onBattery
        }
      }

      if (onBattery) {
        return { level: 0, charging: false, onBattery: true }
      }

      return { level: 100, charging: true, onBattery: false }
    } catch (error) {
      deviceIdleLog.error('Failed to read battery status', { error })
      return null
    }
  }

  async getBatteryPercent(): Promise<number | null> {
    return this.readBatteryPercent()
  }

  isOnBatteryPower(): boolean {
    return this.safeIsOnBatteryPower()
  }

  private safeIsOnBatteryPower(): boolean {
    try {
      if (typeof powerMonitor.isOnBatteryPower === 'function') {
        return powerMonitor.isOnBatteryPower()
      }
      return ((powerMonitor as any)?.onBatteryPower ?? false) as boolean
    } catch {
      return false
    }
  }

  private async readBatteryPercent(): Promise<number | null> {
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
        const powerSupplyPath = '/sys/class/power_supply'
        await fs.access(powerSupplyPath).catch(() => {
          throw new Error('No power supply class')
        })
        const entries = await fs.readdir(powerSupplyPath)
        const battery = entries.find((entry) => entry.startsWith('BAT'))
        if (battery) {
          const capacityPath = path.join(powerSupplyPath, battery, 'capacity')
          const content = await fs.readFile(capacityPath, 'utf8')
          const value = Number.parseInt(content.trim(), 10)
          if (!Number.isNaN(value)) {
            return Math.max(0, Math.min(100, value))
          }
        }
      }
    } catch (error) {
      deviceIdleLog.warn('Failed to read battery percent', { error })
    }
    return null
  }

  private resolvePolicy(overrides?: Partial<DeviceIdlePolicy>): DeviceIdlePolicy {
    const base = this.getDefaultPolicy()
    return {
      ...base,
      ...overrides
    }
  }

  private loadSettings(): DeviceIdleSettings {
    try {
      const raw = getMainConfig(StorageList.DEVICE_IDLE_SETTINGS) as
        | Partial<DeviceIdleSettings>
        | undefined
      const normalized = this.normalizeSettings(raw)
      try {
        saveMainConfig(StorageList.DEVICE_IDLE_SETTINGS, normalized)
      } catch (error) {
        deviceIdleLog.warn('Failed to persist device idle settings', { error })
      }
      return normalized
    } catch (error) {
      deviceIdleLog.warn('Failed to load device idle settings, using defaults', { error })
      return { ...DEFAULT_DEVICE_IDLE_SETTINGS }
    }
  }

  private setupStorageReadyHook(): void {
    if (this.storageReadyHooked) return
    this.storageReadyHooked = true

    if (isMainStorageReady()) {
      this.ensureSettingsLoaded()
      this.setupSettingsWatcher()
      return
    }

    touchEventBus.once(TalexEvents.ALL_MODULES_LOADED, () => {
      this.ensureSettingsLoaded()
      this.setupSettingsWatcher()
    })
  }

  private setupSettingsWatcher(): void {
    if (this.unsubscribeSettings) return
    try {
      this.unsubscribeSettings = subscribeMainConfig(StorageList.DEVICE_IDLE_SETTINGS, (data) => {
        this.settings = this.normalizeSettings(data as Partial<DeviceIdleSettings>)
        this.settingsLoaded = true
      })
    } catch (error) {
      deviceIdleLog.warn('Failed to setup device idle settings watcher', { error })
    }
  }

  private ensureSettingsLoaded(): void {
    if (this.settingsLoaded) return
    if (!isMainStorageReady()) return
    this.settings = this.loadSettings()
    this.settingsLoaded = true
  }

  private normalizeSettings(raw?: Partial<DeviceIdleSettings> | null): DeviceIdleSettings {
    const data = raw && typeof raw === 'object' ? raw : {}
    const clampPercent = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback
      }
      return Math.max(0, Math.min(100, value))
    }
    const clampMs = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback
      }
      return value
    }
    const clampHours = (value: unknown, fallback: number) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fallback
      }
      return value
    }

    const blockBattery = clampPercent(
      data.blockBatteryBelowPercent,
      DEFAULT_DEVICE_IDLE_SETTINGS.blockBatteryBelowPercent
    )
    const minBattery = Math.max(
      clampPercent(data.minBatteryPercent, DEFAULT_DEVICE_IDLE_SETTINGS.minBatteryPercent),
      blockBattery
    )

    return {
      idleThresholdMs: clampMs(data.idleThresholdMs, DEFAULT_DEVICE_IDLE_SETTINGS.idleThresholdMs),
      minBatteryPercent: minBattery,
      blockBatteryBelowPercent: blockBattery,
      allowWhenCharging:
        typeof data.allowWhenCharging === 'boolean'
          ? data.allowWhenCharging
          : DEFAULT_DEVICE_IDLE_SETTINGS.allowWhenCharging,
      forceAfterHours: clampHours(
        data.forceAfterHours,
        DEFAULT_DEVICE_IDLE_SETTINGS.forceAfterHours
      )
    }
  }
}

export const deviceIdleService = DeviceIdleService.getInstance()
