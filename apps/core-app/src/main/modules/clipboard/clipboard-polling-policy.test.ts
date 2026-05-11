import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLIPBOARD_POLLING_POLICY_CONSTANTS,
  parseClipboardPollingInterval,
  resolveClipboardPollingSettings,
  resolveClipboardTargetPollingIntervalMs
} from './clipboard-polling-policy'

const constants = DEFAULT_CLIPBOARD_POLLING_POLICY_CONSTANTS

describe('clipboard-polling-policy', () => {
  it('normalizes invalid settings to the default polling policy', () => {
    expect(parseClipboardPollingInterval(7)).toBe(3)
    expect(
      resolveClipboardPollingSettings({ interval: 10, lowBatteryPolicy: { interval: 15 } })
    ).toEqual({
      interval: 10,
      lowBatteryPolicy: { enable: true, interval: 15 }
    })
  })

  it('prefers visible interval and ignores startup pressure while CoreBox is visible', () => {
    expect(
      resolveClipboardTargetPollingIntervalMs(
        {
          settings: resolveClipboardPollingSettings({ interval: 3 }),
          coreBoxVisible: true,
          onBattery: false,
          startupDegradeActive: true,
          queueStats: { queued: 99, currentTaskLabel: 'file-index.scan' },
          now: 1000
        },
        constants
      )
    ).toBe(constants.visibleIntervalMs)
  })

  it('uses low-battery interval unless disabled', () => {
    expect(
      resolveClipboardTargetPollingIntervalMs({
        settings: resolveClipboardPollingSettings({
          interval: 3,
          lowBatteryPolicy: { interval: 10 }
        }),
        coreBoxVisible: false,
        onBattery: true,
        startupDegradeActive: false
      })
    ).toBe(10_000)

    expect(
      resolveClipboardTargetPollingIntervalMs({
        settings: resolveClipboardPollingSettings({
          interval: 3,
          lowBatteryPolicy: { enable: false, interval: 10 }
        }),
        coreBoxVisible: false,
        onBattery: true,
        startupDegradeActive: false
      })
    ).toBe(3000)
  })

  it('adapts polling under event-loop lag and startup index pressure', () => {
    expect(
      resolveClipboardTargetPollingIntervalMs({
        settings: resolveClipboardPollingSettings({ interval: 1 }),
        coreBoxVisible: false,
        onBattery: false,
        startupDegradeActive: false,
        lagSnapshot: { lagMs: 400, at: 900 },
        now: 1000
      })
    ).toBe(constants.lagAdaptWarnIntervalMs)

    expect(
      resolveClipboardTargetPollingIntervalMs({
        settings: resolveClipboardPollingSettings({ interval: 3 }),
        coreBoxVisible: false,
        onBattery: false,
        startupDegradeActive: true,
        queueStats: { queued: 10, currentTaskLabel: 'search-index.flush' }
      })
    ).toBe(constants.pressureIntervalMs)
  })
})
