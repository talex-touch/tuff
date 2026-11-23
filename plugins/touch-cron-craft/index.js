const PLUGIN_NAME = 'touch-cron-craft'
const FEATURE_ID = 'cron-craft'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }

const ACTION_COPY_CRON = 'copy-cron'
const ACTION_COPY_CRONTAB = 'copy-crontab'
const ACTION_COPY_GHA = 'copy-gha'
const ACTION_COPY_HUMAN = 'copy-human'
const ACTION_COPY_RUNS = 'copy-runs'
const ACTION_COPY_RUN_SINGLE = 'copy-run-single'

const MAX_SEARCH_YEARS = 8
const MAX_SEARCH_STEPS = 80000
const DEFAULT_RUN_COUNT = 10

const TRIGGER_PREFIXES = [
  'cron-craft',
  'crontab',
  'cron',
  '定时表达式',
  '定时任务',
  '计划任务',
]

const CRON_ALIASES = {
  '@yearly': { expr: '0 0 1 1 *', en: 'Once a year on Jan 1 at 00:00', zh: '每年 1 月 1 日 00:00' },
  '@annually': { expr: '0 0 1 1 *', en: 'Once a year on Jan 1 at 00:00', zh: '每年 1 月 1 日 00:00' },
  '@monthly': { expr: '0 0 1 * *', en: 'Once a month on day 1 at 00:00', zh: '每月 1 日 00:00' },
  '@weekly': { expr: '0 0 * * 0', en: 'Once a week on Sunday at 00:00', zh: '每周日 00:00' },
  '@daily': { expr: '0 0 * * *', en: 'Every day at 00:00', zh: '每天 00:00' },
  '@midnight': { expr: '0 0 * * *', en: 'Every day at 00:00', zh: '每天 00:00' },
  '@hourly': { expr: '0 * * * *', en: 'Every hour at minute 00', zh: '每小时整点 (:00)' },
}

const MONTH_NAMES = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const MONTH_LABELS_EN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LABELS_ZH = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const DOW_NAMES = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

const DOW_LABELS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_LABELS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const CRON_PRESETS = [
  { id: 'every-minute', expr: '* * * * *', title: 'Every Minute', zh: '每分钟执行', tags: ['minute', 'frequent', '每分钟'] },
  { id: 'every-5m', expr: '*/5 * * * *', title: 'Every 5 Minutes', zh: '每 5 分钟执行', tags: ['5m', 'healthcheck', '每5分钟'] },
  { id: 'every-15m', expr: '*/15 * * * *', title: 'Every 15 Minutes', zh: '每 15 分钟执行', tags: ['15m', 'quarter', '每15分钟'] },
  { id: 'hourly', expr: '0 * * * *', title: 'Hourly (@hourly)', zh: '每小时整点', tags: ['hourly', 'hour', '每小时'] },
  { id: 'every-6h', expr: '0 */6 * * *', title: 'Every 6 Hours', zh: '每 6 小时执行', tags: ['6h', 'sync', '每6小时'] },
  { id: 'daily-midnight', expr: '0 0 * * *', title: 'Daily at Midnight (@daily)', zh: '每天凌晨 00:00', tags: ['daily', 'midnight', 'backup', '每天', '凌晨'] },
  { id: 'daily-9am', expr: '0 9 * * *', title: 'Daily at 09:00', zh: '每天早上 09:00', tags: ['daily', 'morning', '每天', '早上'] },
  { id: 'weekdays-9am', expr: '0 9 * * 1-5', title: 'Weekdays at 09:00', zh: '工作日早上 09:00', tags: ['weekday', 'workday', 'standup', '工作日'] },
  { id: 'weekdays-biz-30m', expr: '*/30 9-18 * * 1-5', title: 'Every 30m Business Hours', zh: '工作日 09:00-18:59 每 30 分钟', tags: ['business', 'workday', '工作日'] },
  { id: 'twice-daily', expr: '0 8,20 * * *', title: 'Twice Daily (08:00 & 20:00)', zh: '每天 08:00 与 20:00', tags: ['twice', 'daily', '两次'] },
  { id: 'weekends-10am', expr: '0 10 * * 0,6', title: 'Weekends at 10:00', zh: '每周末 10:00', tags: ['weekend', '周末'] },
  { id: 'weekly-mon', expr: '0 9 * * 1', title: 'Weekly Monday 09:00', zh: '每周一 09:00', tags: ['weekly', 'monday', 'report', '每周一'] },
  { id: 'monthly-1st', expr: '0 0 1 * *', title: 'Monthly 1st (@monthly)', zh: '每月 1 日 00:00', tags: ['monthly', 'billing', '每月'] },
  { id: 'bimonthly', expr: '0 9 1,15 * *', title: '1st & 15th at 09:00', zh: '每月 1 日与 15 日 09:00', tags: ['payroll', 'bimonthly', '半月'] },
  { id: 'quarterly', expr: '0 0 1 1,4,7,10 *', title: 'Quarterly (Jan/Apr/Jul/Oct 1st)', zh: '每季度首日 00:00', tags: ['quarterly', '季度'] },
  { id: 'yearly', expr: '0 0 1 1 *', title: 'Yearly Jan 1st (@yearly)', zh: '每年 1 月 1 日 00:00', tags: ['yearly', 'annual', '每年'] },
]

let triggerGeneration = 0

function getPlugin() {
  return globalThis.plugin
}

function getClipboard() {
  return globalThis.clipboard
}

function getPermission() {
  return globalThis.permission
}

function getLogger() {
  return globalThis.logger
}

function getItemBuilder() {
  return globalThis.TuffItemBuilder
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function pad2(num) {
  return String(num).padStart(2, '0')
}

function getQueryText(query) {
  if (typeof query === 'string') {
    return query
  }
  return query?.text ?? ''
}

function getReferenceDate(query) {
  if (query && typeof query === 'object' && query.now !== undefined) {
    const candidate = query.now instanceof Date ? query.now : new Date(query.now)
    if (!Number.isNaN(candidate.getTime())) {
      return candidate
    }
  }
  return new Date()
}

function stripTriggerPrefix(rawInput) {
  const trimmed = normalizeText(rawInput)
  if (!trimmed) {
    return ''
  }
  const lower = trimmed.toLowerCase()
  for (const prefix of TRIGGER_PREFIXES) {
    const lowerPrefix = prefix.toLowerCase()
    if (lower === lowerPrefix) {
      return ''
    }
    if (lower.startsWith(`${lowerPrefix} `) || lower.startsWith(`${lowerPrefix}:`)) {
      return trimmed.slice(prefix.length + 1).trim()
    }
  }
  return trimmed
}

function extractTimezonePreference(input) {
  let text = normalizeText(input)
  let preferUtc = false

  if (/^(?:--utc|utc)\s+/i.test(text)) {
    preferUtc = true
    text = text.replace(/^(?:--utc|utc)\s+/i, '').trim()
  }
  else if (/\s+(?:--utc|utc)$/i.test(text)) {
    preferUtc = true
    text = text.replace(/\s+(?:--utc|utc)$/i, '').trim()
  }
  else if (/^(?:--local|local)\s+/i.test(text)) {
    text = text.replace(/^(?:--local|local)\s+/i, '').trim()
  }
  else if (/\s+(?:--local|local)$/i.test(text)) {
    text = text.replace(/\s+(?:--local|local)$/i, '').trim()
  }

  return { text, preferUtc }
}

function parseFieldAtom(rawToken, min, max, aliasMap, isDow) {
  const token = rawToken.trim().toLowerCase()
  if (!token) {
    return { ok: false, error: 'Empty token' }
  }
  if (aliasMap && Object.prototype.hasOwnProperty.call(aliasMap, token)) {
    return { ok: true, value: aliasMap[token] }
  }
  if (!/^\d+$/.test(token)) {
    return { ok: false, error: `Invalid value "${rawToken}"` }
  }
  const value = Number.parseInt(token, 10)
  const upperBound = isDow ? 7 : max
  if (value < min || value > upperBound) {
    return { ok: false, error: `Value ${value} out of range (${min}-${upperBound})` }
  }
  return { ok: true, value }
}

function parseCronField(rawField, { name, min, max, aliasMap = null, isDow = false }) {
  const field = normalizeText(rawField)
  if (!field) {
    return { ok: false, error: `Missing ${name} field` }
  }

  const values = new Set()
  const parts = field.split(',')

  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) {
      return { ok: false, error: `Empty list entry in ${name} field` }
    }

    const slashSegments = part.split('/')
    if (slashSegments.length > 2) {
      return { ok: false, error: `Invalid step syntax "${part}" in ${name} field` }
    }

    const rangeExpr = slashSegments[0]
    let step = 1
    if (slashSegments.length === 2) {
      const rawStep = slashSegments[1].trim()
      if (!/^\d+$/.test(rawStep)) {
        return { ok: false, error: `Invalid step "${rawStep}" in ${name} field` }
      }
      step = Number.parseInt(rawStep, 10)
      if (step <= 0 || step > max - min + 1) {
        return { ok: false, error: `Step ${step} out of range in ${name} field` }
      }
    }

    if (rangeExpr === '*') {
      for (let v = min; v <= max; v += step) {
        values.add(isDow && v === 7 ? 0 : v)
      }
      continue
    }

    if (rangeExpr.includes('-')) {
      const bounds = rangeExpr.split('-')
      if (bounds.length !== 2) {
        return { ok: false, error: `Invalid range "${rangeExpr}" in ${name} field` }
      }
      const startParsed = parseFieldAtom(bounds[0], min, max, aliasMap, isDow)
      const endParsed = parseFieldAtom(bounds[1], min, max, aliasMap, isDow)
      if (!startParsed.ok) {
        return { ok: false, error: `${name}: ${startParsed.error}` }
      }
      if (!endParsed.ok) {
        return { ok: false, error: `${name}: ${endParsed.error}` }
      }

      let startVal = startParsed.value
      let endVal = endParsed.value
      // Allow FRI-SUN (5-0) or SAT-SUN (6-0) as 5-7 / 6-7
      if (isDow && endVal === 0 && startVal > 0 && startVal <= 6) {
        endVal = 7
      }
      if (startVal > endVal) {
        return { ok: false, error: `${name}: range start ${startVal} > end ${endVal}` }
      }
      for (let v = startVal; v <= endVal; v += step) {
        values.add(isDow && v === 7 ? 0 : v)
      }
      continue
    }

    const single = parseFieldAtom(rangeExpr, min, max, aliasMap, isDow)
    if (!single.ok) {
      return { ok: false, error: `${name}: ${single.error}` }
    }

    if (slashSegments.length === 2) {
      const startVal = isDow && single.value === 7 ? 0 : single.value
      for (let v = startVal; v <= max; v += step) {
        values.add(isDow && v === 7 ? 0 : v)
      }
    }
    else {
      values.add(isDow && single.value === 7 ? 0 : single.value)
    }
  }

  const sorted = Array.from(values).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return { ok: false, error: `${name} field resolved to no values` }
  }

  return {
    ok: true,
    raw: field,
    values: sorted,
    set: values,
    isWildcard: field === '*',
  }
}

function parseCronExpression(rawExpr) {
  const trimmed = normalizeText(rawExpr)
  if (!trimmed) {
    return { ok: false, error: 'Empty cron expression' }
  }

  const lower = trimmed.toLowerCase()
  if (lower === '@reboot') {
    return {
      ok: true,
      isReboot: true,
      alias: '@reboot',
      expression: '@reboot',
    }
  }

  let alias = null
  let expr = trimmed
  if (Object.prototype.hasOwnProperty.call(CRON_ALIASES, lower)) {
    alias = lower
    expr = CRON_ALIASES[lower].expr
  }

  const fields = expr.split(/\s+/)
  if (fields.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    }
  }

  const minute = parseCronField(fields[0], { name: 'minute', min: 0, max: 59 })
  if (!minute.ok) {
    return minute
  }
  const hour = parseCronField(fields[1], { name: 'hour', min: 0, max: 23 })
  if (!hour.ok) {
    return hour
  }
  const dom = parseCronField(fields[2], { name: 'day-of-month', min: 1, max: 31 })
  if (!dom.ok) {
    return dom
  }
  const month = parseCronField(fields[3], { name: 'month', min: 1, max: 12, aliasMap: MONTH_NAMES })
  if (!month.ok) {
    return month
  }
  const dow = parseCronField(fields[4], { name: 'day-of-week', min: 0, max: 6, aliasMap: DOW_NAMES, isDow: true })
  if (!dow.ok) {
    return dow
  }

  return {
    ok: true,
    isReboot: false,
    alias,
    expression: fields.join(' '),
    fields: { minute, hour, dom, month, dow },
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]
}

function nextGreater(sortedValues, current) {
  for (let i = 0; i < sortedValues.length; i += 1) {
    if (sortedValues[i] > current) {
      return sortedValues[i]
    }
  }
  return null
}

function computeNextRuns(parsed, fromDate, count = DEFAULT_RUN_COUNT, mode = 'local') {
  if (!parsed.ok || parsed.isReboot) {
    return []
  }
  const { minute, hour, dom, month, dow } = parsed.fields
  const useUtc = mode === 'utc'

  // Start at next whole minute strictly after fromDate
  const startMs = Math.floor(fromDate.getTime() / 60000) * 60000 + 60000
  const start = new Date(startMs)

  let year = useUtc ? start.getUTCFullYear() : start.getFullYear()
  let mon = (useUtc ? start.getUTCMonth() : start.getMonth()) + 1
  let day = useUtc ? start.getUTCDate() : start.getDate()
  let hr = useUtc ? start.getUTCHours() : start.getHours()
  let min = useUtc ? start.getUTCMinutes() : start.getMinutes()

  const minMonth = month.values[0]
  const minHour = hour.values[0]
  const minMinute = minute.values[0]
  const maxYear = year + MAX_SEARCH_YEARS

  const results = []
  let steps = 0

  while (results.length < count && year <= maxYear && steps < MAX_SEARCH_STEPS) {
    steps += 1

    if (!month.set.has(mon)) {
      const nextMon = nextGreater(month.values, mon)
      if (nextMon !== null) {
        mon = nextMon
      }
      else {
        year += 1
        mon = minMonth
      }
      day = 1
      hr = minHour
      min = minMinute
      continue
    }

    const dim = daysInMonth(year, mon)
    if (day > dim) {
      mon += 1
      if (mon > 12) {
        year += 1
        mon = 1
      }
      day = 1
      hr = minHour
      min = minMinute
      continue
    }

    const weekday = useUtc
      ? new Date(Date.UTC(year, mon - 1, day)).getUTCDay()
      : new Date(year, mon - 1, day).getDay()

    const domMatches = dom.set.has(day)
    const dowMatches = dow.set.has(weekday)
    let dayOk
    if (dom.isWildcard && dow.isWildcard) {
      dayOk = true
    }
    else if (dom.isWildcard) {
      dayOk = dowMatches
    }
    else if (dow.isWildcard) {
      dayOk = domMatches
    }
    else {
      // Standard Vixie cron: union when both DOM and DOW are restricted
      dayOk = domMatches || dowMatches
    }

    if (!dayOk) {
      day += 1
      hr = minHour
      min = minMinute
      continue
    }

    if (!hour.set.has(hr)) {
      const nextHr = nextGreater(hour.values, hr)
      if (nextHr !== null) {
        hr = nextHr
        min = minMinute
      }
      else {
        day += 1
        hr = minHour
        min = minMinute
      }
      continue
    }

    if (!minute.set.has(min)) {
      const nextMin = nextGreater(minute.values, min)
      if (nextMin !== null) {
        min = nextMin
      }
      else {
        hr += 1
        if (hr > 23) {
          day += 1
          hr = minHour
        }
        min = minMinute
      }
      continue
    }

    const candidate = useUtc
      ? new Date(Date.UTC(year, mon - 1, day, hr, min, 0, 0))
      : new Date(year, mon - 1, day, hr, min, 0, 0)

    const validLocalMatch = useUtc
      || (
        candidate.getFullYear() === year
        && candidate.getMonth() + 1 === mon
        && candidate.getDate() === day
        && candidate.getHours() === hr
        && candidate.getMinutes() === min
      )

    if (validLocalMatch && candidate.getTime() >= startMs) {
      results.push(candidate)
    }

    const nextMin = nextGreater(minute.values, min)
    if (nextMin !== null) {
      min = nextMin
    }
    else {
      hr += 1
      if (hr > 23) {
        day += 1
        hr = minHour
      }
      min = minMinute
    }
  }

  return results
}

function formatRunDate(date, mode = 'local') {
  if (mode === 'utc') {
    const y = date.getUTCFullYear()
    const m = pad2(date.getUTCMonth() + 1)
    const d = pad2(date.getUTCDate())
    const h = pad2(date.getUTCHours())
    const min = pad2(date.getUTCMinutes())
    const w = DOW_SHORT_EN[date.getUTCDay()]
    return `${y}-${m}-${d} ${h}:${min} UTC (${w})`
  }
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const h = pad2(date.getHours())
  const min = pad2(date.getMinutes())
  const w = DOW_SHORT_EN[date.getDay()]
  return `${y}-${m}-${d} ${h}:${min} (${w})`
}

function formatRelativeDelta(targetDate, fromDate) {
  const diffMin = Math.max(0, Math.round((targetDate.getTime() - fromDate.getTime()) / 60000))
  if (diffMin < 1) {
    return 'in <1m'
  }
  if (diffMin < 60) {
    return `in ${diffMin}m`
  }
  const totalHours = Math.floor(diffMin / 60)
  const remMin = diffMin % 60
  if (totalHours < 24) {
    return remMin > 0 ? `in ${totalHours}h ${remMin}m` : `in ${totalHours}h`
  }
  const days = Math.floor(totalHours / 24)
  const remHours = totalHours % 24
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`
}

function describeValuesList(values, labelFn, sepEn = ', ', sepZh = '、') {
  const labels = values.map(labelFn)
  return {
    en: labels.join(sepEn),
    zh: labels.join(sepZh),
  }
}

function describeDow(dow) {
  if (dow.isWildcard) {
    return { en: '', zh: '' }
  }
  const vals = dow.values
  if (vals.length === 5 && vals.join(',') === '1,2,3,4,5') {
    return { en: 'Monday through Friday', zh: '周一至周五（工作日）' }
  }
  if (vals.length === 2 && vals.join(',') === '0,6') {
    return { en: 'weekends (Sat & Sun)', zh: '周末（周六、周日）' }
  }
  const en = vals.map(v => DOW_LABELS_EN[v]).join(', ')
  const zh = vals.map(v => DOW_LABELS_ZH[v]).join('、')
  return { en: `on ${en}`, zh: `每${zh}` }
}

function describeDom(dom) {
  if (dom.isWildcard) {
    return { en: '', zh: '' }
  }
  const stepMatch = /^\*\/(\d+)$/.exec(dom.raw)
  if (stepMatch) {
    return {
      en: `every ${stepMatch[1]} days`,
      zh: `每 ${stepMatch[1]} 天`,
    }
  }
  return {
    en: `on day ${dom.values.join(', ')} of the month`,
    zh: `每月 ${dom.values.join('、')} 日`,
  }
}

function describeMonth(month) {
  if (month.isWildcard) {
    return { en: '', zh: '' }
  }
  const list = describeValuesList(month.values, v => MONTH_LABELS_EN[v])
  const listZh = month.values.map(v => MONTH_LABELS_ZH[v]).join('、')
  return {
    en: `in ${list.en}`,
    zh: `在 ${listZh}`,
  }
}

function humanizeCron(parsed) {
  if (!parsed.ok) {
    return { en: parsed.error, zh: parsed.error }
  }
  if (parsed.isReboot) {
    return {
      en: 'Run once at system startup (@reboot)',
      zh: '系统启动时执行一次（@reboot）',
    }
  }

  const { minute, hour, dom, month, dow } = parsed.fields
  const enParts = []
  const zhParts = []

  // Time part (minute + hour)
  const minStep = /^\*\/(\d+)$/.exec(minute.raw)
  const hourStep = /^\*\/(\d+)$/.exec(hour.raw)
  const hourRange = /^(\d+)-(\d+)$/.exec(hour.raw)

  if (minute.isWildcard && hour.isWildcard) {
    enParts.push('Every minute')
    zhParts.push('每分钟')
  }
  else if (minStep && hour.isWildcard) {
    enParts.push(`Every ${minStep[1]} minutes`)
    zhParts.push(`每 ${minStep[1]} 分钟`)
  }
  else if (minStep && hourRange) {
    const h1 = pad2(Number.parseInt(hourRange[1], 10))
    const h2 = pad2(Number.parseInt(hourRange[2], 10))
    enParts.push(`Every ${minStep[1]} minutes, between ${h1}:00 and ${h2}:59`)
    zhParts.push(`每 ${minStep[1]} 分钟（${h1}:00–${h2}:59）`)
  }
  else if (hourStep && minute.values.length === 1) {
    const m = pad2(minute.values[0])
    enParts.push(`Every ${hourStep[1]} hours at :${m}`)
    zhParts.push(`每 ${hourStep[1]} 小时的 :${m} 分`)
  }
  else if (hour.isWildcard && minute.values.length === 1) {
    const m = pad2(minute.values[0])
    enParts.push(m === '00' ? 'Every hour on the hour' : `Every hour at minute :${m}`)
    zhParts.push(m === '00' ? '每小时整点' : `每小时第 ${minute.values[0]} 分钟`)
  }
  else if (hour.values.length <= 4 && minute.values.length === 1) {
    const times = hour.values.map(h => `${pad2(h)}:${pad2(minute.values[0])}`)
    enParts.push(`At ${times.join(', ')}`)
    zhParts.push(`${times.join('、')}`)
  }
  else if (hour.values.length === 1 && minute.values.length <= 4) {
    const times = minute.values.map(m => `${pad2(hour.values[0])}:${pad2(m)}`)
    enParts.push(`At ${times.join(', ')}`)
    zhParts.push(`${times.join('、')}`)
  }
  else {
    const minText = minute.isWildcard ? 'every minute' : `minute ${minute.raw}`
    const hrText = hour.isWildcard ? 'every hour' : `hour ${hour.raw}`
    enParts.push(`At ${minText}, ${hrText}`)
    zhParts.push(`分钟 ${minute.raw} · 小时 ${hour.raw}`)
  }

  const domDesc = describeDom(dom)
  const dowDesc = describeDow(dow)
  const monDesc = describeMonth(month)

  if (!dom.isWildcard && !dow.isWildcard) {
    enParts.push(`${domDesc.en} or ${dowDesc.en}`)
    zhParts.unshift(`${domDesc.zh}或${dowDesc.zh}`)
  }
  else {
    if (domDesc.en) {
      enParts.push(domDesc.en)
      zhParts.unshift(domDesc.zh)
    }
    if (dowDesc.en) {
      enParts.push(dowDesc.en)
      zhParts.unshift(dowDesc.zh)
    }
    if (dom.isWildcard && dow.isWildcard && !minute.isWildcard && !hour.isWildcard && !hourStep && !minStep) {
      enParts.push('every day')
      zhParts.unshift('每天')
    }
  }

  if (monDesc.en) {
    enParts.push(monDesc.en)
    zhParts.unshift(monDesc.zh)
  }

  return {
    en: enParts.join(', '),
    zh: zhParts.join(' '),
  }
}

function parseChineseNumeral(token) {
  const s = String(token ?? '').trim()
  if (/^\d+$/.test(s)) {
    return Number.parseInt(s, 10)
  }
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (s === '十') {
    return 10
  }
  if (s.includes('十')) {
    const [tens, ones] = s.split('十')
    const t = tens ? (digits[tens] ?? Number.NaN) : 1
    const o = ones ? (digits[ones] ?? Number.NaN) : 0
    if (Number.isNaN(t) || Number.isNaN(o)) {
      return Number.NaN
    }
    return t * 10 + o
  }
  if (s.length === 1 && Object.prototype.hasOwnProperty.call(digits, s)) {
    return digits[s]
  }
  return Number.NaN
}

function parseTimeOfDay(text) {
  // Explicit HH:mm (with optional am/pm), 12h am/pm, or "at H"
  const explicitTime = /(?:(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\b|(?:at\s+)?(\d{1,2})\s*(am|pm)\b|\bat\s+(\d{1,2})\b)/i.exec(text)
  if (explicitTime) {
    let hour
    let minute = 0
    let meridiem = ''
    if (explicitTime[1] !== undefined) {
      hour = Number.parseInt(explicitTime[1], 10)
      minute = Number.parseInt(explicitTime[2], 10)
      meridiem = (explicitTime[3] || '').toLowerCase()
    }
    else if (explicitTime[4] !== undefined) {
      hour = Number.parseInt(explicitTime[4], 10)
      meridiem = (explicitTime[5] || '').toLowerCase()
    }
    else {
      hour = Number.parseInt(explicitTime[6], 10)
    }

    if (meridiem) {
      if (hour < 1 || hour > 12) {
        return null
      }
      if (meridiem === 'pm' && hour < 12) {
        hour += 12
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0
      }
    }
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute }
    }
  }

  // Chinese time: "早上9点半", "下午3点15分", "晚上10点", "凌晨2点", "9点30分"
  const zhClock = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)?\s*([0-9零一二两三四五六七八九十]+)\s*(?:点|时)(?:(半)|([0-9零一二两三四五六七八九十]+)\s*分?)?/.exec(text)
  if (zhClock) {
    const period = zhClock[1] || ''
    let hour = parseChineseNumeral(zhClock[2])
    let minute = 0
    if (zhClock[3] === '半') {
      minute = 30
    }
    else if (zhClock[4]) {
      minute = parseChineseNumeral(zhClock[4])
    }
    if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
      if ((period === '下午' || period === '傍晚' || period === '晚上' || period === '夜里') && hour >= 1 && hour <= 11) {
        hour += 12
      }
      if (period === '凌晨' && hour === 12) {
        hour = 0
      }
      if (period === '中午' && hour >= 1 && hour <= 3) {
        hour += 12
      }
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute }
      }
    }
  }

  if (/\bmidnight\b|午夜|半夜/.test(text.toLowerCase())) {
    return { hour: 0, minute: 0 }
  }
  if (/\bnoon\b|中午/.test(text.toLowerCase())) {
    return { hour: 12, minute: 0 }
  }
  if (/凌晨/.test(text)) {
    return { hour: 0, minute: 0 }
  }

  return null
}

function parseNaturalLanguageToCron(rawInput) {
  const input = normalizeText(rawInput)
  if (!input) {
    return null
  }
  const lower = input.toLowerCase()

  // Extract optional weekday/weekend/range filter
  let dowExpr = '*'
  if (/\bweekdays?\b|工作日/.test(lower)) {
    dowExpr = '1-5'
  }
  else if (/\bweekends?\b|周末/.test(lower)) {
    dowExpr = '0,6'
  }
  else {
    // Check explicit English weekdays
    const foundDows = new Set()
    const enDowRe = /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi
    for (const m of lower.matchAll(enDowRe)) {
      const val = DOW_NAMES[m[1].toLowerCase()]
      if (val !== undefined) {
        foundDows.add(val)
      }
    }
    // Check Chinese weekdays: 每周一、周三、周五 / 每周一三五 / 星期日
    const zhDowBlock = /(?:每?(?:周|星期|礼拜))([一二三四五六日天、,，\s]+)/.exec(input)
    if (zhDowBlock) {
      const zhMap = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
      for (const ch of zhDowBlock[1]) {
        if (Object.prototype.hasOwnProperty.call(zhMap, ch)) {
          foundDows.add(zhMap[ch])
        }
      }
    }
    if (foundDows.size > 0) {
      dowExpr = Array.from(foundDows).sort((a, b) => a - b).join(',')
    }
  }

  // Optional hour window: "between 9 and 18" / "9点到18点"
  let hourWindow = '*'
  const betweenEn = /between\s+(\d{1,2})\s+(?:and|to|-)\s+(\d{1,2})/i.exec(lower)
  const betweenZh = /(\d{1,2})\s*[点时]?\s*(?:到|至|-)\s*(\d{1,2})\s*[点时]?/.exec(input)
  if (betweenEn) {
    const h1 = Number.parseInt(betweenEn[1], 10)
    const h2 = Number.parseInt(betweenEn[2], 10)
    if (h1 >= 0 && h1 <= 23 && h2 >= h1 && h2 <= 23) {
      hourWindow = `${h1}-${h2}`
    }
  }
  else if (betweenZh && /每\s*[0-9零一二两三四五六七八九十]+\s*分钟/.test(input)) {
    const h1 = Number.parseInt(betweenZh[1], 10)
    const h2 = Number.parseInt(betweenZh[2], 10)
    if (h1 >= 0 && h1 <= 23 && h2 >= h1 && h2 <= 23) {
      hourWindow = `${h1}-${h2}`
    }
  }

  // 1. Every minute / every N minutes
  if (/^every\s+minute\b|^每分钟$/.test(lower)) {
    return { expr: `* ${hourWindow} * * ${dowExpr}`, source: 'natural-language' }
  }
  const everyNMinEn = /every\s+(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(lower)
  if (everyNMinEn) {
    const n = Number.parseInt(everyNMinEn[1], 10)
    if (n >= 1 && n <= 59) {
      return { expr: `*/${n} ${hourWindow} * * ${dowExpr}`, source: 'natural-language' }
    }
  }
  const everyNMinZh = /每\s*([0-9零一二两三四五六七八九十]+)\s*分钟/.exec(input)
  if (everyNMinZh) {
    const n = parseChineseNumeral(everyNMinZh[1])
    if (!Number.isNaN(n) && n >= 1 && n <= 59) {
      return { expr: `*/${n} ${hourWindow} * * ${dowExpr}`, source: 'natural-language' }
    }
  }

  // 2. Every hour / every N hours
  const everyNHrEn = /every\s+(\d+)\s*(?:hours?|hrs?|h)\b/i.exec(lower)
  if (everyNHrEn) {
    const n = Number.parseInt(everyNHrEn[1], 10)
    if (n >= 1 && n <= 23) {
      return { expr: `0 */${n} * * ${dowExpr}`, source: 'natural-language' }
    }
  }
  const everyNHrZh = /每\s*([0-9零一二两三四五六七八九十]+)\s*(?:小时|钟头)/.exec(input)
  if (everyNHrZh) {
    const n = parseChineseNumeral(everyNHrZh[1])
    if (!Number.isNaN(n) && n >= 1 && n <= 23) {
      return { expr: `0 */${n} * * ${dowExpr}`, source: 'natural-language' }
    }
  }
  const hourlyAtMinZh = /每小时(?:第)?\s*([0-9零一二两三四五六七八九十]+)\s*分/.exec(input)
  if (hourlyAtMinZh) {
    const m = parseChineseNumeral(hourlyAtMinZh[1])
    if (!Number.isNaN(m) && m >= 0 && m <= 59) {
      return { expr: `${m} * * * ${dowExpr}`, source: 'natural-language' }
    }
  }
  if (/^(?:every\s+hour|hourly)\b|^每小时/.test(lower)) {
    return { expr: `0 * * * ${dowExpr}`, source: 'natural-language' }
  }

  const timeOfDay = parseTimeOfDay(input)

  // 3. Yearly / Annually
  if (/\b(?:yearly|annually|every\s+year)\b|每年/.test(lower)) {
    const zhMonthDay = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(input)
    const mon = zhMonthDay ? Number.parseInt(zhMonthDay[1], 10) : 1
    const day = zhMonthDay ? Number.parseInt(zhMonthDay[2], 10) : 1
    const h = timeOfDay ? timeOfDay.hour : 0
    const m = timeOfDay ? timeOfDay.minute : 0
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return { expr: `${m} ${h} ${day} ${mon} *`, source: 'natural-language' }
    }
  }

  // 4. Monthly
  if (/\b(?:monthly|every\s+month)\b|每月/.test(lower)) {
    const dayEn = /(?:on\s+(?:the\s+|day\s+)?)(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(lower)
    const dayZh = /每月\s*(?:第)?\s*(\d{1,2})\s*[日号]?/.exec(input)
    const dom = dayEn
      ? Number.parseInt(dayEn[1], 10)
      : (dayZh ? Number.parseInt(dayZh[1], 10) : 1)
    const h = timeOfDay ? timeOfDay.hour : 0
    const m = timeOfDay ? timeOfDay.minute : 0
    if (dom >= 1 && dom <= 31) {
      return { expr: `${m} ${h} ${dom} * *`, source: 'natural-language' }
    }
  }

  // 5. Weekly / specific weekday / weekday / weekend
  if (dowExpr !== '*') {
    const h = timeOfDay ? timeOfDay.hour : 9
    const m = timeOfDay ? timeOfDay.minute : 0
    return { expr: `${m} ${h} * * ${dowExpr}`, source: 'natural-language' }
  }
  if (/\b(?:weekly|every\s+week)\b|^每周$/.test(lower)) {
    const h = timeOfDay ? timeOfDay.hour : 0
    const m = timeOfDay ? timeOfDay.minute : 0
    return { expr: `${m} ${h} * * 0`, source: 'natural-language' }
  }

  // 6. Daily / every day / time-only with daily cue
  if (/\b(?:daily|every\s+day|every\s+morning|every\s+night|midnight|noon)\b|每天|每日/.test(lower)) {
    const h = timeOfDay ? timeOfDay.hour : 0
    const m = timeOfDay ? timeOfDay.minute : 0
    return { expr: `${m} ${h} * * *`, source: 'natural-language' }
  }

  return null
}

function isLikelyCronInput(text) {
  const trimmed = normalizeText(text)
  if (!trimmed) {
    return false
  }
  if (trimmed.startsWith('@')) {
    return true
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) {
    return false
  }
  const numericCron = /^[0-9*,/-]+$/
  const monthCron = /^(?:[0-9*,/-]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)+$/i
  const dowCron = /^(?:[0-9*,/-]|sun|mon|tue|wed|thu|fri|sat)+$/i
  return (
    numericCron.test(parts[0])
    && numericCron.test(parts[1])
    && numericCron.test(parts[2])
    && monthCron.test(parts[3])
    && dowCron.test(parts[4])
  )
}

function searchPresets(keyword) {
  const lower = normalizeText(keyword).toLowerCase()
  if (!lower || lower === 'presets' || lower === 'list' || lower === '预设') {
    return CRON_PRESETS
  }
  return CRON_PRESETS.filter((preset) => {
    const haystack = [preset.id, preset.expr, preset.title, preset.zh, ...preset.tags].join(' ').toLowerCase()
    return haystack.includes(lower)
  })
}

function buildInfoItem({ id, featureId, title, subtitle, accessory }) {
  const Builder = getItemBuilder()
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  return builder.build()
}

function buildActionItem({ id, featureId, title, subtitle, accessory, actions }) {
  const Builder = getItemBuilder()
  const defaultAction = actions[0]?.id
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(defaultAction ? { defaultAction } : {}),
    })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  for (const action of actions) {
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  }
  return builder.build()
}

function formatGhaScheduleYaml(expr) {
  return `on:\n  schedule:\n    - cron: '${expr}'`
}

function buildCronAnalysisItems(featureId, parsed, fromDate, { preferUtc = false, generatedFrom = null } = {}) {
  const items = []

  if (!parsed.ok) {
    items.push(buildInfoItem({
      id: `${featureId}-invalid`,
      featureId,
      title: 'Invalid Cron Expression / Cron 表达式无效',
      subtitle: parsed.error,
      accessory: 'ERROR',
    }))
    return items
  }

  if (parsed.isReboot) {
    items.push(buildActionItem({
      id: `${featureId}-reboot`,
      featureId,
      title: '@reboot — Run once at system startup',
      subtitle: '系统启动时执行一次（无固定日历周期）',
      accessory: 'ALIAS',
      actions: [
        { id: ACTION_COPY_CRON, label: '复制 @reboot', payload: { text: '@reboot' } },
        { id: ACTION_COPY_CRONTAB, label: '复制 Crontab 行', payload: { text: '@reboot /path/to/command' } },
      ],
    }))
    return items
  }

  const expr = parsed.expression
  const human = humanizeCron(parsed)
  const localRuns = computeNextRuns(parsed, fromDate, DEFAULT_RUN_COUNT, 'local')
  const utcRuns = computeNextRuns(parsed, fromDate, DEFAULT_RUN_COUNT, 'utc')
  const primaryMode = preferUtc ? 'utc' : 'local'
  const primaryRuns = preferUtc ? utcRuns : localRuns

  const { minute, hour, dom, month, dow } = parsed.fields
  const breakdown = `min:${minute.raw} · hr:${hour.raw} · dom:${dom.raw} · mon:${month.raw} · dow:${dow.raw}`
  const headerPrefix = generatedFrom ? `Generated: ${expr}` : (parsed.alias ? `${parsed.alias} → ${expr}` : expr)

  // Card 1: Expression + Human Summary + Multi-Format Copy Actions
  items.push(buildActionItem({
    id: `${featureId}-expression`,
    featureId,
    title: `${headerPrefix}  —  ${human.en}`,
    subtitle: `${human.zh}  |  ${breakdown}`,
    accessory: generatedFrom ? 'GENERATED' : (preferUtc ? 'UTC' : 'CRON'),
    actions: [
      { id: ACTION_COPY_CRON, label: '复制 Cron 表达式 / Copy Cron', payload: { text: expr } },
      { id: ACTION_COPY_HUMAN, label: '复制中英文说明 / Copy Summary', payload: { text: `${expr} — ${human.en} (${human.zh})` } },
      { id: ACTION_COPY_CRONTAB, label: '复制 Crontab 行', payload: { text: `${expr} /path/to/command` } },
      { id: ACTION_COPY_GHA, label: '复制 GitHub Actions YAML', payload: { text: formatGhaScheduleYaml(expr) } },
    ],
  }))

  if (primaryRuns.length === 0) {
    items.push(buildInfoItem({
      id: `${featureId}-no-runs`,
      featureId,
      title: 'No Matching Run Within 8 Years / 未来 8 年内无匹配日期',
      subtitle: 'Check impossible calendar combinations such as Feb 30 or Apr 31',
      accessory: 'EMPTY',
    }))
    return items
  }

  // Card 2: Next 10 runs bulk copy (Primary TZ: Local or UTC)
  const primaryFormatted = primaryRuns.map((d, i) => `${i + 1}. ${formatRunDate(d, primaryMode)}`)
  items.push(buildActionItem({
    id: `${featureId}-runs-primary`,
    featureId,
    title: `Next ${primaryRuns.length} Runs (${preferUtc ? 'UTC' : 'Local'}): ${formatRunDate(primaryRuns[0], primaryMode)}`,
    subtitle: `Next 5: ${primaryRuns.slice(0, 5).map(d => formatRunDate(d, primaryMode)).join('  |  ')}`,
    accessory: formatRelativeDelta(primaryRuns[0], fromDate),
    actions: [
      { id: ACTION_COPY_RUNS, label: `复制未来 ${primaryRuns.length} 次时间`, payload: { text: primaryFormatted.join('\n') } },
      { id: ACTION_COPY_CRON, label: '复制 Cron 表达式', payload: { text: expr } },
    ],
  }))

  // Card 3: Secondary timezone overview (UTC when primary is Local, or Local when primary is UTC)
  const secondaryMode = preferUtc ? 'local' : 'utc'
  const secondaryRuns = preferUtc ? localRuns : utcRuns
  if (secondaryRuns.length > 0) {
    const secondaryLines = secondaryRuns.map((d, i) => `${i + 1}. ${secondaryMode === 'utc' ? d.toISOString() : formatRunDate(d, 'local')}`)
    items.push(buildActionItem({
      id: `${featureId}-runs-secondary`,
      featureId,
      title: `${secondaryMode === 'utc' ? 'UTC' : 'Local'} Schedule (${secondaryRuns.length} runs): ${formatRunDate(secondaryRuns[0], secondaryMode)}`,
      subtitle: secondaryRuns.slice(0, 3).map(d => (secondaryMode === 'utc' ? d.toISOString() : formatRunDate(d, 'local'))).join('  ·  '),
      accessory: secondaryMode.toUpperCase(),
      actions: [
        { id: ACTION_COPY_RUNS, label: `复制 ${secondaryMode.toUpperCase()} 运行列表`, payload: { text: secondaryLines.join('\n') } },
      ],
    }))
  }

  // Individual Next #1 .. #8 cards for instant inspection & single-timestamp copy
  const displayCount = Math.min(primaryRuns.length, 8)
  for (let i = 0; i < displayCount; i += 1) {
    const runDate = primaryRuns[i]
    const formatted = formatRunDate(runDate, primaryMode)
    const iso = runDate.toISOString()
    items.push(buildActionItem({
      id: `${featureId}-run-${i + 1}`,
      featureId,
      title: `#${i + 1}  ${formatted}`,
      subtitle: `ISO: ${iso} · ${formatRelativeDelta(runDate, fromDate)}`,
      accessory: `RUN #${i + 1}`,
      actions: [
        { id: ACTION_COPY_RUN_SINGLE, label: '复制 ISO 时间', payload: { text: iso } },
        { id: ACTION_COPY_CRON, label: '复制 Cron 表达式', payload: { text: expr } },
      ],
    }))
  }

  return items
}

function buildPresetItems(featureId, presets, fromDate, preferUtc) {
  const mode = preferUtc ? 'utc' : 'local'
  return presets.map((preset) => {
    const parsed = parseCronExpression(preset.expr)
    const nextRun = parsed.ok ? computeNextRuns(parsed, fromDate, 1, mode)[0] : null
    const nextLabel = nextRun ? `Next: ${formatRunDate(nextRun, mode)}` : ''
    return buildActionItem({
      id: `${featureId}-preset-${preset.id}`,
      featureId,
      title: `${preset.expr}  —  ${preset.title}`,
      subtitle: `${preset.zh}${nextLabel ? `  |  ${nextLabel}` : ''}`,
      accessory: nextRun ? formatRelativeDelta(nextRun, fromDate) : 'PRESET',
      actions: [
        { id: ACTION_COPY_CRON, label: '复制 Cron 表达式 / Copy Cron', payload: { text: preset.expr } },
        { id: ACTION_COPY_HUMAN, label: '复制说明 / Copy Summary', payload: { text: `${preset.expr} — ${preset.title} (${preset.zh})` } },
        { id: ACTION_COPY_GHA, label: '复制 GitHub Actions YAML', payload: { text: formatGhaScheduleYaml(preset.expr) } },
      ],
    })
  })
}

function buildResultItems(featureId, rawText, fromDate) {
  const stripped = stripTriggerPrefix(rawText)
  const { text, preferUtc } = extractTimezonePreference(stripped)

  if (!text) {
    return [
      buildInfoItem({
        id: `${featureId}-guide`,
        featureId,
        title: 'Cron Craft — Parse · Humanize · Next 10 Runs · Reverse Generator',
        subtitle: 'Try "*/15 9-18 * * 1-5", "@daily utc", "every weekday at 9am", or "每天早上9点"',
        accessory: 'GUIDE',
      }),
      ...buildPresetItems(featureId, CRON_PRESETS.slice(0, 12), fromDate, preferUtc),
    ]
  }

  const lower = text.toLowerCase()
  if (lower === 'presets' || lower === 'list' || lower === '预设') {
    return buildPresetItems(featureId, CRON_PRESETS, fromDate, preferUtc)
  }

  // 1. Direct cron expression or @alias
  if (isLikelyCronInput(text)) {
    const parsed = parseCronExpression(text)
    return buildCronAnalysisItems(featureId, parsed, fromDate, { preferUtc })
  }

  // 2. Natural-language reverse generator (EN + ZH)
  const generated = parseNaturalLanguageToCron(text)
  if (generated) {
    const parsed = parseCronExpression(generated.expr)
    return buildCronAnalysisItems(featureId, parsed, fromDate, {
      preferUtc,
      generatedFrom: text,
    })
  }

  // 3. Could be a malformed 4/6-field numeric cron attempt -> give helpful validation error!
  if (/^[\d*,/-]+(?:\s+[\d*,/-]+){2,5}$/.test(text)) {
    const parsed = parseCronExpression(text)
    return buildCronAnalysisItems(featureId, parsed, fromDate, { preferUtc })
  }

  // 4. Preset search fallback
  const matchedPresets = searchPresets(text)
  if (matchedPresets.length > 0) {
    return buildPresetItems(featureId, matchedPresets, fromDate, preferUtc)
  }

  return [
    buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: 'Unrecognized Schedule Input / 未识别的定时描述',
      subtitle: 'Enter 5-field cron ("0 9 * * 1-5"), alias ("@daily"), or phrase ("every 15 minutes", "每周一 9点")',
      accessory: 'HINT',
    }),
  ]
}

function blocked(reason, message) {
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason,
    message,
  }
}

async function ensureClipboardWritePermission() {
  const perm = getPermission()
  if (!perm || typeof perm.check !== 'function') {
    return {
      granted: false,
      reason: 'permission-sdk-unavailable',
      message: '权限系统不可用',
    }
  }
  try {
    const granted = await perm.check('clipboard.write')
    if (granted === true) {
      return { granted: true, reason: '', message: '' }
    }
    return {
      granted: false,
      reason: 'permission-denied',
      message: '缺少 clipboard.write 权限',
    }
  }
  catch (error) {
    getLogger()?.warn?.(`[${PLUGIN_NAME}] Permission check failed`)
    if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return {
        granted: false,
        reason: 'permission-unavailable',
        message: '权限服务暂不可用',
      }
    }
    if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return {
        granted: false,
        reason: 'permission-denied',
        message: '缺少 clipboard.write 权限',
      }
    }
    return {
      granted: false,
      reason: 'permission-check-failed',
      message: '权限检查失败',
    }
  }
}

async function publishItems(items, generation, signal) {
  if (generation !== triggerGeneration || signal?.aborted) {
    return true
  }
  const feature = getPlugin()?.feature
  if (!feature || typeof feature.clearItems !== 'function' || typeof feature.pushItems !== 'function') {
    return false
  }
  await feature.clearItems()
  if (generation !== triggerGeneration || signal?.aborted) {
    return true
  }
  await feature.pushItems(items)
  return true
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query, _feature, signal) {
    const generation = ++triggerGeneration
    try {
      const items = buildResultItems(featureId || FEATURE_ID, getQueryText(query), getReferenceDate(query))
      return await publishItems(items, generation, signal)
    }
    catch {
      getLogger()?.error?.(`[${PLUGIN_NAME}] Failed to handle feature`)
      try {
        return await publishItems([
          buildInfoItem({
            id: `${featureId || FEATURE_ID}-error`,
            featureId: featureId || FEATURE_ID,
            title: 'Cron Craft Error / 定时解析异常',
            subtitle: '请检查表达式格式后重试',
            accessory: 'ERROR',
          }),
        ], generation, signal)
      }
      catch {
        getLogger()?.error?.(`[${PLUGIN_NAME}] Failed to publish fallback`)
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    try {
      const selectedActionId = normalizeText(
        context?.actionId || item?.meta?.defaultAction || item?.actions?.[0]?.id,
      )
      if (!selectedActionId) {
        return blocked('invalid-action', '无效的操作')
      }

      const declaredAction = Array.isArray(item?.actions)
        ? item.actions.find(action => action?.id === selectedActionId)
        : null
      if (!declaredAction || declaredAction.type !== 'plugin') {
        return blocked('invalid-action', '未找到对应的插件操作')
      }

      const payloadText = typeof declaredAction.payload === 'string'
        ? declaredAction.payload
        : declaredAction.payload?.text
      if (typeof payloadText !== 'string') {
        return blocked('invalid-action', '缺少可复制内容')
      }

      const permCheck = await ensureClipboardWritePermission()
      if (!permCheck.granted) {
        return blocked(permCheck.reason, permCheck.message)
      }

      const clip = getClipboard()
      if (!clip || typeof clip.writeText !== 'function') {
        return blocked('capability-unavailable', '当前环境不支持写入剪贴板')
      }

      await clip.writeText(payloadText)
      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: '已复制到剪贴板',
      }
    }
    catch (error) {
      getLogger()?.error?.(`[${PLUGIN_NAME}] Action failed`)
      if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
        return blocked('permission-denied', '缺少 clipboard.write 权限')
      }
      if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
        return blocked('permission-unavailable', '权限服务暂不可用')
      }
      return blocked('clipboard-write-failed', '写入剪贴板失败')
    }
  },

  onDestroy() {
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle
