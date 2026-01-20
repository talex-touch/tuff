export interface DeviceIdleSettings {
  idleThresholdMs: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  forceAfterHours: number
}
