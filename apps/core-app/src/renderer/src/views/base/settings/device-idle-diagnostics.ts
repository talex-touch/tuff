import type {
  DeviceIdleBatteryStatus,
  DeviceIdleBlockedReason
} from '@talex-touch/utils/transport/events/types'

export type DeviceIdleDiagnosticTone = 'neutral' | 'success' | 'warning'

export function getDeviceIdleReasonKey(reason?: DeviceIdleBlockedReason): string {
  switch (reason) {
    case 'not-idle':
      return 'settings.settingFileIndex.diagnosticNotIdle'
    case 'battery-low':
      return 'settings.settingFileIndex.diagnosticBatteryLow'
    case 'battery-critical':
      return 'settings.settingFileIndex.diagnosticBatteryCritical'
    default:
      return 'settings.settingFileIndex.diagnosticAllowed'
  }
}

export function getDeviceIdleDiagnosticTone(
  diagnostic: { allowed: boolean; reason?: DeviceIdleBlockedReason } | null
): DeviceIdleDiagnosticTone {
  if (!diagnostic) return 'neutral'
  return diagnostic.allowed ? 'success' : 'warning'
}

export function formatDeviceIdleDuration(idleMs: number | null): { value: string; unit: string } {
  if (typeof idleMs !== 'number' || !Number.isFinite(idleMs)) {
    return { value: '-', unit: '' }
  }

  const minutes = idleMs / 60000
  if (minutes < 60) {
    return { value: minutes.toFixed(1), unit: 'min' }
  }

  return { value: (minutes / 60).toFixed(1), unit: 'hr' }
}

export function formatDeviceBatteryStatus(battery: DeviceIdleBatteryStatus | null): {
  level: string
  stateKey: 'charging' | 'onBattery' | 'unknown'
} {
  if (!battery || typeof battery.level !== 'number' || !Number.isFinite(battery.level)) {
    return { level: '-', stateKey: 'unknown' }
  }

  return {
    level: `${Math.round(battery.level)}%`,
    stateKey: battery.charging ? 'charging' : 'onBattery'
  }
}
