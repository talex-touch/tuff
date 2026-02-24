import { describe, expect, it } from 'vitest'
import {
  clampBatteryPercent,
  evaluateBatteryPolicy,
  normalizeBatteryPolicy,
  type BatteryPolicy,
} from '../common'

const DEFAULT_POLICY: BatteryPolicy = {
  minBatteryPercent: 60,
  blockBatteryBelowPercent: 15,
  allowWhenCharging: true,
}

describe('battery policy helpers', () => {
  it('normalizes policy and keeps min threshold >= block threshold', () => {
    const normalized = normalizeBatteryPolicy(
      {
        minBatteryPercent: 10,
        blockBatteryBelowPercent: 20,
      },
      DEFAULT_POLICY,
    )

    expect(normalized).toEqual({
      minBatteryPercent: 20,
      blockBatteryBelowPercent: 20,
      allowWhenCharging: true,
    })
  })

  it('blocks battery-critical before low-battery checks', () => {
    const result = evaluateBatteryPolicy(
      {
        level: 10,
        charging: true,
      },
      DEFAULT_POLICY,
    )

    expect(result).toEqual({
      allowed: false,
      reason: 'battery-critical',
    })
  })

  it('allows low battery when charging and policy allows charging', () => {
    const result = evaluateBatteryPolicy(
      {
        level: 30,
        charging: true,
      },
      DEFAULT_POLICY,
    )

    expect(result).toEqual({ allowed: true })
  })

  it('clamps percent values to [0, 100]', () => {
    expect(clampBatteryPercent(-1, 50)).toBe(0)
    expect(clampBatteryPercent(101, 50)).toBe(100)
    expect(clampBatteryPercent(Number.NaN, 50)).toBe(50)
  })
})
