import type { AppSetting } from '@talex-touch/utils'
import { StorageList } from '@talex-touch/utils'
import {
  DEFAULT_KEEP_AWAKE_DURATION_MS,
  DEFAULT_POMODORO_BREAK_DURATION_MS,
  DEFAULT_POMODORO_DURATION_MS,
  DEFAULT_SCREEN_CLEAN_DURATION_MS,
  DEFAULT_SYSTEM_AWAKE_DURATION_MS,
  DEFAULT_TIMER_DURATION_MS,
  DEFAULT_TIMER_EXTEND_DURATION_MS
} from './quick-ops-session-manager'
import { getMainConfig } from '../storage'
import type {
  QuickOpsCustomPomodoroTemplate,
  QuickOpsResolvedSettings,
  QuickOpsSettingsInput
} from './quick-ops-runtime-types'

export function readQuickOpsSettings(): AppSetting['quickOps'] | undefined {
  return (getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined)?.quickOps
}

export function getQuickOpsResolvedSettings(
  settings?: QuickOpsSettingsInput
): QuickOpsResolvedSettings {
  return {
    enabled: settings?.enabled !== false,
    showRunningSessionsInCoreBox: settings?.showRunningSessionsInCoreBox !== false,
    allowStatefulTools: settings?.allowStatefulTools !== false,
    allowNetworkTools: settings?.allowNetworkTools !== false,
    allowFileTools: settings?.allowFileTools !== false,
    allowSystemTools: settings?.allowSystemTools !== false,
    allowDeveloperTools: settings?.allowDeveloperTools !== false,
    allowHighRiskTools: settings?.allowHighRiskTools === true,
    defaultKeepAwakeDurationMs: minutesToMs(
      settings?.defaultKeepAwakeDurationMinutes,
      DEFAULT_KEEP_AWAKE_DURATION_MS
    ),
    defaultSystemAwakeDurationMs: minutesToMs(
      settings?.defaultSystemAwakeDurationMinutes,
      DEFAULT_SYSTEM_AWAKE_DURATION_MS
    ),
    defaultTimerDurationMs: minutesToMs(
      settings?.defaultTimerDurationMinutes,
      DEFAULT_TIMER_DURATION_MS
    ),
    defaultTimerExtendMs: minutesToMs(
      settings?.defaultTimerExtendMinutes,
      DEFAULT_TIMER_EXTEND_DURATION_MS
    ),
    defaultPomodoroFocusMs: minutesToMs(
      settings?.defaultPomodoroFocusMinutes,
      DEFAULT_POMODORO_DURATION_MS
    ),
    defaultPomodoroBreakMs: minutesToMs(
      settings?.defaultPomodoroBreakMinutes,
      DEFAULT_POMODORO_BREAK_DURATION_MS
    ),
    pomodoroTemplates: {
      classic: settings?.pomodoroTemplates?.classic !== false,
      long: settings?.pomodoroTemplates?.long !== false,
      custom: normalizeCustomPomodoroTemplates(settings?.pomodoroTemplates?.custom)
    },
    defaultScreenCleanDurationMs: secondsToMs(
      settings?.defaultScreenCleanDurationSeconds,
      DEFAULT_SCREEN_CLEAN_DURATION_MS
    ),
    defaultScreenCleanMode: settings?.defaultScreenCleanMode === 'white' ? 'white' : 'black',
    allowPublicIpLookup: settings?.allowPublicIpLookup === true
  }
}

function minutesToMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackMs
  return Math.max(1_000, value * 60 * 1000)
}

function secondsToMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackMs
  return Math.max(1_000, value * 1000)
}
function normalizeCustomPomodoroTemplates(value: unknown): QuickOpsCustomPomodoroTemplate[] {
  if (!Array.isArray(value)) return []

  const templates: QuickOpsCustomPomodoroTemplate[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const aliases = Array.isArray(record.aliases)
      ? record.aliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map((alias) => alias.trim())
          .filter(Boolean)
      : []
    const focusMinutes = Number(record.focusMinutes)
    const breakMinutes = Number(record.breakMinutes)
    if (!name || !isValidPomodoroTemplate(focusMinutes, breakMinutes)) continue

    templates.push({
      name,
      aliases: aliases.slice(0, 6),
      focusMinutes,
      breakMinutes,
      enabled: record.enabled !== false
    })
    if (templates.length >= 8) break
  }
  return templates
}

export function isValidPomodoroTemplate(focusMinutes: number, breakMinutes: number): boolean {
  return (
    Number.isInteger(focusMinutes) &&
    Number.isInteger(breakMinutes) &&
    focusMinutes >= 1 &&
    focusMinutes <= 180 &&
    breakMinutes >= 1 &&
    breakMinutes <= 60
  )
}
