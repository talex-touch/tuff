import type { PickerColumn } from '../../picker/src/types'
import type { DatePickerMode, DatePickerPanelView } from './types'

export interface DateParts {
  y: number
  m: number
  d: number
}

export interface TimeParts {
  h: number
  min: number
  s: number
}

export interface DateTimeParts extends DateParts, TimeParts {}

export interface CalendarCell {
  key: string
  label: string
  parts: DateParts
  inCurrentMonth: boolean
  selected: boolean
  today: boolean
  disabled: boolean
  /** Range mode: strictly between the two ends. */
  inRange: boolean
  rangeStart: boolean
  rangeEnd: boolean
}

/** A month or year tile in the quick-switch grids. */
export interface PanelCell {
  key: string
  label: string
  value: number
  current: boolean
  selected: boolean
  disabled: boolean
  muted?: boolean
}

export const YEAR_BLOCK = 12

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function formatTime(parts: TimeParts, showSeconds = false): string {
  const base = `${pad2(parts.h)}:${pad2(parts.min)}`
  return showSeconds ? `${base}:${pad2(parts.s)}` : base
}

export function formatDateTime(parts: DateTimeParts, showSeconds = false): string {
  return `${formatYmd(parts.y, parts.m, parts.d)} ${formatTime(parts, showSeconds)}`
}

export function isValidDateParts(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return false
  if (m < 1 || m > 12)
    return false
  const max = new Date(y, m, 0).getDate()
  return d >= 1 && d <= max
}

export function isValidTimeParts(h: number, min: number, s: number): boolean {
  return Number.isFinite(h) && Number.isFinite(min) && Number.isFinite(s)
    && h >= 0 && h <= 23
    && min >= 0 && min <= 59
    && s >= 0 && s <= 59
}

export function parseYmd(s: string): DateParts | null {
  const raw = (s || '').trim()
  if (!raw)
    return null
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT].*)?$/)
  if (!m)
    return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const d = Number(m[3])
  if (!isValidDateParts(y, mm, d))
    return null
  return { y, m: mm, d }
}

export function parseTime(s: string): TimeParts | null {
  const raw = (s || '').trim()
  if (!raw)
    return null
  const m = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (!m)
    return null
  const h = Number(m[1])
  const min = Number(m[2])
  const sec = m[3] !== undefined ? Number(m[3]) : 0
  if (!isValidTimeParts(h, min, sec))
    return null
  return { h, min, s: sec }
}

export function parseDateTime(s: string): DateTimeParts | null {
  const raw = (s || '').trim()
  if (!raw)
    return null
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (!m)
    return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const d = Number(m[3])
  const h = m[4] !== undefined ? Number(m[4]) : 0
  const min = m[5] !== undefined ? Number(m[5]) : 0
  const sec = m[6] !== undefined ? Number(m[6]) : 0
  if (!isValidDateParts(y, mm, d) || !isValidTimeParts(h, min, sec))
    return null
  return { y, m: mm, d, h, min, s: sec }
}

export function toDateObj(p: DateParts): Date {
  return new Date(p.y, p.m - 1, p.d)
}

export function toPartsFromDate(date: Date): DateParts {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

export function nowDateTimeParts(): DateTimeParts {
  const now = new Date()
  return {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
    h: now.getHours(),
    min: now.getMinutes(),
    s: now.getSeconds(),
  }
}

export function compareDateParts(a: DateParts, b: DateParts): number {
  if (a.y !== b.y)
    return a.y - b.y
  if (a.m !== b.m)
    return a.m - b.m
  return a.d - b.d
}

export function compareTimeParts(a: TimeParts, b: TimeParts): number {
  if (a.h !== b.h)
    return a.h - b.h
  if (a.min !== b.min)
    return a.min - b.min
  return a.s - b.s
}

export function compareDateTimeParts(a: DateTimeParts, b: DateTimeParts): number {
  const d = compareDateParts(a, b)
  if (d !== 0)
    return d
  return compareTimeParts(a, b)
}

export function addMonths(parts: Pick<DateParts, 'y' | 'm'>, delta: number): Pick<DateParts, 'y' | 'm'> {
  const date = new Date(parts.y, parts.m - 1 + delta, 1)
  return { y: date.getFullYear(), m: date.getMonth() + 1 }
}

export function clampDate(p: DateParts, min: Date | null, max: Date | null): DateParts {
  let y = p.y
  let m = p.m
  let d = p.d

  const maxDay = new Date(y, m, 0).getDate()
  d = Math.min(Math.max(1, d), maxDay)

  let dt = toDateObj({ y, m, d })

  if (min && dt.getTime() < min.getTime()) {
    y = min.getFullYear()
    m = min.getMonth() + 1
    d = min.getDate()
    dt = toDateObj({ y, m, d })
  }

  if (max && dt.getTime() > max.getTime()) {
    y = max.getFullYear()
    m = max.getMonth() + 1
    d = max.getDate()
  }

  return { y, m, d }
}

export function alignTimeBound(
  t: TimeParts,
  direction: 'min' | 'max',
  showSeconds: boolean,
): TimeParts {
  if (showSeconds || t.s === 0)
    return t
  if (direction === 'max')
    return { h: t.h, min: t.min, s: 0 }
  const totalMin = Math.min(23 * 60 + 59, t.h * 60 + t.min + 1)
  return { h: Math.floor(totalMin / 60), min: totalMin % 60, s: 0 }
}

export function alignDateTimeBound(
  dt: DateTimeParts,
  direction: 'min' | 'max',
  showSeconds: boolean,
): DateTimeParts {
  if (showSeconds || dt.s === 0)
    return dt
  if (direction === 'max')
    return { ...dt, s: 0 }
  const next = new Date(dt.y, dt.m - 1, dt.d, dt.h, dt.min + 1, 0)
  return {
    y: next.getFullYear(),
    m: next.getMonth() + 1,
    d: next.getDate(),
    h: next.getHours(),
    min: next.getMinutes(),
    s: 0,
  }
}

export interface DatePickerBounds {
  minDate: Date | null
  maxDate: Date | null
  minTime: TimeParts | null
  maxTime: TimeParts | null
  minDateTime: DateTimeParts | null
  maxDateTime: DateTimeParts | null
}

export function resolveDatePickerBounds(
  mode: DatePickerMode,
  min: string | undefined,
  max: string | undefined,
  showSeconds: boolean,
): DatePickerBounds {
  const minRaw = min || ''
  const maxRaw = max || ''
  const isTime = mode === 'time'
  const isDateTime = mode === 'datetime' || mode === 'datetimerange'

  const parsedMinTime = isTime ? parseTime(minRaw) : null
  const parsedMaxTime = isTime ? parseTime(maxRaw) : null
  const minTime = parsedMinTime ? alignTimeBound(parsedMinTime, 'min', showSeconds) : null
  const maxTime = parsedMaxTime ? alignTimeBound(parsedMaxTime, 'max', showSeconds) : null

  const parsedMinDt = isDateTime ? parseDateTime(minRaw) : null
  const minDateTime = parsedMinDt ? alignDateTimeBound(parsedMinDt, 'min', showSeconds) : null

  let maxDateTime: DateTimeParts | null = null
  if (isDateTime) {
    const parsedMaxDt = parseDateTime(maxRaw)
    if (parsedMaxDt) {
      const full = maxRaw.trim().length <= 10
        ? { ...parsedMaxDt, h: 23, min: 59, s: 59 }
        : parsedMaxDt
      maxDateTime = alignDateTimeBound(full, 'max', showSeconds)
    }
  }

  const parsedMinD = minDateTime ? null : parseYmd(minRaw)
  const parsedMaxD = maxDateTime ? null : parseYmd(maxRaw)
  const minDate = minDateTime ? toDateObj(minDateTime) : (parsedMinD ? toDateObj(parsedMinD) : null)
  const maxDate = maxDateTime ? toDateObj(maxDateTime) : (parsedMaxD ? toDateObj(parsedMaxD) : null)

  return { minDate, maxDate, minTime, maxTime, minDateTime, maxDateTime }
}

export function clampDateTimeByMode(
  parts: DateTimeParts,
  mode: DatePickerMode,
  bounds: DatePickerBounds,
  opts: { showSeconds: boolean, minuteStep: number, secondStep: number },
): DateTimeParts {
  const snappedTime: TimeParts = {
    h: Math.min(23, Math.max(0, parts.h)),
    min: snapToStep(parts.min, opts.minuteStep, 59),
    s: opts.showSeconds ? snapToStep(parts.s, opts.secondStep, 59) : 0,
  }
  if (mode === 'time')
    return { ...parts, ...clampTime(snappedTime, bounds.minTime, bounds.maxTime) }
  if (mode === 'datetime' || mode === 'datetimerange')
    return clampDateTime({ ...parts, ...snappedTime }, bounds.minDateTime, bounds.maxDateTime)
  return { ...parts, ...clampDate(parts, bounds.minDate, bounds.maxDate) }
}

export function clampTime(p: TimeParts, min: TimeParts | null, max: TimeParts | null): TimeParts {
  let out: TimeParts = {
    h: Math.min(23, Math.max(0, Math.round(p.h))),
    min: Math.min(59, Math.max(0, Math.round(p.min))),
    s: Math.min(59, Math.max(0, Math.round(p.s))),
  }
  if (min && compareTimeParts(out, min) < 0)
    out = { ...min }
  if (max && compareTimeParts(out, max) > 0)
    out = { ...max }
  return out
}

export function clampDateTime(
  p: DateTimeParts,
  min: DateTimeParts | null,
  max: DateTimeParts | null,
): DateTimeParts {
  const maxDay = new Date(p.y, p.m, 0).getDate()
  let out: DateTimeParts = {
    y: p.y,
    m: Math.min(12, Math.max(1, p.m)),
    d: Math.min(maxDay, Math.max(1, p.d)),
    h: Math.min(23, Math.max(0, p.h)),
    min: Math.min(59, Math.max(0, p.min)),
    s: Math.min(59, Math.max(0, p.s)),
  }
  if (min && compareDateTimeParts(out, min) < 0)
    out = { ...min }
  if (max && compareDateTimeParts(out, max) > 0)
    out = { ...max }
  return out
}

export function normalizeStep(step: number | undefined, max: number): number {
  if (typeof step !== 'number' || !Number.isFinite(step))
    return 1
  return Math.min(max, Math.max(1, Math.floor(step)))
}

export function snapToStep(value: number, step: number, max: number): number {
  const s = normalizeStep(step, max)
  if (s <= 1)
    return Math.min(max, Math.max(0, Math.round(value)))
  const snapped = Math.round(value / s) * s
  return Math.min(Math.floor(max / s) * s, Math.max(0, snapped))
}

export function isDateOutsideBounds(parts: DateParts, minDate: Date | null, maxDate: Date | null): boolean {
  const min = minDate ? toPartsFromDate(minDate) : null
  const max = maxDate ? toPartsFromDate(maxDate) : null
  return Boolean((min && compareDateParts(parts, min) < 0) || (max && compareDateParts(parts, max) > 0))
}

export function isYearOutsideBounds(year: number, minDate: Date | null, maxDate: Date | null): boolean {
  if (minDate && year < minDate.getFullYear())
    return true
  if (maxDate && year > maxDate.getFullYear())
    return true
  return false
}

export function isMonthOutsideBounds(year: number, month: number, minDate: Date | null, maxDate: Date | null): boolean {
  const first = { y: year, m: month, d: 1 }
  const last = { y: year, m: month, d: new Date(year, month, 0).getDate() }
  const min = minDate ? toPartsFromDate(minDate) : null
  const max = maxDate ? toPartsFromDate(maxDate) : null
  if (min && compareDateParts(last, min) < 0)
    return true
  if (max && compareDateParts(first, max) > 0)
    return true
  return false
}

export function buildCalendarCells(opts: {
  month: Pick<DateParts, 'y' | 'm'>
  weekStart: 0 | 1
  isRangeMode: boolean
  activeDate: DateParts
  span: { start: DateParts, end: DateParts } | null
  minDate: Date | null
  maxDate: Date | null
}): CalendarCell[] {
  const { y, m } = opts.month
  const firstDay = new Date(y, m - 1, 1).getDay()
  const startOffset = (firstDay - opts.weekStart + 7) % 7
  const start = new Date(y, m - 1, 1 - startOffset)
  const today = toPartsFromDate(new Date())
  const { span } = opts

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const parts = toPartsFromDate(date)
    const isStart = !!span && compareDateParts(parts, span.start) === 0
    const isEnd = !!span && compareDateParts(parts, span.end) === 0

    return {
      key: formatYmd(parts.y, parts.m, parts.d),
      label: String(parts.d),
      parts,
      inCurrentMonth: parts.y === y && parts.m === m,
      selected: opts.isRangeMode ? isStart || isEnd : compareDateParts(parts, opts.activeDate) === 0,
      today: compareDateParts(parts, today) === 0,
      disabled: isDateOutsideBounds(parts, opts.minDate, opts.maxDate),
      inRange: !!span && compareDateParts(parts, span.start) > 0 && compareDateParts(parts, span.end) < 0,
      rangeStart: opts.isRangeMode && isStart,
      rangeEnd: opts.isRangeMode && isEnd,
    }
  })
}

export function buildMonthCells(
  month: Pick<DateParts, 'y' | 'm'>,
  minDate: Date | null,
  maxDate: Date | null,
): PanelCell[] {
  const year = month.y
  const today = toPartsFromDate(new Date())
  return Array.from({ length: 12 }).map((_, index) => {
    const value = index + 1
    return {
      key: `${year}-${pad2(value)}`,
      label: pad2(value),
      value,
      current: today.y === year && today.m === value,
      selected: month.m === value,
      disabled: isMonthOutsideBounds(year, value, minDate, maxDate),
    }
  })
}

export function buildYearCells(
  yearBlockStart: number,
  selectedYear: number,
  minDate: Date | null,
  maxDate: Date | null,
): PanelCell[] {
  const today = toPartsFromDate(new Date())
  return Array.from({ length: YEAR_BLOCK + 2 }).map((_, index) => {
    const year = yearBlockStart - 1 + index
    return {
      key: `y-${year}`,
      label: String(year),
      value: year,
      current: today.y === year,
      selected: selectedYear === year,
      disabled: isYearOutsideBounds(year, minDate, maxDate),
      muted: index === 0 || index === YEAR_BLOCK + 1,
    }
  })
}

export function canMoveCalendarView(opts: {
  panelView: DatePickerPanelView
  month: Pick<DateParts, 'y' | 'm'>
  yearBlockStart: number
  delta: number
  minDate: Date | null
  maxDate: Date | null
}): boolean {
  const min = opts.minDate ? toPartsFromDate(opts.minDate) : null
  const max = opts.maxDate ? toPartsFromDate(opts.maxDate) : null

  if (opts.panelView === 'year') {
    const nextStart = opts.yearBlockStart + opts.delta * YEAR_BLOCK
    if (opts.delta < 0 && min && nextStart + YEAR_BLOCK - 1 < min.y)
      return false
    if (opts.delta > 0 && max && nextStart > max.y)
      return false
    return true
  }

  if (opts.panelView === 'month') {
    const nextYear = opts.month.y + opts.delta
    if (opts.delta < 0 && min && nextYear < min.y)
      return false
    if (opts.delta > 0 && max && nextYear > max.y)
      return false
    return true
  }

  const next = addMonths(opts.month, opts.delta)
  const start = { y: next.y, m: next.m, d: 1 }
  const end = { y: next.y, m: next.m, d: new Date(next.y, next.m, 0).getDate() }

  if (opts.delta < 0 && min && compareDateParts(end, min) < 0)
    return false
  if (opts.delta > 0 && max && compareDateParts(start, max) > 0)
    return false
  return true
}

export function buildTimePickerColumns(opts: {
  mode: DatePickerMode
  refDate: DateParts | null
  activeTime: TimeParts
  showSeconds: boolean
  minuteStep: number
  secondStep: number
  minTime: TimeParts | null
  maxTime: TimeParts | null
  minDateTime: DateTimeParts | null
  maxDateTime: DateTimeParts | null
}): PickerColumn[] {
  const sameMinDay = !!opts.refDate && !!opts.minDateTime && compareDateParts(opts.refDate, opts.minDateTime) === 0
  const sameMaxDay = !!opts.refDate && !!opts.maxDateTime && compareDateParts(opts.refDate, opts.maxDateTime) === 0

  const effectiveMinTime: TimeParts | null = opts.mode === 'time' ? opts.minTime : (sameMinDay ? opts.minDateTime : null)
  const effectiveMaxTime: TimeParts | null = opts.mode === 'time' ? opts.maxTime : (sameMaxDay ? opts.maxDateTime : null)

  const hours = Array.from({ length: 24 }).map((_, h) => ({
    value: h,
    label: pad2(h),
    disabled: (effectiveMinTime != null && h < effectiveMinTime.h)
      || (effectiveMaxTime != null && h > effectiveMaxTime.h),
  }))

  const minutes: Array<{ value: number, label: string, disabled: boolean }> = []
  for (let min = 0; min < 60; min += opts.minuteStep) {
    const disabled = (effectiveMinTime != null && opts.activeTime.h === effectiveMinTime.h && min < effectiveMinTime.min)
      || (effectiveMaxTime != null && opts.activeTime.h === effectiveMaxTime.h && min > effectiveMaxTime.min)
    minutes.push({ value: min, label: pad2(min), disabled })
  }

  const cols: PickerColumn[] = [
    { key: 'hour', options: hours },
    { key: 'minute', options: minutes },
  ]

  if (opts.showSeconds) {
    const seconds: Array<{ value: number, label: string, disabled: boolean }> = []
    for (let s = 0; s < 60; s += opts.secondStep) {
      const disabled = (effectiveMinTime != null && opts.activeTime.h === effectiveMinTime.h && opts.activeTime.min === effectiveMinTime.min && s < effectiveMinTime.s)
        || (effectiveMaxTime != null && opts.activeTime.h === effectiveMaxTime.h && opts.activeTime.min === effectiveMaxTime.min && s > effectiveMaxTime.s)
      seconds.push({ value: s, label: pad2(s), disabled })
    }
    cols.push({ key: 'second', options: seconds })
  }

  return cols
}

export function buildDateWheelColumns(opts: {
  parts: DateParts
  minDate: Date | null
  maxDate: Date | null
}): PickerColumn[] {
  const { y, m } = opts.parts
  const minY = opts.minDate?.getFullYear() ?? null
  const minM = opts.minDate ? opts.minDate.getMonth() + 1 : null
  const minD = opts.minDate ? opts.minDate.getDate() : null

  const maxY = opts.maxDate?.getFullYear() ?? null
  const maxM = opts.maxDate ? opts.maxDate.getMonth() + 1 : null
  const maxD = opts.maxDate ? opts.maxDate.getDate() : null

  const from = Math.min(minY ?? 1970, maxY ?? 2100)
  const to = Math.max(minY ?? 1970, maxY ?? 2100)
  const yearOptions: Array<{ value: number, label: string, disabled: boolean }> = []
  for (let yy = from; yy <= to; yy++) {
    yearOptions.push({
      value: yy,
      label: String(yy),
      disabled: (minY != null && yy < minY) || (maxY != null && yy > maxY),
    })
  }

  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const mm = i + 1
    const disabled = (minY != null && minM != null && y === minY && mm < minM)
      || (maxY != null && maxM != null && y === maxY && mm > maxM)
    return { value: mm, label: pad2(mm), disabled }
  })

  const maxDay = new Date(y, m, 0).getDate()
  const dayOptions = Array.from({ length: maxDay }).map((_, i) => {
    const dd = i + 1
    const disabled = (minY != null && minM != null && minD != null && y === minY && m === minM && dd < minD)
      || (maxY != null && maxM != null && maxD != null && y === maxY && m === maxM && dd > maxD)
    return { value: dd, label: pad2(dd), disabled }
  })

  return [
    { key: 'year', options: yearOptions },
    { key: 'month', options: monthOptions },
    { key: 'day', options: dayOptions },
  ]
}
