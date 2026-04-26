export interface DeviceIdleSettings {
  idleThresholdMs: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  forceAfterHours: number
}

export type DeviceIdleBlockedReason = 'not-idle' | 'battery-low' | 'battery-critical'

export interface DeviceIdleBatteryStatus {
  level: number
  charging: boolean
  onBattery: boolean
}

export interface DeviceIdleSnapshot {
  idleMs: number | null
  battery: DeviceIdleBatteryStatus | null
}

export interface DeviceIdleDiagnostic {
  allowed: boolean
  reason?: DeviceIdleBlockedReason
  forced?: boolean
  snapshot: DeviceIdleSnapshot
  settings: DeviceIdleSettings
}
