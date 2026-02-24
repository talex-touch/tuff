export interface BatteryState {
  level: number
  charging: boolean
}

export interface BatteryPolicy {
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
}

export type BatteryPolicyBlockedReason = 'battery-critical' | 'battery-low'

export function clampBatteryPercent(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(0, Math.min(100, value))
}

export function normalizeBatteryPolicy(
  raw: Partial<BatteryPolicy> | null | undefined,
  fallback: BatteryPolicy
): BatteryPolicy {
  const data = raw && typeof raw === 'object' ? raw : {}
  const blockBatteryBelowPercent = clampBatteryPercent(
    data.blockBatteryBelowPercent,
    fallback.blockBatteryBelowPercent
  )
  const minBatteryPercent = Math.max(
    clampBatteryPercent(data.minBatteryPercent, fallback.minBatteryPercent),
    blockBatteryBelowPercent
  )
  return {
    minBatteryPercent,
    blockBatteryBelowPercent,
    allowWhenCharging:
      typeof data.allowWhenCharging === 'boolean'
        ? data.allowWhenCharging
        : fallback.allowWhenCharging
  }
}

export function evaluateBatteryPolicy(
  battery: BatteryState | null | undefined,
  policy: BatteryPolicy
): { allowed: true } | { allowed: false; reason: BatteryPolicyBlockedReason } {
  if (!battery) {
    return { allowed: true }
  }

  const level = clampBatteryPercent(battery.level, 0)
  const charging = battery.charging === true

  if (level < policy.blockBatteryBelowPercent) {
    return { allowed: false, reason: 'battery-critical' }
  }

  if (level < policy.minBatteryPercent && !(charging && policy.allowWhenCharging)) {
    return { allowed: false, reason: 'battery-low' }
  }

  return { allowed: true }
}
