import { describe, expect, it } from 'vitest'
import {
  formatDeviceBatteryStatus,
  formatDeviceIdleDuration,
  getDeviceIdleDiagnosticTone,
  getDeviceIdleReasonKey
} from './device-idle-diagnostics'

describe('device idle diagnostics helpers', () => {
  it('maps known block reasons to i18n keys', () => {
    expect(getDeviceIdleReasonKey('not-idle')).toBe('settings.settingFileIndex.diagnosticNotIdle')
    expect(getDeviceIdleReasonKey('battery-low')).toBe(
      'settings.settingFileIndex.diagnosticBatteryLow'
    )
    expect(getDeviceIdleReasonKey('battery-critical')).toBe(
      'settings.settingFileIndex.diagnosticBatteryCritical'
    )
  })

  it('formats idle duration with stable minute and hour units', () => {
    expect(formatDeviceIdleDuration(null)).toEqual({ value: '-', unit: '' })
    expect(formatDeviceIdleDuration(90000)).toEqual({ value: '1.5', unit: 'min' })
    expect(formatDeviceIdleDuration(2 * 60 * 60 * 1000)).toEqual({ value: '2.0', unit: 'hr' })
  })

  it('formats battery status without guessing unavailable data', () => {
    expect(formatDeviceBatteryStatus(null)).toEqual({ level: '-', stateKey: 'unknown' })
    expect(formatDeviceBatteryStatus({ level: 12, charging: false, onBattery: true })).toEqual({
      level: '12%',
      stateKey: 'onBattery'
    })
    expect(formatDeviceBatteryStatus({ level: 88, charging: true, onBattery: false })).toEqual({
      level: '88%',
      stateKey: 'charging'
    })
  })

  it('uses success tone only when current diagnostic allows execution', () => {
    expect(getDeviceIdleDiagnosticTone({ allowed: true })).toBe('success')
    expect(getDeviceIdleDiagnosticTone({ allowed: false, reason: 'not-idle' })).toBe('warning')
    expect(getDeviceIdleDiagnosticTone(null)).toBe('neutral')
  })
})
