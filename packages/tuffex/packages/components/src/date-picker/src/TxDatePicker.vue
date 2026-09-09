<script setup lang="ts">
import type { PickerColumn, PickerValue } from '../../picker/src/types'
import type { DatePickerEmits, DatePickerPanelView, DatePickerProps, DateRangeValue } from './types'
import TxPicker from '../../picker/src/TxPicker.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'TxDatePicker' })

const props = withDefaults(defineProps<DatePickerProps>(), {
  modelValue: '',
  visible: false,
  popup: true,
  variant: 'picker',
  title: 'Select date',
  placeholder: 'Select date',
  disabled: false,
  showToolbar: true,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  closeOnClickMask: true,
  adaptiveBreakpoint: 768,
  weekStartsOn: 0,
  range: false,
  rangeSeparator: ' → ',
})

const emit = defineEmits<DatePickerEmits>()

interface DateParts {
  y: number
  m: number
  d: number
}

interface CalendarCell {
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
interface PanelCell {
  key: string
  label: string
  value: number
  current: boolean
  selected: boolean
  disabled: boolean
  muted?: boolean
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function isValidDateParts(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return false
  if (m < 1 || m > 12)
    return false
  const max = new Date(y, m, 0).getDate()
  return d >= 1 && d <= max
}

function parseYmd(s: string): DateParts | null {
  const raw = (s || '').trim()
  if (!raw)
    return null
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m)
    return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const d = Number(m[3])
  if (!isValidDateParts(y, mm, d))
    return null
  return { y, m: mm, d }
}

function toDateObj(p: DateParts): Date {
  return new Date(p.y, p.m - 1, p.d)
}

function toPartsFromDate(date: Date): DateParts {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

function compareDateParts(a: DateParts, b: DateParts): number {
  if (a.y !== b.y)
    return a.y - b.y
  if (a.m !== b.m)
    return a.m - b.m
  return a.d - b.d
}

function addMonths(parts: Pick<DateParts, 'y' | 'm'>, delta: number): Pick<DateParts, 'y' | 'm'> {
  const date = new Date(parts.y, parts.m - 1 + delta, 1)
  return { y: date.getFullYear(), m: date.getMonth() + 1 }
}

function clampDate(p: DateParts, min: Date | null, max: Date | null) {
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
    dt = toDateObj({ y, m, d })
  }

  return { y, m, d }
}

const minDate = computed(() => {
  const p = parseYmd(props.min || '')
  return p ? toDateObj(p) : null
})

const maxDate = computed(() => {
  const p = parseYmd(props.max || '')
  return p ? toDateObj(p) : null
})

const localParts = ref<DateParts>({ y: 2025, m: 1, d: 1 })
const calendarMonth = ref<Pick<DateParts, 'y' | 'm'>>({ y: 2025, m: 1 })

/** Which grid the field calendar shows, and which way the last move went. */
const panelView = ref<DatePickerPanelView>('day')
const navDirection = ref<'next' | 'prev' | 'none'>('none')
const YEAR_BLOCK = 12
const yearBlockStart = ref(2020)

const rangeStart = ref<DateParts | null>(null)
const rangeEnd = ref<DateParts | null>(null)
/** The end being previewed under the pointer while the second click is pending. */
const rangeHover = ref<DateParts | null>(null)
const pickingEnd = ref(false)

/** The wheel picker has no range surface, so range only applies to the calendar. */
const isRange = computed(() => props.range && resolvedVariant.value === 'field')

const modelString = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))

function emitModel(parts: DateParts): void {
  const s = formatYmd(parts.y, parts.m, parts.d)
  emit('update:modelValue', s)
  emit('change', s)
}

function emitRange(start: DateParts, end: DateParts): void {
  const value: DateRangeValue = [
    formatYmd(start.y, start.m, start.d),
    formatYmd(end.y, end.m, end.d),
  ]
  emit('update:modelValue', value)
  emit('change', value)
}

function setRangeFromModel(v: unknown): void {
  const pair = Array.isArray(v) ? v : []
  const start = parseYmd(typeof pair[0] === 'string' ? pair[0] : '')
  const end = parseYmd(typeof pair[1] === 'string' ? pair[1] : '')

  rangeStart.value = start ? clampDate(start, minDate.value, maxDate.value) : null
  rangeEnd.value = end ? clampDate(end, minDate.value, maxDate.value) : null
  rangeHover.value = null
  pickingEnd.value = false

  const anchor = rangeStart.value ?? rangeEnd.value
  if (anchor) {
    calendarMonth.value = { y: anchor.y, m: anchor.m }
    return
  }

  // An empty range still has to open somewhere; `setFromModel` is the single
  // mode's path, so without this the grid sat on the ref's placeholder month.
  const now = new Date()
  const today = clampDate(
    { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() },
    minDate.value,
    maxDate.value,
  )
  calendarMonth.value = { y: today.y, m: today.m }
}

function setFromModel(v: string) {
  const parsed = parseYmd(v)
  const base = parsed ?? (() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
  })()

  const clamped = clampDate(base, minDate.value, maxDate.value)
  localParts.value = clamped
  calendarMonth.value = { y: clamped.y, m: clamped.m }

  // A valid but out-of-bounds value is clamped for display; converge the parent
  // model to the rendered value instead of silently disagreeing with it.
  if (parsed && compareDateParts(clamped, parsed) !== 0)
    emitModel(clamped)
}

watch(
  () => props.modelValue,
  (v) => {
    if (props.range) {
      setRangeFromModel(v)
      return
    }
    setFromModel(typeof v === 'string' ? v : '')
  },
  { immediate: true },
)

watch([minDate, maxDate], () => {
  if (props.range) {
    setRangeFromModel(props.modelValue)
    return
  }
  const clamped = clampDate(localParts.value, minDate.value, maxDate.value)
  const changed = compareDateParts(clamped, localParts.value) !== 0
  localParts.value = clamped
  calendarMonth.value = { y: clamped.y, m: clamped.m }
  // Tightened bounds can pull the current value in-range; keep the parent in sync.
  if (changed)
    emitModel(clamped)
})

const years = computed(() => {
  const minY = minDate.value?.getFullYear() ?? 1970
  const maxY = maxDate.value?.getFullYear() ?? 2100
  const from = Math.min(minY, maxY)
  const to = Math.max(minY, maxY)
  const out: number[] = []
  for (let y = from; y <= to; y++) out.push(y)
  return out
})

const pickerColumns = computed<PickerColumn[]>(() => {
  const { y, m } = localParts.value

  const min = minDate.value
  const max = maxDate.value

  const minY = min?.getFullYear() ?? null
  const minM = min ? min.getMonth() + 1 : null
  const minD = min ? min.getDate() : null

  const maxY = max?.getFullYear() ?? null
  const maxM = max ? max.getMonth() + 1 : null
  const maxD = max ? max.getDate() : null

  const yearOptions = years.value.map(yy => ({
    value: yy,
    label: String(yy),
    disabled: (minY != null && yy < minY) || (maxY != null && yy > maxY),
  }))

  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const mm = i + 1
    const disabled
      = (minY != null && minM != null && y === minY && mm < minM)
        || (maxY != null && maxM != null && y === maxY && mm > maxM)
    return { value: mm, label: pad2(mm), disabled }
  })

  const maxDay = new Date(y, m, 0).getDate()
  const dayOptions = Array.from({ length: maxDay }).map((_, i) => {
    const dd = i + 1
    const disabled
      = (minY != null && minM != null && minD != null && y === minY && m === minM && dd < minD)
        || (maxY != null && maxM != null && maxD != null && y === maxY && m === maxM && dd > maxD)
    return { value: dd, label: pad2(dd), disabled }
  })

  return [
    { key: 'year', options: yearOptions },
    { key: 'month', options: monthOptions },
    { key: 'day', options: dayOptions },
  ]
})

const pickerValue = computed<PickerValue>({
  get: () => [localParts.value.y, localParts.value.m, localParts.value.d],
  set: (v) => {
    const yy = Number(v[0])
    const mm = Number(v[1])
    const dd = Number(v[2])

    const next = clampDate({ y: yy, m: mm, d: dd }, minDate.value, maxDate.value)
    localParts.value = next

    const s = formatYmd(next.y, next.m, next.d)
    emit('update:modelValue', s)
    emit('change', s)
  },
})

const pickerOpen = computed({
  get: () => !!props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

const selectedValue = computed(() => {
  const { y, m, d } = localParts.value
  return formatYmd(y, m, d)
})

const rangeDisplayValue = computed(() => {
  const start = rangeStart.value
  const end = rangeEnd.value
  if (!start || !end)
    return ''
  return [
    formatYmd(start.y, start.m, start.d),
    formatYmd(end.y, end.m, end.d),
  ].join(props.rangeSeparator)
})

const hasFieldValue = computed(() => (props.range
  ? !!rangeDisplayValue.value
  : !!parseYmd(modelString.value)))

const fieldDisplayValue = computed(() => {
  if (!hasFieldValue.value)
    return props.placeholder
  return props.range ? rangeDisplayValue.value : selectedValue.value
})

const fieldOpenInternal = ref(false)

const fieldOpen = computed({
  get: () => !!props.visible || fieldOpenInternal.value,
  set: (v: boolean) => {
    if (props.disabled && v)
      return

    const current = !!props.visible || fieldOpenInternal.value
    fieldOpenInternal.value = v
    emit('update:visible', v)
    if (current === v)
      return
    if (v)
      emit('open')
    else
      emit('close')
  },
})

watch(
  () => props.visible,
  (visible) => {
    fieldOpenInternal.value = !!visible
  },
)

const isDesktopViewport = ref(false)

function syncAdaptiveViewport() {
  if (typeof window === 'undefined') {
    isDesktopViewport.value = false
    return
  }

  isDesktopViewport.value = window.innerWidth >= Math.max(0, props.adaptiveBreakpoint)
}

onMounted(() => {
  syncAdaptiveViewport()
  window.addEventListener('resize', syncAdaptiveViewport)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('resize', syncAdaptiveViewport)
})

watch(
  () => props.adaptiveBreakpoint,
  () => syncAdaptiveViewport(),
)

const resolvedVariant = computed(() => {
  if (props.variant === 'adaptive')
    return isDesktopViewport.value ? 'field' : 'picker'
  return props.variant
})

const weekStart = computed(() => props.weekStartsOn === 1 ? 1 : 0)

const weekdayLabels = computed(() => {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }).map((_, index) => labels[(index + weekStart.value) % 7])
})

function isDateOutsideBounds(parts: DateParts): boolean {
  const min = minDate.value ? toPartsFromDate(minDate.value) : null
  const max = maxDate.value ? toPartsFromDate(maxDate.value) : null

  return Boolean(
    (min && compareDateParts(parts, min) < 0)
    || (max && compareDateParts(parts, max) > 0),
  )
}

/**
 * The pair the grid should paint right now. While the second click is pending
 * the hovered day stands in for the end, so the band follows the pointer; the
 * ends are ordered here so dragging backwards previews correctly.
 */
const effectiveRange = computed<{ start: DateParts, end: DateParts } | null>(() => {
  const start = rangeStart.value
  if (!start)
    return null
  const end = rangeEnd.value ?? (pickingEnd.value ? rangeHover.value : null)
  if (!end)
    return { start, end: start }
  return compareDateParts(start, end) <= 0 ? { start, end } : { start: end, end: start }
})

const calendarCells = computed<CalendarCell[]>(() => {
  const { y, m } = calendarMonth.value
  const firstDay = new Date(y, m - 1, 1).getDay()
  const startOffset = (firstDay - weekStart.value + 7) % 7
  const start = new Date(y, m - 1, 1 - startOffset)
  const today = toPartsFromDate(new Date())
  const span = effectiveRange.value

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
      selected: props.range
        ? isStart || isEnd
        : compareDateParts(parts, localParts.value) === 0,
      today: compareDateParts(parts, today) === 0,
      disabled: isDateOutsideBounds(parts),
      inRange: !!span
        && compareDateParts(parts, span.start) > 0
        && compareDateParts(parts, span.end) < 0,
      rangeStart: props.range && isStart,
      rangeEnd: props.range && isEnd,
    }
  })
})

// ARIA requires every gridcell to be owned by a row, so group the flat 42-cell
// list into weeks of 7 for the role="row" wrappers.
const calendarWeeks = computed<CalendarCell[][]>(() => {
  const weeks: CalendarCell[][] = []
  for (let i = 0; i < calendarCells.value.length; i += 7)
    weeks.push(calendarCells.value.slice(i, i + 7))
  return weeks
})

const calendarTitle = computed(() => {
  const { y, m } = calendarMonth.value
  if (panelView.value === 'month')
    return String(y)
  if (panelView.value === 'year')
    return `${yearBlockStart.value} – ${yearBlockStart.value + YEAR_BLOCK - 1}`
  return `${y}-${pad2(m)}`
})

/** Grids are keyed on this, so a step or a view change swaps a fresh element. */
const panelKey = computed(() => {
  if (panelView.value === 'month')
    return `month-${calendarMonth.value.y}`
  if (panelView.value === 'year')
    return `year-${yearBlockStart.value}`
  return `day-${calendarMonth.value.y}-${calendarMonth.value.m}`
})

function isYearOutsideBounds(year: number): boolean {
  const min = minDate.value
  const max = maxDate.value
  if (min && year < min.getFullYear())
    return true
  if (max && year > max.getFullYear())
    return true
  return false
}

function isMonthOutsideBounds(year: number, month: number): boolean {
  const first = { y: year, m: month, d: 1 }
  const last = { y: year, m: month, d: new Date(year, month, 0).getDate() }
  const min = minDate.value ? toPartsFromDate(minDate.value) : null
  const max = maxDate.value ? toPartsFromDate(maxDate.value) : null

  if (min && compareDateParts(last, min) < 0)
    return true
  if (max && compareDateParts(first, max) > 0)
    return true
  return false
}

const monthCells = computed<PanelCell[]>(() => {
  const year = calendarMonth.value.y
  const today = toPartsFromDate(new Date())
  return Array.from({ length: 12 }).map((_, index) => {
    const month = index + 1
    return {
      key: `${year}-${pad2(month)}`,
      label: pad2(month),
      value: month,
      current: today.y === year && today.m === month,
      selected: calendarMonth.value.m === month,
      disabled: isMonthOutsideBounds(year, month),
    }
  })
})

const yearCells = computed<PanelCell[]>(() => {
  const today = toPartsFromDate(new Date())
  // One year of padding on each side, dimmed, so the block reads as a window
  // onto a longer run of years rather than a hard boundary.
  return Array.from({ length: YEAR_BLOCK + 2 }).map((_, index) => {
    const year = yearBlockStart.value - 1 + index
    return {
      key: `y-${year}`,
      label: String(year),
      value: year,
      current: today.y === year,
      selected: calendarMonth.value.y === year,
      disabled: isYearOutsideBounds(year),
      muted: index === 0 || index === YEAR_BLOCK + 1,
    }
  })
})

function canMoveCalendarMonth(delta: number): boolean {
  const min = minDate.value ? toPartsFromDate(minDate.value) : null
  const max = maxDate.value ? toPartsFromDate(maxDate.value) : null

  if (panelView.value === 'year') {
    const nextStart = yearBlockStart.value + delta * YEAR_BLOCK
    if (delta < 0 && min && nextStart + YEAR_BLOCK - 1 < min.y)
      return false
    if (delta > 0 && max && nextStart > max.y)
      return false
    return true
  }

  if (panelView.value === 'month') {
    const nextYear = calendarMonth.value.y + delta
    if (delta < 0 && min && nextYear < min.y)
      return false
    if (delta > 0 && max && nextYear > max.y)
      return false
    return true
  }

  const next = addMonths(calendarMonth.value, delta)
  const start = { y: next.y, m: next.m, d: 1 }
  const end = { y: next.y, m: next.m, d: new Date(next.y, next.m, 0).getDate() }

  if (delta < 0 && min && compareDateParts(end, min) < 0)
    return false
  if (delta > 0 && max && compareDateParts(start, max) > 0)
    return false
  return true
}

function shiftCalendarMonth(delta: number) {
  if (!canMoveCalendarMonth(delta))
    return

  navDirection.value = delta > 0 ? 'next' : 'prev'

  if (panelView.value === 'year') {
    yearBlockStart.value += delta * YEAR_BLOCK
    return
  }

  if (panelView.value === 'month') {
    calendarMonth.value = { y: calendarMonth.value.y + delta, m: calendarMonth.value.m }
    return
  }

  calendarMonth.value = addMonths(calendarMonth.value, delta)
}

/** The title is the way up: day → month → year. */
function zoomOut() {
  if (props.disabled)
    return
  navDirection.value = 'none'
  if (panelView.value === 'day') {
    panelView.value = 'month'
    return
  }
  if (panelView.value === 'month') {
    yearBlockStart.value = Math.floor(calendarMonth.value.y / YEAR_BLOCK) * YEAR_BLOCK
    panelView.value = 'year'
  }
}

function selectPanelMonth(cell: PanelCell) {
  if (props.disabled || cell.disabled)
    return
  navDirection.value = 'none'
  calendarMonth.value = { y: calendarMonth.value.y, m: cell.value }
  panelView.value = 'day'
}

function selectPanelYear(cell: PanelCell) {
  if (props.disabled || cell.disabled)
    return
  navDirection.value = 'none'
  calendarMonth.value = { y: cell.value, m: calendarMonth.value.m }
  panelView.value = 'month'
}

/**
 * Stepping slides in the direction of travel; changing zoom level has no
 * direction, so it scales instead.
 */
const panelTransition = computed(() => {
  if (navDirection.value === 'next')
    return 'tx-date-slide-next'
  if (navDirection.value === 'prev')
    return 'tx-date-slide-prev'
  return 'tx-date-zoom'
})

function selectCalendarDate(parts: DateParts) {
  if (props.disabled || isDateOutsideBounds(parts))
    return

  const next = clampDate(parts, minDate.value, maxDate.value)

  if (props.range) {
    // The first click anchors the start and arms the preview; the second closes
    // the range. Clicking again on a finished range starts a new one.
    if (!pickingEnd.value) {
      rangeStart.value = next
      rangeEnd.value = null
      rangeHover.value = next
      pickingEnd.value = true
      return
    }

    const start = rangeStart.value ?? next
    const backwards = compareDateParts(start, next) > 0
    const from = backwards ? next : start
    const to = backwards ? start : next

    rangeStart.value = from
    rangeEnd.value = to
    rangeHover.value = null
    pickingEnd.value = false
    emitRange(from, to)
    fieldOpen.value = false
    return
  }

  localParts.value = next
  calendarMonth.value = { y: next.y, m: next.m }
  const value = formatYmd(next.y, next.m, next.d)
  emit('update:modelValue', value)
  emit('change', value)
  fieldOpen.value = false
}

function onCellHover(cell: CalendarCell) {
  if (!props.range || !pickingEnd.value || cell.disabled)
    return
  rangeHover.value = cell.parts
}

// Closing puts the panel back at the day grid, and abandons a half-picked
// range rather than leaving one end armed for the next open.
watch(fieldOpen, (open) => {
  if (open)
    return
  panelView.value = 'day'
  navDirection.value = 'none'
  if (props.range && pickingEnd.value)
    setRangeFromModel(props.modelValue)
})

function onConfirm() {
  const { y, m, d } = localParts.value
  const s = formatYmd(y, m, d)
  emit('confirm', s)
}

function onCancel() {
  emit('cancel')
}
</script>

<template>
  <TxPopover
    v-if="resolvedVariant === 'field'"
    v-model="fieldOpen"
    class="tx-date-picker-popover"
    placement="bottom-start"
    :disabled="disabled"
    :show-arrow="false"
    :max-width="360"
    :min-width="280"
    :panel-padding="0"
    :panel-radius="20"
    :match-reference-width="false"
    reference-full-width
  >
    <template #reference>
      <button
        type="button"
        class="tx-date-picker-field"
        :class="{ 'is-disabled': disabled, 'is-open': fieldOpen }"
        :disabled="disabled"
        :aria-label="title"
      >
        <span class="tx-date-picker-field__value" :class="{ 'is-placeholder': !hasFieldValue }">
          {{ fieldDisplayValue }}
        </span>
        <span class="tx-date-picker-field__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm13 8H4v10h16V10ZM6 6v2h12V6h-1v2h-2V6H9v2H7V6H6Z" />
          </svg>
        </span>
      </button>
    </template>

    <div class="tx-date-picker-calendar" :class="{ 'is-range': isRange }">
      <div class="tx-date-picker-calendar__header">
        <button
          type="button"
          class="tx-date-picker-calendar__nav"
          :disabled="disabled || !canMoveCalendarMonth(-1)"
          :aria-label="`${title} previous`"
          @click="shiftCalendarMonth(-1)"
        >
          ‹
        </button>
        <button
          type="button"
          class="tx-date-picker-calendar__title"
          :class="{ 'is-static': panelView === 'year' }"
          :disabled="disabled || panelView === 'year'"
          :aria-label="`${title} switch view`"
          @click="zoomOut"
        >
          {{ calendarTitle }}
        </button>
        <button
          type="button"
          class="tx-date-picker-calendar__nav"
          :disabled="disabled || !canMoveCalendarMonth(1)"
          :aria-label="`${title} next`"
          @click="shiftCalendarMonth(1)"
        >
          ›
        </button>
      </div>

      <Transition :name="panelTransition" mode="out-in">
        <div :key="panelKey" class="tx-date-picker-calendar__view">
          <template v-if="panelView === 'day'">
            <div class="tx-date-picker-calendar__weekdays" aria-hidden="true">
              <span v-for="weekday in weekdayLabels" :key="weekday">
                {{ weekday }}
              </span>
            </div>

            <div class="tx-date-picker-calendar__grid" role="grid">
              <div
                v-for="(week, weekIndex) in calendarWeeks"
                :key="weekIndex"
                class="tx-date-picker-calendar__row"
                role="row"
              >
                <button
                  v-for="cell in week"
                  :key="cell.key"
                  type="button"
                  class="tx-date-picker-calendar__cell"
                  :class="{
                    'is-outside-month': !cell.inCurrentMonth,
                    'is-selected': cell.selected,
                    'is-today': cell.today,
                    'is-in-range': cell.inRange,
                    'is-range-start': cell.rangeStart,
                    'is-range-end': cell.rangeEnd,
                  }"
                  :disabled="disabled || cell.disabled"
                  :aria-selected="cell.selected"
                  :aria-label="cell.key"
                  role="gridcell"
                  @click="selectCalendarDate(cell.parts)"
                  @mouseenter="onCellHover(cell)"
                >
                  {{ cell.label }}
                </button>
              </div>
            </div>
          </template>

          <div v-else-if="panelView === 'month'" class="tx-date-picker-calendar__tiles" role="grid">
            <button
              v-for="cell in monthCells"
              :key="cell.key"
              type="button"
              class="tx-date-picker-calendar__tile"
              :class="{ 'is-selected': cell.selected, 'is-today': cell.current }"
              :disabled="disabled || cell.disabled"
              :aria-selected="cell.selected"
              role="gridcell"
              @click="selectPanelMonth(cell)"
            >
              {{ cell.label }}
            </button>
          </div>

          <div v-else class="tx-date-picker-calendar__tiles is-years" role="grid">
            <button
              v-for="cell in yearCells"
              :key="cell.key"
              type="button"
              class="tx-date-picker-calendar__tile"
              :class="{ 'is-selected': cell.selected, 'is-today': cell.current, 'is-muted': cell.muted }"
              :disabled="disabled || cell.disabled"
              :aria-selected="cell.selected"
              role="gridcell"
              @click="selectPanelYear(cell)"
            >
              {{ cell.label }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </TxPopover>

  <TxPicker
    v-else
    v-model="pickerValue"
    v-model:visible="pickerOpen"
    :columns="pickerColumns"
    :popup="popup"
    :title="title"
    :disabled="disabled"
    :show-toolbar="showToolbar"
    :confirm-text="confirmText"
    :cancel-text="cancelText"
    :close-on-click-mask="closeOnClickMask"
    @confirm="onConfirm"
    @cancel="onCancel"
    @open="$emit('open')"
    @close="$emit('close')"
  />
</template>

<style scoped lang="scss">
.tx-date-picker-popover {
  width: 100%;
}

.tx-date-picker-field {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 14px;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #fff);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.tx-date-picker-field:hover:not(.is-disabled),
.tx-date-picker-field.is-open {
  border-color: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.tx-date-picker-field.is-disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.tx-date-picker-field__value {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-date-picker-field__value.is-placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-field__icon {
  display: inline-flex;
  color: var(--tx-text-color-secondary, #606266);
}

// The panel sizes to this calendar rather than to the field (`matchReferenceWidth`
// is off): a month grid's width has nothing to do with how wide the input is, and
// matching a narrow field cut the last weekday column off the panel's edge.
// `max-width` is the backstop for a host that pins the panel narrower anyway —
// the 7 columns are `minmax(0, 1fr)`, so they compress instead of overflowing.
.tx-date-picker-calendar {
  width: min(336px, calc(100vw - 28px));
  max-width: 100%;
  padding: 14px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--tx-color-primary, #409eff) 13%, transparent), transparent 34%),
    var(--tx-bg-color, #fff);
}

.tx-date-picker-calendar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.tx-date-picker-calendar__title {
  padding: 4px 10px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.16s ease;
}

.tx-date-picker-calendar__title:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

// At the top zoom level there is nowhere further to go, so the title stops
// advertising itself as a control.
.tx-date-picker-calendar__title.is-static {
  cursor: default;
  opacity: 1;
}

.tx-date-picker-calendar__view {
  display: flex;
  flex-direction: column;
}

.tx-date-picker-calendar__nav {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 11px;
  color: var(--tx-text-color-primary, #303133);
  background: color-mix(in srgb, var(--tx-fill-color, #f5f7fa) 86%, transparent);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.tx-date-picker-calendar__nav:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.tx-date-picker-calendar__weekdays,
.tx-date-picker-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

// The ARIA row wrappers must not disturb the 7-column grid: `display: contents`
// keeps each week's cells as direct grid items while still exposing role="row".
.tx-date-picker-calendar__row {
  display: contents;
}

.tx-date-picker-calendar__weekdays {
  margin-bottom: 6px;
  color: var(--tx-text-color-secondary, #606266);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.tx-date-picker-calendar__cell {
  min-width: 0;
  aspect-ratio: 1;
  border: 0;
  border-radius: 12px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, box-shadow 0.16s;
}

// `:hover` on its own outranks `.is-selected`, so hovering the selected day
// used to swap its fill for the faint hover tint and the selection vanished
// under the pointer. Selected days get their own, deeper hover instead.
.tx-date-picker-calendar__cell:hover:not(:disabled):not(.is-selected) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 11%, transparent);
}

.tx-date-picker-calendar__cell.is-outside-month {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__cell.is-today:not(.is-selected) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.tx-date-picker-calendar__cell.is-selected {
  color: var(--tx-color-on-primary, #fff);
  background: linear-gradient(135deg, var(--tx-color-primary, #409eff), color-mix(in srgb, var(--tx-color-primary, #409eff) 72%, #111827));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
  // Landing on a day is the moment the picker answers, so the cell settles
  // into place rather than appearing fully formed.
  animation: tx-date-pick 260ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-date-picker-calendar__cell.is-selected:hover:not(:disabled) {
  box-shadow: 0 10px 22px color-mix(in srgb, var(--tx-color-primary, #409eff) 40%, transparent);
}

@keyframes tx-date-pick {
  0% {
    transform: scale(0.82);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
  }

  60% {
    transform: scale(1.06);
  }

  100% {
    transform: scale(1);
  }
}

// The band between the ends. It is a square-cornered fill so consecutive days
// read as one continuous stretch, with the ends rounding it off.
.tx-date-picker-calendar__cell.is-in-range {
  border-radius: 0;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.tx-date-picker-calendar__cell.is-in-range.is-outside-month {
  color: color-mix(in srgb, var(--tx-text-color-primary, #303133) 55%, transparent);
}

.tx-date-picker-calendar__cell.is-range-start:not(.is-range-end) {
  border-radius: 12px 0 0 12px;
}

.tx-date-picker-calendar__cell.is-range-end:not(.is-range-start) {
  border-radius: 0 12px 12px 0;
}

// The row gap would otherwise cut the band into separate pills.
.tx-date-picker-calendar.is-range .tx-date-picker-calendar__grid {
  column-gap: 0;
}

.tx-date-picker-calendar.is-range .tx-date-picker-calendar__cell {
  width: 100%;
}

.tx-date-picker-calendar__cell:disabled {
  cursor: not-allowed;
  opacity: 0.34;
}

.tx-date-picker-calendar__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding-top: 2px;
}

.tx-date-picker-calendar__tiles.is-years {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tx-date-picker-calendar__tile {
  min-width: 0;
  padding: 12px 0;
  border: 0;
  border-radius: 12px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, box-shadow 0.16s;
}

.tx-date-picker-calendar__tile:hover:not(:disabled):not(.is-selected) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 11%, transparent);
}

.tx-date-picker-calendar__tile.is-muted {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__tile.is-today:not(.is-selected) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.tx-date-picker-calendar__tile.is-selected {
  color: var(--tx-color-on-primary, #fff);
  background: linear-gradient(135deg, var(--tx-color-primary, #409eff), color-mix(in srgb, var(--tx-color-primary, #409eff) 72%, #111827));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
}

.tx-date-picker-calendar__tile:disabled {
  cursor: not-allowed;
  opacity: 0.34;
}

// Stepping a month or a year block travels sideways; changing zoom level has
// no direction, so it scales in place.
.tx-date-slide-next-enter-active,
.tx-date-slide-prev-enter-active,
.tx-date-zoom-enter-active {
  transition: opacity 160ms ease, transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-date-slide-next-leave-active,
.tx-date-slide-prev-leave-active,
.tx-date-zoom-leave-active {
  transition: opacity 110ms ease, transform 110ms ease;
}

.tx-date-slide-next-enter-from {
  opacity: 0;
  transform: translateX(14px);
}

.tx-date-slide-next-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.tx-date-slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-14px);
}

.tx-date-slide-prev-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.tx-date-zoom-enter-from {
  opacity: 0;
  transform: scale(0.94);
}

.tx-date-zoom-leave-to {
  opacity: 0;
  transform: scale(1.04);
}

@media (prefers-reduced-motion: reduce) {
  .tx-date-picker-calendar__cell.is-selected {
    animation: none;
  }

  .tx-date-slide-next-enter-active,
  .tx-date-slide-prev-enter-active,
  .tx-date-zoom-enter-active,
  .tx-date-slide-next-leave-active,
  .tx-date-slide-prev-leave-active,
  .tx-date-zoom-leave-active {
    transition: opacity 90ms ease;
  }

  .tx-date-slide-next-enter-from,
  .tx-date-slide-prev-enter-from,
  .tx-date-zoom-enter-from,
  .tx-date-slide-next-leave-to,
  .tx-date-slide-prev-leave-to,
  .tx-date-zoom-leave-to {
    transform: none;
  }
}

@media (max-width: 520px) {
  .tx-date-picker-calendar {
    width: min(100vw - 20px, 360px);
    padding: 12px;
  }

  .tx-date-picker-calendar__cell {
    border-radius: 10px;
    font-size: 12px;
  }
}
</style>
