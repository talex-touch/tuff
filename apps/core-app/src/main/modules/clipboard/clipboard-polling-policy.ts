export type ClipboardPollingIntervalOption = 1 | 3 | 5 | 10 | 15 | -1

export interface ClipboardPollingLowBatteryPolicy {
  enable?: boolean
  interval?: 10 | 15
}

export interface ClipboardPollingSettings {
  interval?: ClipboardPollingIntervalOption
  lowBatteryPolicy?: ClipboardPollingLowBatteryPolicy
}

export interface ClipboardPollingPolicyInput {
  settings?: ClipboardPollingSettings
  coreBoxVisible: boolean
  onBattery: boolean
  startupDegradeActive: boolean
  queueStats?: {
    queued?: number
    currentTaskLabel?: string | null
  }
  lagSnapshot?: {
    lagMs: number
    at: number
  } | null
  now?: number
}

export interface ClipboardPollingPolicyConstants {
  visibleIntervalMs: number
  defaultIntervalMs: number
  pressureIntervalMs: number
  pressureQueueHighWater: number
  lagAdaptWindowMs: number
  lagAdaptWarnMs: number
  lagAdaptErrorMs: number
  lagAdaptWarnIntervalMs: number
  lagAdaptErrorIntervalMs: number
}

export const DEFAULT_CLIPBOARD_POLLING_POLICY_CONSTANTS: ClipboardPollingPolicyConstants = {
  visibleIntervalMs: 500,
  defaultIntervalMs: 3000,
  pressureIntervalMs: 10_000,
  pressureQueueHighWater: 10,
  lagAdaptWindowMs: 8000,
  lagAdaptWarnMs: 350,
  lagAdaptErrorMs: 1000,
  lagAdaptWarnIntervalMs: 1500,
  lagAdaptErrorIntervalMs: 5000
}

export function parseClipboardPollingInterval(value: unknown): ClipboardPollingIntervalOption {
  const num = typeof value === 'number' ? value : Number.NaN
  if (num === -1 || num === 1 || num === 3 || num === 5 || num === 10 || num === 15) {
    return num
  }
  return 3
}

export function parseClipboardLowBatteryInterval(value: unknown): 10 | 15 {
  return value === 15 ? 15 : 10
}

export function resolveClipboardPollingSettings(raw: unknown): ClipboardPollingSettings {
  const settings = raw as ClipboardPollingSettings | undefined
  const rawLowBattery = settings?.lowBatteryPolicy
  return {
    interval: parseClipboardPollingInterval(settings?.interval),
    lowBatteryPolicy: {
      enable: rawLowBattery?.enable !== false,
      interval: parseClipboardLowBatteryInterval(rawLowBattery?.interval)
    }
  }
}

function resolveNormalPollingIntervalMs(
  input: ClipboardPollingPolicyInput,
  constants: ClipboardPollingPolicyConstants
): number {
  const interval = input.settings?.interval ?? 3
  if (interval === -1) {
    return -1
  }

  const lowBatteryPolicy = input.settings?.lowBatteryPolicy
  if (input.onBattery && (lowBatteryPolicy?.enable ?? true)) {
    return parseClipboardLowBatteryInterval(lowBatteryPolicy?.interval) * 1000
  }

  return interval * 1000 || constants.defaultIntervalMs
}

export function resolveClipboardTargetPollingIntervalMs(
  input: ClipboardPollingPolicyInput,
  constants: ClipboardPollingPolicyConstants = DEFAULT_CLIPBOARD_POLLING_POLICY_CONSTANTS
): number {
  const baseIntervalMs = input.coreBoxVisible
    ? constants.visibleIntervalMs
    : resolveNormalPollingIntervalMs(input, constants)
  if (baseIntervalMs < 0) {
    return baseIntervalMs
  }

  const now = input.now ?? Date.now()
  const lagSnapshot = input.lagSnapshot
  if (lagSnapshot && now - lagSnapshot.at <= constants.lagAdaptWindowMs) {
    if (lagSnapshot.lagMs >= constants.lagAdaptErrorMs) {
      return Math.max(baseIntervalMs, constants.lagAdaptErrorIntervalMs)
    }
    if (lagSnapshot.lagMs >= constants.lagAdaptWarnMs) {
      return Math.max(baseIntervalMs, constants.lagAdaptWarnIntervalMs)
    }
  }

  if (input.coreBoxVisible || !input.startupDegradeActive) {
    return baseIntervalMs
  }

  const queued = input.queueStats?.queued ?? 0
  const activeLabel = input.queueStats?.currentTaskLabel ?? ''
  const indexPressureActive =
    activeLabel.startsWith('file-index.') || activeLabel.startsWith('search-index.')

  if (queued >= constants.pressureQueueHighWater && indexPressureActive) {
    return Math.max(baseIntervalMs, constants.pressureIntervalMs)
  }

  return baseIntervalMs
}
