const {
  plugin,
  clipboard,
  permission,
  logger,
  TuffItemBuilder,
} = globalThis

const PLUGIN_NAME = 'touch-pomodoro-zen'
const FEATURE_ID = 'pomodoro-zen'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const STATE_FILE = 'pomodoro-state.json'
const MAX_HISTORY_DAYS = 90
const MIN_DURATION_SEC = 10
const MAX_DURATION_SEC = 4 * 60 * 60

const FOCUS_PRESETS = [
  {
    id: 'classic-25-5',
    title: 'Classic Pomodoro · 25 / 5',
    subtitle: '25m focus sprint followed by a 5m restorative break',
    focusSec: 25 * 60,
    breakSec: 5 * 60,
    label: 'Classic Pomodoro',
  },
  {
    id: 'deep-50-10',
    title: 'Deep Flow · 50 / 10',
    subtitle: '50m deep work block paired with a 10m decompression break',
    focusSec: 50 * 60,
    breakSec: 10 * 60,
    label: 'Deep Flow',
  },
  {
    id: 'sprint-15-3',
    title: 'Quick Sprint · 15 / 3',
    subtitle: '15m low-friction start to beat procrastination + 3m reset',
    focusSec: 15 * 60,
    breakSec: 3 * 60,
    label: 'Quick Sprint',
  },
]

const MICRO_BREAK_CARDS = [
  {
    id: 'eye-rest',
    name: '20-20-20 Eye Rest',
    durationSec: 20,
    summary: 'Look 20 ft (6 m) away for 20s and blink slowly 10 times',
    steps: [
      '1. Shift gaze to an object at least 20 feet (6 meters) away.',
      '2. Hold relaxed focus for 20 full seconds without squinting.',
      '3. Perform 10 slow, complete blinks to refresh tear film.',
      '4. Relax brow and jaw before returning to the screen.',
    ],
  },
  {
    id: 'hydrate',
    name: 'Hydrate & Posture Reset',
    durationSec: 60,
    summary: 'Drink a full glass of water, drop shoulders, align ears over shoulders',
    steps: [
      '1. Stand up and drink 200-300 ml of water.',
      '2. Roll shoulders up, back, and down away from your ears (3x).',
      '3. Tuck chin gently so ears align directly over shoulders.',
      '4. Unclench hands and shake out fingers for 10 seconds.',
    ],
  },
  {
    id: 'stretch',
    name: 'Desk Mobility Stretch',
    durationSec: 120,
    summary: 'Neck half-circles, seated thoracic twist, wrist flexor stretch & calf raises',
    steps: [
      '1. Slow neck half-circles left-to-right (30s, never force backwards).',
      '2. Interlace fingers, reach overhead and lengthen spine (20s).',
      '3. Extend each arm palm-up and gently stretch wrist flexors (30s).',
      '4. Stand and perform 15 slow calf raises to restore circulation (40s).',
    ],
  },
  {
    id: 'box-breathing',
    name: '4-4-4-4 Box Breathing',
    durationSec: 120,
    summary: 'Inhale 4s · Hold 4s · Exhale 4s · Hold 4s (4 calming cycles)',
    steps: [
      '1. Inhale quietly through the nose for 4 seconds.',
      '2. Hold breath gently with relaxed shoulders for 4 seconds.',
      '3. Exhale smoothly through mouth or nose for 4 seconds.',
      '4. Pause empty for 4 seconds. Repeat for 4-6 calm cycles.',
    ],
  },
]

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

let triggerGeneration = 0
let actionCounter = 0
let issuedActions = new Map()

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return String(query?.text ?? query?.query ?? '')
}

function clampDurationSec(seconds) {
  const num = Math.round(Number(seconds))
  if (!Number.isFinite(num))
    return 25 * 60
  return Math.max(MIN_DURATION_SEC, Math.min(MAX_DURATION_SEC, num))
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = n => String(n).padStart(2, '0')
  if (hours > 0)
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

function formatShortDuration(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds))
  if (safe < 60)
    return `${safe}s`
  const mins = Math.floor(safe / 60)
  const rem = safe % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

function renderProgressBar(ratio, width = 10) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0))
  const filled = Math.round(clamped * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

function formatLocalDateKey(timestampMs) {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDateKey(dateKey, deltaDays) {
  const parts = String(dateKey).split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n)))
    return dateKey
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + deltaDays)
  const shifted = new Date(utc)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function weekdayForDateKey(dateKey) {
  const parts = String(dateKey).split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n)))
    return ''
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()
  return WEEKDAY_LABELS[day] || ''
}

function createIdleSession() {
  return {
    status: 'idle',
    mode: 'focus',
    label: '',
    presetId: '',
    durationSec: 25 * 60,
    breakSec: 5 * 60,
    startedAtMs: null,
    endsAtMs: null,
    pausedRemainingSec: null,
  }
}

function createDefaultState() {
  return {
    active: createIdleSession(),
    history: {},
    longestStreak: 0,
    alertsEnabled: true,
  }
}

function sanitizeState(raw) {
  if (!raw)
    return createDefaultState()
  if (typeof raw === 'string') {
    try {
      return sanitizeState(JSON.parse(raw))
    }
    catch {
      return createDefaultState()
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw))
    return createDefaultState()

  const rawActive = raw.active && typeof raw.active === 'object' ? raw.active : {}
  const status = ['idle', 'running', 'paused'].includes(rawActive.status)
    ? rawActive.status
    : 'idle'
  const mode = rawActive.mode === 'break' ? 'break' : 'focus'
  const durationSec = clampDurationSec(rawActive.durationSec ?? 25 * 60)
  const breakSec = clampDurationSec(rawActive.breakSec ?? 5 * 60)

  const active = {
    status,
    mode,
    label: normalizeText(rawActive.label).slice(0, 64),
    presetId: normalizeText(rawActive.presetId).slice(0, 48),
    durationSec,
    breakSec,
    startedAtMs: Number.isFinite(rawActive.startedAtMs) ? Number(rawActive.startedAtMs) : null,
    endsAtMs: Number.isFinite(rawActive.endsAtMs) ? Number(rawActive.endsAtMs) : null,
    pausedRemainingSec: Number.isFinite(rawActive.pausedRemainingSec)
      ? Math.max(0, Math.min(durationSec, Math.round(Number(rawActive.pausedRemainingSec))))
      : null,
  }

  if (active.status === 'running' && !active.endsAtMs)
    active.status = 'idle'
  if (active.status === 'paused' && active.pausedRemainingSec === null)
    active.status = 'idle'

  const history = {}
  if (raw.history && typeof raw.history === 'object' && !Array.isArray(raw.history)) {
    const keys = Object.keys(raw.history)
      .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort()
      .slice(-MAX_HISTORY_DAYS)
    for (const dateKey of keys) {
      const entry = raw.history[dateKey]
      if (!entry || typeof entry !== 'object')
        continue
      const focusMinutes = Number.isFinite(entry.focusMinutes)
        ? Math.max(0, Math.min(1440, Math.round(Number(entry.focusMinutes))))
        : 0
      const sessions = Number.isFinite(entry.sessions)
        ? Math.max(0, Math.min(500, Math.round(Number(entry.sessions))))
        : 0
      if (focusMinutes > 0 || sessions > 0) {
        history[dateKey] = {
          focusMinutes,
          sessions,
          lastLabel: normalizeText(entry.lastLabel).slice(0, 64),
        }
      }
    }
  }

  const longestStreak = Number.isFinite(raw.longestStreak)
    ? Math.max(0, Math.round(Number(raw.longestStreak)))
    : 0
  const alertsEnabled = raw.alertsEnabled !== false

  return { active, history, longestStreak, alertsEnabled }
}

function computeTimerSnapshot(active, nowMs) {
  if (!active || active.status === 'idle') {
    return {
      status: 'idle',
      mode: 'focus',
      label: '',
      durationSec: 25 * 60,
      breakSec: 5 * 60,
      remainingSec: 0,
      elapsedSec: 0,
      progress: 0,
      isElapsedComplete: false,
    }
  }

  if (active.status === 'paused') {
    const remainingSec = Math.max(0, Math.min(active.durationSec, active.pausedRemainingSec ?? active.durationSec))
    const elapsedSec = Math.max(0, active.durationSec - remainingSec)
    return {
      status: 'paused',
      mode: active.mode,
      label: active.label || (active.mode === 'break' ? 'Micro-Break' : 'Focus'),
      durationSec: active.durationSec,
      breakSec: active.breakSec,
      remainingSec,
      elapsedSec,
      progress: active.durationSec > 0 ? elapsedSec / active.durationSec : 0,
      isElapsedComplete: false,
    }
  }

  const endsAtMs = active.endsAtMs ?? nowMs
  const remainingMs = Math.max(0, endsAtMs - nowMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const elapsedSec = Math.min(active.durationSec, Math.max(0, active.durationSec - remainingSec))
  const isElapsedComplete = nowMs >= endsAtMs

  return {
    status: isElapsedComplete ? 'completed' : 'running',
    mode: active.mode,
    label: active.label || (active.mode === 'break' ? 'Micro-Break' : 'Focus'),
    durationSec: active.durationSec,
    breakSec: active.breakSec,
    remainingSec,
    elapsedSec,
    progress: active.durationSec > 0 ? elapsedSec / active.durationSec : 1,
    isElapsedComplete,
  }
}

function computeHistoricalMaxStreak(history) {
  const activeDates = Object.keys(history)
    .filter(k => (history[k]?.focusMinutes ?? 0) > 0)
    .sort()
  if (!activeDates.length)
    return 0
  let maxRun = 1
  let run = 1
  for (let i = 1; i < activeDates.length; i += 1) {
    if (shiftDateKey(activeDates[i - 1], 1) === activeDates[i]) {
      run += 1
      if (run > maxRun)
        maxRun = run
    }
    else {
      run = 1
    }
  }
  return maxRun
}

function computeFocusStats(state, nowMs) {
  const todayKey = formatLocalDateKey(nowMs)
  const todayEntry = state.history[todayKey] || { focusMinutes: 0, sessions: 0, lastLabel: '' }

  const dailySeries = []
  let weeklyMinutes = 0
  let weeklySessions = 0
  let activeDays = 0

  for (let offset = -6; offset <= 0; offset += 1) {
    const key = shiftDateKey(todayKey, offset)
    const entry = state.history[key] || { focusMinutes: 0, sessions: 0 }
    weeklyMinutes += entry.focusMinutes
    weeklySessions += entry.sessions
    if (entry.focusMinutes > 0)
      activeDays += 1
    dailySeries.push({
      dateKey: key,
      weekday: weekdayForDateKey(key),
      focusMinutes: entry.focusMinutes,
      sessions: entry.sessions,
    })
  }

  let currentStreak = 0
  let cursorKey = todayEntry.focusMinutes > 0 ? todayKey : shiftDateKey(todayKey, -1)
  while ((state.history[cursorKey]?.focusMinutes ?? 0) > 0) {
    currentStreak += 1
    cursorKey = shiftDateKey(cursorKey, -1)
    if (currentStreak > MAX_HISTORY_DAYS)
      break
  }

  const longestStreak = Math.max(
    state.longestStreak || 0,
    currentStreak,
    computeHistoricalMaxStreak(state.history),
  )

  const weeklyLine = dailySeries
    .map(d => `${d.weekday} ${d.focusMinutes}m`)
    .join(' · ')

  const reportMarkdown = [
    `## Pomodoro Zen Focus Report (${todayKey})`,
    '',
    `- **Today**: ${todayEntry.focusMinutes} min (${todayEntry.sessions} session${todayEntry.sessions === 1 ? '' : 's'})`,
    `- **Last 7 Days**: ${weeklyMinutes} min across ${activeDays}/7 days (${weeklySessions} sessions)`,
    `- **Streak**: ${currentStreak} day(s) current · ${longestStreak} day(s) best`,
    '',
    '| Day | Date | Focus (min) | Sessions |',
    '| --- | --- | ---: | ---: |',
    ...dailySeries.map(d => `| ${d.weekday} | ${d.dateKey} | ${d.focusMinutes} | ${d.sessions} |`),
  ].join('\n')

  return {
    todayKey,
    todayMinutes: todayEntry.focusMinutes,
    todaySessions: todayEntry.sessions,
    weeklyMinutes,
    weeklySessions,
    activeDays,
    currentStreak,
    longestStreak,
    dailySeries,
    weeklyLine,
    reportMarkdown,
  }
}

function parseCustomSessionSpec(rawText) {
  const cleaned = normalizeText(rawText)
    .replace(/^(?:pomo|pomodoro|focus|zen|microbreak|番茄计时|专注计时)\s+/i, '')
    .trim()
  if (!cleaned)
    return null

  // Ratio format: "25/5 Ship PR" or "50/10 Architecture"
  const ratioMatch = cleaned.match(/^(\d{1,3})\s*\/\s*(\d{1,2})(?:\s+(\S.*))?$/)
  if (ratioMatch) {
    const focusMin = Number(ratioMatch[1])
    const breakMin = Number(ratioMatch[2])
    if (focusMin >= 1 && focusMin <= 240 && breakMin >= 1 && breakMin <= 60) {
      return {
        mode: 'focus',
        focusSec: clampDurationSec(focusMin * 60),
        breakSec: clampDurationSec(breakMin * 60),
        label: normalizeText(ratioMatch[3]) || `${focusMin}/${breakMin} Focus`,
      }
    }
  }

  // Break shorthand: "break 5m" or "break 90s"
  const breakDurMatch = cleaned.match(/^(?:break|rest)\s+(\d{1,3})(?:[ \t]*([smh]|sec|secs|min|mins|hr))?(?:\s+(\S.*))?$/i)
  if (breakDurMatch) {
    const amount = Number(breakDurMatch[1])
    const unit = (breakDurMatch[2] || 'm').toLowerCase()
    const mult = unit.startsWith('s') ? 1 : unit.startsWith('h') ? 3600 : 60
    if (amount >= 1) {
      return {
        mode: 'break',
        focusSec: clampDurationSec(amount * mult),
        breakSec: 5 * 60,
        label: normalizeText(breakDurMatch[3]) || 'Micro-Break',
      }
    }
  }

  // Custom focus duration + label: "15m Deep Work", "45 Write RFC", "90s Quick Review", "1h System Design"
  const durMatch = cleaned.match(/^(\d{1,3})(?:[ \t]*([smh]|sec|secs|min|mins|hr))?(?:\s+(\S.*))?$/i)
  if (durMatch) {
    const amount = Number(durMatch[1])
    const unit = (durMatch[2] || 'm').toLowerCase()
    const mult = unit.startsWith('s') ? 1 : unit.startsWith('h') ? 3600 : 60
    const totalSec = amount * mult
    if (totalSec >= MIN_DURATION_SEC && totalSec <= MAX_DURATION_SEC) {
      const autoBreakSec = totalSec >= 45 * 60 ? 10 * 60 : totalSec >= 20 * 60 ? 5 * 60 : 3 * 60
      return {
        mode: 'focus',
        focusSec: clampDurationSec(totalSec),
        breakSec: autoBreakSec,
        label: normalizeText(durMatch[3]) || 'Deep Work',
      }
    }
  }

  return null
}

function parseQueryIntent(rawQuery) {
  const cleaned = normalizeText(rawQuery)
    .replace(/^(?:pomo|pomodoro|focus|zen|microbreak|番茄计时|专注计时)\s+/i, '')
    .trim()
  if (!cleaned)
    return { view: 'dashboard', keyword: '', custom: null }

  const lower = cleaned.toLowerCase()
  const custom = parseCustomSessionSpec(cleaned)
  if (custom)
    return { view: 'custom', keyword: cleaned, custom }

  if (/^(?:break|rest|breathe|breathing|eye|hydrate|stretch|coach|微休息|休息)/.test(lower))
    return { view: 'breaks', keyword: lower, custom: null }

  if (/^(?:stats|stat|streak|week|report|summary|统计|打卡)/.test(lower))
    return { view: 'stats', keyword: lower, custom: null }

  if (/^(?:pause|resume|reset|stop|complete|done|finish|alert|notify)/.test(lower))
    return { view: 'control', keyword: lower, custom: null }

  return { view: 'dashboard', keyword: lower, custom: null }
}

function mapHostErrorReason(error, fallbackReason) {
  const code = error?.code
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return 'permission-denied'
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return 'permission-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    return 'capability-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT')
    return 'timeout'
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED')
    return 'cancelled'
  return fallbackReason
}

async function checkPermissionNonMutating(permissionId) {
  if (typeof permission?.check !== 'function')
    return null
  try {
    return (await permission.check(permissionId)) === true
  }
  catch {
    return null
  }
}

async function enforcePermissionGate(permissionId, deniedMessage) {
  if (typeof permission?.check !== 'function') {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'permission-sdk-unavailable',
        message: 'Permission verification SDK is unavailable',
      },
    }
  }

  let granted
  try {
    granted = await permission.check(permissionId)
  }
  catch {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'permission-check-failed',
        message: `Failed to verify ${permissionId} permission`,
      },
    }
  }

  if (granted !== true) {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'permission-denied',
        message: deniedMessage,
      },
    }
  }

  return { ok: true }
}

async function loadStateReadOnly() {
  const granted = await checkPermissionNonMutating('storage.plugin')
  if (granted === false)
    return { state: createDefaultState(), storageState: 'denied' }
  if (typeof plugin?.storage?.getFile !== 'function')
    return { state: createDefaultState(), storageState: 'unavailable' }
  try {
    const raw = await plugin.storage.getFile(STATE_FILE)
    return { state: sanitizeState(raw), storageState: 'ready' }
  }
  catch (error) {
    const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    return { state: createDefaultState(), storageState: denied ? 'denied' : 'unavailable' }
  }
}

async function loadAndSaveState(mutator) {
  const gate = await enforcePermissionGate(
    'storage.plugin',
    'Grant storage.plugin permission to persist Pomodoro timer & streak stats',
  )
  if (!gate.ok)
    return { ok: false, result: gate.result }

  if (typeof plugin?.storage?.getFile !== 'function' || typeof plugin?.storage?.setFile !== 'function') {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: 'Plugin storage capability is unavailable',
      },
    }
  }

  try {
    const current = sanitizeState(await plugin.storage.getFile(STATE_FILE))
    const mutation = mutator(current)
    if (mutation && mutation.abortResult)
      return { ok: false, result: mutation.abortResult }

    const nextState = sanitizeState(mutation?.nextState ?? current)
    await plugin.storage.setFile(STATE_FILE, nextState)
    return { ok: true, state: nextState, meta: mutation?.meta || {} }
  }
  catch (error) {
    logger?.warn?.('[touch-pomodoro-zen] Failed to persist timer state')
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: mapHostErrorReason(error, 'storage-write-failed'),
        message: 'Failed to persist Pomodoro state',
      },
    }
  }
}

function resolveNotificationBridge() {
  if (typeof plugin?.notification?.notify === 'function')
    return payload => plugin.notification.notify({ ...payload, channel: 'system' })
  if (typeof globalThis.notification?.notify === 'function')
    return payload => globalThis.notification.notify(payload)
  if (typeof globalThis.system?.notify === 'function')
    return payload => globalThis.system.notify(payload)
  return null
}

async function dispatchOptionalNotification(title, body) {
  const gate = await enforcePermissionGate(
    'system.notification',
    'Grant system.notification permission to send Pomodoro completion alerts',
  )
  if (!gate.ok)
    return { sent: false, blocked: gate.result }

  const sendFn = resolveNotificationBridge()
  if (!sendFn) {
    return {
      sent: false,
      blocked: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: 'Desktop notification bridge is unavailable in this host runtime',
      },
    }
  }

  try {
    await sendFn({ title, body, message: body })
    return { sent: true }
  }
  catch (error) {
    logger?.warn?.('[touch-pomodoro-zen] Notification delivery failed')
    return {
      sent: false,
      blocked: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: mapHostErrorReason(error, 'notification-failed'),
        message: 'Failed to send desktop notification',
      },
    }
  }
}

async function copyTextWithGate(text) {
  const gate = await enforcePermissionGate(
    'clipboard.write',
    'Grant clipboard.write permission to copy focus stats or micro-break guides',
  )
  if (!gate.ok)
    return gate.result

  if (typeof clipboard?.writeText !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: 'Clipboard capability is unavailable',
    }
  }

  try {
    await clipboard.writeText(String(text ?? ''))
    return {
      externalAction: true,
      success: true,
      status: 'copied',
      message: 'Copied to clipboard',
    }
  }
  catch (error) {
    logger?.warn?.('[touch-pomodoro-zen] Clipboard write failed')
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'clipboard-write-failed'),
      message: error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
        ? 'Missing clipboard.write permission'
        : 'Failed to copy to clipboard',
    }
  }
}

function registerAction(record) {
  actionCounter += 1
  const token = `pomo-${triggerGeneration}-${actionCounter}`
  issuedActions.set(token, { ...record, generation: triggerGeneration })
  return token
}

function buildInfoItem({ id, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: 'none',
    })
    .build()
}

function buildActionItem({ id, title, subtitle, actionId, actionLabel, payload, extraActions = [] }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: actionId,
    })
    .createAndAddAction(actionId, 'plugin', actionLabel || title, payload)

  for (const extra of extraActions)
    builder.createAndAddAction(extra.id, 'plugin', extra.label, extra.payload)

  return builder.build()
}

function formatMicroBreakGuide(card) {
  return [
    `## ${card.name} (${formatShortDuration(card.durationSec)})`,
    card.summary,
    '',
    ...card.steps,
  ].join('\n')
}

function buildMicroBreakItems(keyword = '') {
  const cards = MICRO_BREAK_CARDS.filter((card) => {
    if (!keyword || /^(?:break|breaks|rest|coach|微休息|休息)$/.test(keyword))
      return true
    return `${card.id} ${card.name} ${card.summary}`.toLowerCase().includes(keyword)
  })
  const list = cards.length ? cards : MICRO_BREAK_CARDS
  return list.map((card) => {
    const startToken = registerAction({
      kind: 'start-break',
      durationSec: card.durationSec,
      label: card.name,
      presetId: card.id,
    })
    const guideToken = registerAction({
      kind: 'copy-text',
      text: formatMicroBreakGuide(card),
    })
    return buildActionItem({
      id: `${FEATURE_ID}-break-${card.id}`,
      title: `Micro-Break · ${card.name} (${formatShortDuration(card.durationSec)})`,
      subtitle: card.summary,
      actionId: 'start-break',
      actionLabel: 'Start Micro-Break',
      payload: { token: startToken },
      extraActions: [
        { id: 'copy-guide', label: 'Copy Break Steps', payload: { token: guideToken } },
      ],
    })
  })
}

function buildActiveTimerItems(snapshot, stats, alertsEnabled, notifyPermitted) {
  const items = []
  const bar = renderProgressBar(snapshot.progress)
  const pct = Math.round(snapshot.progress * 100)

  if (snapshot.status === 'completed') {
    const completeToken = registerAction({ kind: 'complete-session' })
    const nextBreakToken = registerAction({ kind: 'complete-and-break' })
    const resetToken = registerAction({ kind: 'reset-timer' })
    const earnedMin = Math.max(1, Math.round(snapshot.durationSec / 60))

    items.push(buildActionItem({
      id: `${FEATURE_ID}-active-done`,
      title: snapshot.mode === 'focus'
        ? `Session Complete! Claim +${earnedMin}m "${snapshot.label}"`
        : `Break Complete! "${snapshot.label}"`,
      subtitle: `${bar} 100% · Enter to record completion${snapshot.mode === 'focus' ? ` (or start ${formatShortDuration(snapshot.breakSec)} break)` : ''}`,
      actionId: 'complete-session',
      actionLabel: 'Record Completion',
      payload: { token: completeToken },
      extraActions: [
        ...(snapshot.mode === 'focus'
          ? [{ id: 'complete-and-break', label: `Claim & Start ${formatShortDuration(snapshot.breakSec)} Break`, payload: { token: nextBreakToken } }]
          : []),
        { id: 'reset-timer', label: 'Discard & Reset', payload: { token: resetToken } },
      ],
    }))
    return items
  }

  if (snapshot.status === 'running') {
    const pauseToken = registerAction({ kind: 'pause-timer' })
    const completeToken = registerAction({ kind: 'complete-session' })
    const resetToken = registerAction({ kind: 'reset-timer' })
    const modeTag = snapshot.mode === 'break' ? 'Break' : 'Focus'

    items.push(buildActionItem({
      id: `${FEATURE_ID}-active-running`,
      title: `${modeTag} · ${formatClock(snapshot.remainingSec)} left · ${snapshot.label}`,
      subtitle: `${bar} ${pct}% · Enter to Pause · Today ${stats.todayMinutes}m · Streak ${stats.currentStreak}d`,
      actionId: 'pause-timer',
      actionLabel: 'Pause Timer',
      payload: { token: pauseToken },
      extraActions: [
        { id: 'complete-session', label: 'Finish & Log Now', payload: { token: completeToken } },
        { id: 'reset-timer', label: 'Reset Timer', payload: { token: resetToken } },
      ],
    }))
    items.push(buildActionItem({
      id: `${FEATURE_ID}-action-reset`,
      title: 'Reset Current Timer',
      subtitle: `Stop "${snapshot.label}" and return to idle`,
      actionId: 'reset-timer',
      actionLabel: 'Reset Timer',
      payload: { token: resetToken },
    }))
    return items
  }

  if (snapshot.status === 'paused') {
    const resumeToken = registerAction({ kind: 'resume-timer' })
    const completeToken = registerAction({ kind: 'complete-session' })
    const resetToken = registerAction({ kind: 'reset-timer' })

    items.push(buildActionItem({
      id: `${FEATURE_ID}-active-paused`,
      title: `Paused · ${formatClock(snapshot.remainingSec)} left · ${snapshot.label}`,
      subtitle: `${bar} ${pct}% · Enter to Resume · Alerts ${alertsEnabled && notifyPermitted !== false ? 'On' : 'Silent'}`,
      actionId: 'resume-timer',
      actionLabel: 'Resume Timer',
      payload: { token: resumeToken },
      extraActions: [
        { id: 'complete-session', label: 'Finish & Log Now', payload: { token: completeToken } },
        { id: 'reset-timer', label: 'Reset Timer', payload: { token: resetToken } },
      ],
    }))
    items.push(buildActionItem({
      id: `${FEATURE_ID}-action-reset`,
      title: 'Reset Paused Timer',
      subtitle: `Clear "${snapshot.label}" and pick a new focus preset`,
      actionId: 'reset-timer',
      actionLabel: 'Reset Timer',
      payload: { token: resetToken },
    }))
    return items
  }

  return items
}

function buildStatsItems(stats, alertsEnabled, notifyPermitted) {
  const copyToken = registerAction({ kind: 'copy-text', text: stats.reportMarkdown })
  const toggleToken = registerAction({ kind: 'toggle-alerts' })
  const testAlertToken = registerAction({ kind: 'test-alert' })
  const alertState = !alertsEnabled
    ? 'Off'
    : notifyPermitted === false
      ? 'Permission needed'
      : 'Enabled'

  return [
    buildActionItem({
      id: `${FEATURE_ID}-stats-summary`,
      title: `Today ${stats.todayMinutes}m (${stats.todaySessions} sessions) · 7d ${stats.weeklyMinutes}m · 🔥 ${stats.currentStreak}d streak`,
      subtitle: `Best streak ${stats.longestStreak}d · ${stats.weeklyLine} — Enter to copy report`,
      actionId: 'copy-stats',
      actionLabel: 'Copy Markdown Focus Report',
      payload: { token: copyToken },
      extraActions: [
        { id: 'toggle-alerts', label: alertsEnabled ? 'Disable Completion Alerts' : 'Enable Completion Alerts', payload: { token: toggleToken } },
        { id: 'test-alert', label: 'Send Test Alert', payload: { token: testAlertToken } },
      ],
    }),
    buildActionItem({
      id: `${FEATURE_ID}-alerts-control`,
      title: `Completion Alerts: ${alertState}`,
      subtitle: 'Enter to toggle desktop alert preference · Secondary action tests system.notification',
      actionId: 'toggle-alerts',
      actionLabel: 'Toggle Alerts',
      payload: { token: toggleToken },
      extraActions: [
        { id: 'test-alert', label: 'Send Test Alert', payload: { token: testAlertToken } },
      ],
    }),
  ]
}

function applyFocusMinutesToState(state, minutes, label, nowMs) {
  const todayKey = formatLocalDateKey(nowMs)
  const existing = state.history[todayKey] || { focusMinutes: 0, sessions: 0, lastLabel: '' }
  const nextHistory = {
    ...state.history,
    [todayKey]: {
      focusMinutes: Math.min(1440, existing.focusMinutes + minutes),
      sessions: existing.sessions + 1,
      lastLabel: label || existing.lastLabel || 'Focus',
    },
  }
  const trimmedKeys = Object.keys(nextHistory).sort().slice(-MAX_HISTORY_DAYS)
  const prunedHistory = {}
  for (const k of trimmedKeys)
    prunedHistory[k] = nextHistory[k]

  const nextState = {
    ...state,
    history: prunedHistory,
  }
  const stats = computeFocusStats(nextState, nowMs)
  nextState.longestStreak = stats.longestStreak
  return { nextState, stats }
}

async function publishItems(items, generation) {
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID, query) {
    if (featureId !== FEATURE_ID)
      return false

    const generation = ++triggerGeneration
    issuedActions = new Map()

    try {
      const nowMs = Date.now()
      const intent = parseQueryIntent(getQueryText(query))
      const [{ state, storageState }, notifyPermitted] = await Promise.all([
        loadStateReadOnly(),
        checkPermissionNonMutating('system.notification'),
      ])

      if (generation !== triggerGeneration)
        return true

      const snapshot = computeTimerSnapshot(state.active, nowMs)
      const stats = computeFocusStats(state, nowMs)
      const items = []

      if (storageState === 'denied') {
        items.push(buildInfoItem({
          id: `${FEATURE_ID}-storage-denied`,
          title: 'Pomodoro Storage Permission Required',
          subtitle: 'Grant storage.plugin permission to persist active timers, daily/weekly focus minutes & streaks',
        }))
      }

      if (intent.view === 'custom' && intent.custom) {
        const spec = intent.custom
        const actionKind = spec.mode === 'break' ? 'start-break' : 'start-focus'
        const token = registerAction({
          kind: actionKind,
          durationSec: spec.focusSec,
          breakSec: spec.breakSec,
          label: spec.label,
          presetId: 'custom',
        })
        items.push(buildActionItem({
          id: `${FEATURE_ID}-custom-start`,
          title: spec.mode === 'break'
            ? `Start ${formatShortDuration(spec.focusSec)} Break · ${spec.label}`
            : `Start ${formatShortDuration(spec.focusSec)} Focus · ${spec.label}`,
          subtitle: spec.mode === 'break'
            ? 'Wall-clock persisted micro-break timer'
            : `Paired with ${formatShortDuration(spec.breakSec)} break · Wall-clock persisted`,
          actionId: actionKind,
          actionLabel: 'Start Session',
          payload: { token },
        }))
        items.push(...buildActiveTimerItems(snapshot, stats, state.alertsEnabled, notifyPermitted))
      }
      else if (intent.view === 'breaks') {
        items.push(...buildMicroBreakItems(intent.keyword))
        items.push(...buildActiveTimerItems(snapshot, stats, state.alertsEnabled, notifyPermitted))
      }
      else if (intent.view === 'stats') {
        items.push(...buildStatsItems(stats, state.alertsEnabled, notifyPermitted))
        items.push(...buildActiveTimerItems(snapshot, stats, state.alertsEnabled, notifyPermitted))
      }
      else {
        items.push(...buildActiveTimerItems(snapshot, stats, state.alertsEnabled, notifyPermitted))

        if (intent.view === 'control' && snapshot.status === 'idle') {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-idle-hint`,
            title: 'No Active Timer Running',
            subtitle: 'Pick a preset below or type e.g. "pomo 15m Deep Work" to start focusing',
          }))
        }

        for (const preset of FOCUS_PRESETS) {
          const token = registerAction({
            kind: 'start-focus',
            durationSec: preset.focusSec,
            breakSec: preset.breakSec,
            label: preset.label,
            presetId: preset.id,
          })
          items.push(buildActionItem({
            id: `${FEATURE_ID}-preset-${preset.id}`,
            title: `Start ${preset.title}`,
            subtitle: preset.subtitle,
            actionId: 'start-focus',
            actionLabel: 'Start Focus',
            payload: { token },
          }))
        }

        items.push(...buildStatsItems(stats, state.alertsEnabled, notifyPermitted))
        items.push(...buildMicroBreakItems())
      }

      await publishItems(items, generation)
      return true
    }
    catch {
      if (generation !== triggerGeneration)
        return true
      logger?.error?.('[touch-pomodoro-zen] Failed to build timer view')
      try {
        await publishItems([
          buildInfoItem({
            id: `${FEATURE_ID}-error`,
            title: 'Pomodoro Zen Error',
            subtitle: 'Unable to load focus timer state right now',
          }),
        ], generation)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (
      !item
      || typeof item !== 'object'
      || item.source?.type !== 'plugin'
      || ![SOURCE_ID, PLUGIN_NAME].includes(item.source?.id)
      || (item.meta?.pluginName && item.meta.pluginName !== PLUGIN_NAME)
      || item.meta?.featureId !== FEATURE_ID
    ) {
      return
    }

    const actionId = normalizeText(
      context?.actionId || item.meta?.defaultAction || item.actions?.[0]?.id,
    )
    if (!actionId || actionId === 'none')
      return

    const action = Array.isArray(item.actions)
      ? item.actions.find(candidate => candidate?.id === actionId && candidate?.type === 'plugin')
      : null
    const token = normalizeText(action?.payload?.token)
    if (!token) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: 'Action payload is missing or invalid',
      }
    }

    const issued = issuedActions.get(token)
    if (!issued) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'stale-request',
        message: 'This timer action expired; re-open Pomodoro Zen',
      }
    }

    const nowMs = Date.now()

    if ((actionId === 'copy-stats' || actionId === 'copy-guide') && issued.kind === 'copy-text')
      return copyTextWithGate(issued.text)

    if (actionId === 'test-alert' && issued.kind === 'test-alert') {
      const delivery = await dispatchOptionalNotification(
        'Pomodoro Zen',
        'Focus completion alerts are active and ready.',
      )
      if (!delivery.sent)
        return delivery.blocked
      return {
        externalAction: true,
        success: true,
        status: 'notified',
        message: 'Test completion alert sent',
      }
    }

    if (actionId === 'toggle-alerts' && issued.kind === 'toggle-alerts') {
      const saved = await loadAndSaveState(state => ({
        nextState: { ...state, alertsEnabled: !state.alertsEnabled },
      }))
      if (!saved.ok)
        return saved.result
      return {
        externalAction: true,
        success: true,
        status: 'updated',
        message: saved.state.alertsEnabled ? 'Completion alerts enabled' : 'Completion alerts muted',
      }
    }

    if (actionId === 'start-focus' && issued.kind === 'start-focus') {
      const durationSec = clampDurationSec(issued.durationSec)
      const breakSec = clampDurationSec(issued.breakSec ?? 5 * 60)
      const label = normalizeText(issued.label) || 'Focus'

      const saved = await loadAndSaveState((state) => {
        let baseState = state
        // Auto-credit any previously elapsed completed focus session before starting the next
        const prevSnap = computeTimerSnapshot(state.active, nowMs)
        if (prevSnap.status === 'completed' && prevSnap.mode === 'focus') {
          const earned = Math.max(1, Math.round(prevSnap.durationSec / 60))
          baseState = applyFocusMinutesToState(state, earned, prevSnap.label, nowMs).nextState
        }
        return {
          nextState: {
            ...baseState,
            active: {
              status: 'running',
              mode: 'focus',
              label,
              presetId: issued.presetId || 'custom',
              durationSec,
              breakSec,
              startedAtMs: nowMs,
              endsAtMs: nowMs + (durationSec * 1000),
              pausedRemainingSec: null,
            },
          },
        }
      })
      if (!saved.ok)
        return saved.result

      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: `Started ${formatShortDuration(durationSec)} focus: ${label}`,
      }
    }

    if (actionId === 'start-break' && issued.kind === 'start-break') {
      const durationSec = clampDurationSec(issued.durationSec)
      const label = normalizeText(issued.label) || 'Micro-Break'

      const saved = await loadAndSaveState(state => ({
        nextState: {
          ...state,
          active: {
            status: 'running',
            mode: 'break',
            label,
            presetId: issued.presetId || 'micro-break',
            durationSec,
            breakSec: durationSec,
            startedAtMs: nowMs,
            endsAtMs: nowMs + (durationSec * 1000),
            pausedRemainingSec: null,
          },
        },
      }))
      if (!saved.ok)
        return saved.result

      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: `Started ${formatShortDuration(durationSec)} break: ${label}`,
      }
    }

    if (actionId === 'pause-timer' && issued.kind === 'pause-timer') {
      const saved = await loadAndSaveState((state) => {
        const snap = computeTimerSnapshot(state.active, nowMs)
        if (snap.status !== 'running') {
          return {
            abortResult: {
              externalAction: true,
              success: false,
              status: 'blocked',
              reason: 'timer-not-running',
              message: 'Timer is not currently running',
            },
          }
        }
        return {
          nextState: {
            ...state,
            active: {
              ...state.active,
              status: 'paused',
              endsAtMs: null,
              pausedRemainingSec: snap.remainingSec,
            },
          },
          meta: { remainingSec: snap.remainingSec, label: snap.label },
        }
      })
      if (!saved.ok)
        return saved.result

      return {
        externalAction: true,
        success: true,
        status: 'paused',
        message: `Paused "${saved.meta.label}" with ${formatClock(saved.meta.remainingSec)} left`,
      }
    }

    if (actionId === 'resume-timer' && issued.kind === 'resume-timer') {
      const saved = await loadAndSaveState((state) => {
        if (state.active.status !== 'paused' || !state.active.pausedRemainingSec) {
          return {
            abortResult: {
              externalAction: true,
              success: false,
              status: 'blocked',
              reason: 'timer-not-paused',
              message: 'No paused timer to resume',
            },
          }
        }
        const remSec = state.active.pausedRemainingSec
        return {
          nextState: {
            ...state,
            active: {
              ...state.active,
              status: 'running',
              endsAtMs: nowMs + (remSec * 1000),
              pausedRemainingSec: null,
            },
          },
          meta: { remainingSec: remSec, label: state.active.label || 'Focus' },
        }
      })
      if (!saved.ok)
        return saved.result

      return {
        externalAction: true,
        success: true,
        status: 'resumed',
        message: `Resumed "${saved.meta.label}" (${formatClock(saved.meta.remainingSec)} left)`,
      }
    }

    if (actionId === 'reset-timer' && issued.kind === 'reset-timer') {
      const saved = await loadAndSaveState(state => ({
        nextState: {
          ...state,
          active: createIdleSession(),
        },
      }))
      if (!saved.ok)
        return saved.result

      return {
        externalAction: true,
        success: true,
        status: 'reset',
        message: 'Pomodoro timer reset to idle',
      }
    }

    if (
      (actionId === 'complete-session' && issued.kind === 'complete-session')
      || (actionId === 'complete-and-break' && issued.kind === 'complete-and-break')
    ) {
      const startFollowupBreak = actionId === 'complete-and-break'
      const saved = await loadAndSaveState((state) => {
        const snap = computeTimerSnapshot(state.active, nowMs)
        if (snap.status === 'idle') {
          return {
            abortResult: {
              externalAction: true,
              success: false,
              status: 'blocked',
              reason: 'timer-not-active',
              message: 'No active session to complete',
            },
          }
        }

        let updatedState = state
        let earnedMinutes = 0
        if (snap.mode === 'focus') {
          const basisSec = snap.isElapsedComplete ? snap.durationSec : Math.max(60, snap.elapsedSec)
          earnedMinutes = Math.max(1, Math.round(basisSec / 60))
          updatedState = applyFocusMinutesToState(state, earnedMinutes, snap.label, nowMs).nextState
        }

        const nextActive = startFollowupBreak && snap.mode === 'focus'
          ? {
              status: 'running',
              mode: 'break',
              label: 'Restorative Break',
              presetId: 'auto-break',
              durationSec: snap.breakSec,
              breakSec: snap.breakSec,
              startedAtMs: nowMs,
              endsAtMs: nowMs + (snap.breakSec * 1000),
              pausedRemainingSec: null,
            }
          : createIdleSession()

        return {
          nextState: { ...updatedState, active: nextActive },
          meta: {
            mode: snap.mode,
            label: snap.label,
            earnedMinutes,
            breakSec: snap.breakSec,
            alertsEnabled: updatedState.alertsEnabled,
          },
        }
      })
      if (!saved.ok)
        return saved.result

      let alertNote = ''
      if (saved.meta.alertsEnabled) {
        const alertTitle = saved.meta.mode === 'focus' ? 'Focus Session Complete' : 'Micro-Break Complete'
        const alertBody = saved.meta.mode === 'focus'
          ? `Logged +${saved.meta.earnedMinutes}m for "${saved.meta.label}". Time for a short break.`
          : `Break "${saved.meta.label}" finished. Ready for your next focus sprint.`
        const delivery = await dispatchOptionalNotification(alertTitle, alertBody)
        if (delivery.sent)
          alertNote = ' · Alert sent'
      }

      if (saved.meta.mode === 'focus') {
        const breakSuffix = startFollowupBreak ? ` & started ${formatShortDuration(saved.meta.breakSec)} break` : ''
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          message: `Logged +${saved.meta.earnedMinutes}m "${saved.meta.label}"${breakSuffix}${alertNote}`,
        }
      }

      return {
        externalAction: true,
        success: true,
        status: 'completed',
        message: `Finished break "${saved.meta.label}"${alertNote}`,
      }
    }

    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'invalid-action',
      message: 'Unsupported Pomodoro Zen action',
    }
  },

  onDestroy() {
    triggerGeneration += 1
    issuedActions = new Map()
  },
}

module.exports = pluginLifecycle
