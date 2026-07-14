import type { QuickOpsScreenCleanMode } from './quick-ops-session-manager'
import { DEFAULT_KEEP_AWAKE_EXTEND_DURATION_MS } from './quick-ops-session-manager'
import type {
  ParsedPomodoroCycle,
  ParsedQuickOpsQuery,
  QuickOpsResolvedSettings
} from './quick-ops-runtime-types'
import { getQuickOpsResolvedSettings, isValidPomodoroTemplate } from './quick-ops-settings'

const KEEP_AWAKE_KEYWORDS = [
  'keep awake',
  'caffeine',
  'stay awake',
  '禁止息屏',
  '不要黑屏',
  '保持唤醒',
  '防止睡眠'
]

const KEEP_AWAKE_STOP_KEYWORDS = [
  'stop keep awake',
  'stop caffeine',
  'cancel keep awake',
  '停止保持唤醒',
  '取消保持唤醒',
  '停止禁止息屏'
]

const KEEP_AWAKE_EXTEND_KEYWORDS = [
  'extend keep awake',
  'extend caffeine',
  'extend stay awake',
  '延长保持唤醒',
  '延长禁止息屏',
  '保持唤醒延长'
]

const SYSTEM_AWAKE_KEYWORDS = [
  'prevent system sleep',
  'keep system awake',
  'no system sleep',
  '禁止系统睡眠',
  '防止系统睡眠',
  '不要系统睡眠'
]

const SYSTEM_AWAKE_STOP_KEYWORDS = [
  'stop prevent system sleep',
  'stop system awake',
  'cancel system awake',
  '停止禁止系统睡眠',
  '取消禁止系统睡眠',
  '停止系统唤醒'
]

const TIMER_KEYWORDS = ['timer', 'start timer', '计时', '倒计时', '开始计时']
const TIMER_EXTEND_KEYWORDS = [
  'extend timer',
  'snooze timer',
  'add timer',
  '延长计时',
  '计时延长',
  '再计时'
]
const TIMER_PAUSE_KEYWORDS = ['pause timer', '暂停计时', '暂停倒计时']
const TIMER_RESUME_KEYWORDS = ['resume timer', 'continue timer', '继续计时', '恢复计时']
const TIMER_STOP_KEYWORDS = ['stop timer', 'cancel timer', '停止计时', '取消计时']
const POMODORO_KEYWORDS = ['pomodoro', 'start pomodoro', '番茄钟', '开始番茄钟']
const POMODORO_CYCLE_KEYWORDS = [
  'pomodoro cycle',
  'start pomodoro cycle',
  'cycle pomodoro',
  '循环番茄钟',
  '番茄钟循环'
]
const POMODORO_CUSTOM_TEMPLATE_KEYWORDS = [
  'custom pomodoro',
  'pomodoro custom',
  'custom pomodoro template',
  '自定义番茄钟',
  '番茄钟自定义',
  '自定义番茄模板'
]
const POMODORO_PAUSE_KEYWORDS = ['pause pomodoro', '暂停番茄钟']
const POMODORO_RESUME_KEYWORDS = [
  'resume pomodoro',
  'continue pomodoro',
  '继续番茄钟',
  '恢复番茄钟'
]
const POMODORO_STOP_KEYWORDS = ['stop pomodoro', 'cancel pomodoro', '停止番茄钟', '取消番茄钟']
const SCREEN_CLEAN_KEYWORDS = [
  'clean screen',
  'screen clean',
  'screen cleaning',
  'wipe screen',
  'black clean screen',
  'white clean screen',
  'solid color screen',
  'screen color test',
  'screen test',
  'dead pixel test',
  'red screen test',
  'green screen test',
  'blue screen test',
  '清洁屏幕',
  '擦屏幕',
  '屏幕清洁',
  '黑色清洁屏幕',
  '白色清洁屏幕',
  '白底清洁屏幕',
  '黑底清洁屏幕',
  '纯色屏幕',
  '屏幕纯色',
  '屏幕测试',
  '坏点测试',
  '红色屏幕测试',
  '绿色屏幕测试',
  '蓝色屏幕测试'
]
const SCREEN_CLEAN_WHITE_KEYWORDS = ['white', 'light', '白色', '白底']
const SCREEN_COLOR_TEST_KEYWORDS = [
  'solid color screen',
  'screen color test',
  'screen test',
  'dead pixel test',
  '纯色屏幕',
  '屏幕纯色',
  '屏幕测试',
  '坏点测试'
]
const SCREEN_CLEAN_STOP_KEYWORDS = [
  'stop clean screen',
  'stop screen clean',
  'cancel clean screen',
  '停止清洁屏幕',
  '退出清洁屏幕',
  '关闭清洁屏幕'
]
const STOPWATCH_KEYWORDS = ['stopwatch', 'start stopwatch', '秒表', '开始秒表']
const STOPWATCH_PAUSE_KEYWORDS = ['pause stopwatch', '暂停秒表']
const STOPWATCH_RESUME_KEYWORDS = ['resume stopwatch', 'continue stopwatch', '继续秒表', '恢复秒表']
const STOPWATCH_LAP_KEYWORDS = ['lap stopwatch', 'split stopwatch', '秒表分段', '记录分段']
const STOPWATCH_RESET_KEYWORDS = [
  'reset stopwatch',
  'stop stopwatch',
  'clear stopwatch',
  '重置秒表',
  '停止秒表',
  '清空秒表'
]
export function parseQuickOpsQuery(
  rawText: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): ParsedQuickOpsQuery | null {
  const text = rawText.trim()
  if (!text) return null
  const normalized = text.toLowerCase()

  if (matchesKeyword(normalized, KEEP_AWAKE_STOP_KEYWORDS)) {
    return { action: 'keep-awake-stop' }
  }
  if (matchesKeyword(normalized, SYSTEM_AWAKE_STOP_KEYWORDS)) {
    return { action: 'system-awake-stop' }
  }
  if (matchesKeyword(normalized, KEEP_AWAKE_EXTEND_KEYWORDS)) {
    return {
      action: 'keep-awake-extend',
      durationMs: parseDurationMs(normalized) ?? DEFAULT_KEEP_AWAKE_EXTEND_DURATION_MS
    }
  }
  if (matchesKeyword(normalized, TIMER_STOP_KEYWORDS)) {
    return { action: 'timer-stop' }
  }
  if (matchesKeyword(normalized, TIMER_PAUSE_KEYWORDS)) {
    return { action: 'timer-pause' }
  }
  if (matchesKeyword(normalized, TIMER_RESUME_KEYWORDS)) {
    return { action: 'timer-resume' }
  }
  if (matchesKeyword(normalized, POMODORO_STOP_KEYWORDS)) {
    return { action: 'pomodoro-stop' }
  }
  if (matchesKeyword(normalized, POMODORO_PAUSE_KEYWORDS)) {
    return { action: 'pomodoro-pause' }
  }
  if (matchesKeyword(normalized, POMODORO_RESUME_KEYWORDS)) {
    return { action: 'pomodoro-resume' }
  }
  if (matchesKeyword(normalized, SCREEN_CLEAN_STOP_KEYWORDS)) {
    return { action: 'screen-clean-stop' }
  }
  if (matchesKeyword(normalized, STOPWATCH_PAUSE_KEYWORDS)) {
    return { action: 'stopwatch-pause' }
  }
  if (matchesKeyword(normalized, STOPWATCH_RESUME_KEYWORDS)) {
    return { action: 'stopwatch-resume' }
  }
  if (matchesKeyword(normalized, STOPWATCH_LAP_KEYWORDS)) {
    return { action: 'stopwatch-lap' }
  }
  if (matchesKeyword(normalized, STOPWATCH_RESET_KEYWORDS)) {
    return { action: 'stopwatch-reset' }
  }
  if (matchesKeyword(normalized, TIMER_EXTEND_KEYWORDS)) {
    return {
      action: 'timer-extend',
      durationMs: parseDurationMs(normalized) ?? settings.defaultTimerExtendMs
    }
  }
  if (matchesKeyword(normalized, KEEP_AWAKE_KEYWORDS)) {
    return {
      action: 'keep-awake-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultKeepAwakeDurationMs
    }
  }
  if (matchesKeyword(normalized, SYSTEM_AWAKE_KEYWORDS)) {
    return {
      action: 'system-awake-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultSystemAwakeDurationMs
    }
  }
  if (matchesKeyword(normalized, TIMER_KEYWORDS)) {
    return {
      action: 'timer-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultTimerDurationMs
    }
  }
  const customPomodoroTemplate = parseCustomPomodoroTemplate(normalized, settings)
  if (customPomodoroTemplate) {
    return {
      action: 'pomodoro-start',
      ...customPomodoroTemplate,
      pomodoroMode: 'cycle'
    }
  }
  if (matchesKeyword(normalized, POMODORO_CYCLE_KEYWORDS)) {
    return {
      action: 'pomodoro-start',
      ...parsePomodoroCycle(normalized, settings)
    }
  }
  if (matchesKeyword(normalized, POMODORO_CUSTOM_TEMPLATE_KEYWORDS)) {
    return {
      action: 'pomodoro-start',
      ...parsePomodoroCycle(normalized, settings)
    }
  }
  if (matchesKeyword(normalized, POMODORO_KEYWORDS)) {
    const durationParts = parseDurationPartsMs(normalized)
    const template = parsePomodoroTemplate(normalized, settings)
    if (durationParts.length >= 2 || template) {
      return {
        action: 'pomodoro-start',
        ...parsePomodoroCycle(normalized, settings)
      }
    }

    return {
      action: 'pomodoro-start',
      durationMs: durationParts[0] ?? settings.defaultPomodoroFocusMs
    }
  }
  if (matchesKeyword(normalized, SCREEN_CLEAN_KEYWORDS)) {
    return {
      action: 'screen-clean-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultScreenCleanDurationMs,
      screenMode: parseScreenCleanMode(normalized, settings.defaultScreenCleanMode)
    }
  }
  if (matchesKeyword(normalized, STOPWATCH_KEYWORDS)) {
    return { action: 'stopwatch-start' }
  }

  return null
}

function matchesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function parseScreenCleanMode(
  text: string,
  defaultMode: QuickOpsScreenCleanMode
): QuickOpsScreenCleanMode {
  if (matchesKeyword(text, ['red', '红色', '红屏'])) return 'red'
  if (matchesKeyword(text, ['green', '绿色', '绿屏'])) return 'green'
  if (matchesKeyword(text, ['blue', '蓝色', '蓝屏'])) return 'blue'
  if (matchesKeyword(text, SCREEN_CLEAN_WHITE_KEYWORDS)) return 'white'
  if (matchesKeyword(text, ['black', 'dark', '黑色', '黑底'])) return 'black'
  if (matchesKeyword(text, SCREEN_COLOR_TEST_KEYWORDS)) return 'red'
  return defaultMode
}

const DURATION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)/gi

export function parseDurationMs(text: string): number | null {
  const matches = parseDurationPartsMs(text)
  if (matches.length === 0) return null

  const total = matches.reduce((sum, durationMs) => sum + durationMs, 0)

  return total > 0 ? total : null
}

export function parseDurationPartsMs(text: string): number[] {
  const matches = Array.from(text.matchAll(DURATION_PATTERN))
  const durations: number[] = []

  for (const match of matches) {
    const amount = Number(match[1])
    const unit = (match[2] ?? '').toLowerCase()
    if (!Number.isFinite(amount)) continue
    if (unit === 'h' || unit.startsWith('hour') || unit.startsWith('hr') || unit === '小时') {
      durations.push(amount * 60 * 60 * 1000)
    } else if (unit === 'm' || unit.startsWith('min') || unit === '分钟' || unit === '分') {
      durations.push(amount * 60 * 1000)
    } else {
      durations.push(amount * 1000)
    }
  }

  return durations.filter((durationMs) => durationMs > 0)
}

function parsePomodoroCycle(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): ParsedPomodoroCycle {
  const durationParts = parseDurationPartsMs(text)
  const template = parsePomodoroTemplate(text, settings)

  return {
    durationMs: durationParts[0] ?? template?.durationMs ?? settings.defaultPomodoroFocusMs,
    breakDurationMs:
      durationParts[1] ?? template?.breakDurationMs ?? settings.defaultPomodoroBreakMs,
    pomodoroCycles: parsePomodoroCycles(text),
    ...parsePomodoroLongBreak(text),
    pomodoroMode: 'cycle'
  }
}

function parsePomodoroCycles(text: string): number | undefined {
  const match = text.match(
    /(?:^|[^\d])(?<cycles>\d{1,2})\s*(?:rounds?|cycles?|sets?|轮|次)(?:[^\d]|$)/i
  )
  const cycles = Number(match?.groups?.cycles)
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 12) return undefined
  return cycles
}

function parsePomodoroLongBreak(
  text: string
): Pick<ParsedPomodoroCycle, 'pomodoroLongBreakMs' | 'pomodoroLongBreakEvery'> {
  const durationMatch = text.match(
    /(?:long\s+break|longbreak|长休息|长间歇|长暂停)\s*(?<amount>\d+(?:\.\d+)?)\s*(?<unit>hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)/i
  )
  if (!durationMatch?.groups) return {}

  const amount = Number(durationMatch.groups.amount)
  const unit = durationMatch.groups.unit.toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) return {}

  const durationMs = parseDurationPartsMs(`${amount}${unit}`)[0] ?? 0
  if (durationMs < 60 * 1000 || durationMs > 60 * 60 * 1000) return {}

  const everyMatch = text.match(
    /(?:every|each|per|after|每|每隔)\s*(?<cycles>\d{1,2})\s*(?:rounds?|cycles?|sets?|轮|次)?/i
  )
  const every = Number(everyMatch?.groups?.cycles)
  if (!Number.isInteger(every) || every < 2 || every > 12) return {}

  return {
    pomodoroLongBreakMs: durationMs,
    pomodoroLongBreakEvery: every
  }
}

function parsePomodoroTemplate(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> | null {
  const customTemplate = parseCustomPomodoroTemplate(text, settings)
  if (customTemplate) return customTemplate

  if (
    settings.pomodoroTemplates.classic &&
    matchesKeyword(text, ['classic pomodoro', 'standard pomodoro', '经典番茄钟'])
  ) {
    return toPomodoroTemplate(25, 5)
  }
  if (
    settings.pomodoroTemplates.long &&
    matchesKeyword(text, ['long pomodoro', 'deep pomodoro', '长番茄钟'])
  ) {
    return toPomodoroTemplate(50, 10)
  }

  const customMatch = text.match(
    /(?:custom pomodoro|pomodoro custom|自定义番茄钟|番茄钟自定义|自定义番茄模板)[^\d]*(?<focus>\d{1,3})\s*[\/／]\s*(?<break>\d{1,2})(?:[^\d]|$)/
  )
  if (customMatch?.groups) {
    const focusMinutes = Number(customMatch.groups.focus)
    const breakMinutes = Number(customMatch.groups.break)
    if (isValidPomodoroTemplate(focusMinutes, breakMinutes)) {
      return toPomodoroTemplate(focusMinutes, breakMinutes)
    }
  }

  const match = text.match(/(?:^|[^\d])(?<focus>25|50)\s*[\/／]\s*(?<break>5|10)(?:[^\d]|$)/)
  if (!match?.groups) return null

  const focusMinutes = Number(match.groups.focus)
  const breakMinutes = Number(match.groups.break)
  if (focusMinutes === 25 && breakMinutes === 5 && settings.pomodoroTemplates.classic) {
    return toPomodoroTemplate(25, 5)
  }
  if (focusMinutes === 50 && breakMinutes === 10 && settings.pomodoroTemplates.long) {
    return toPomodoroTemplate(50, 10)
  }
  return null
}

function parseCustomPomodoroTemplate(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> | null {
  const customTemplate = settings.pomodoroTemplates.custom.find(
    (template) =>
      template.enabled &&
      [template.name, ...template.aliases].some((keyword) =>
        matchesPomodoroTemplateKeyword(text, keyword)
      )
  )
  if (!customTemplate) return null

  return toPomodoroTemplate(customTemplate.focusMinutes, customTemplate.breakMinutes)
}

function matchesPomodoroTemplateKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return false
  if (/[\u3400-\u9fff]/.test(normalizedKeyword)) {
    return text.includes(normalizedKeyword)
  }
  return new RegExp(`(?:^|\\s)${escapeRegExp(normalizedKeyword)}(?:\\s|$)`, 'i').test(text)
}

function toPomodoroTemplate(
  focusMinutes: number,
  breakMinutes: number
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> {
  return {
    durationMs: focusMinutes * 60 * 1000,
    breakDurationMs: breakMinutes * 60 * 1000
  }
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
