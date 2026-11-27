<script setup lang="ts">
import type { BaseAnchorAnimationOptions } from '../../base-anchor/src/types'
import type { PickerColumn, PickerValue } from '../../picker/src/types'
import type {
  DatePickerEmits,
  DatePickerMode,
  DatePickerPanelView,
  DatePickerPreset,
  DatePickerProps,
  DatePickerValue,
  DateRangeValue,
} from './types'
import type { CalendarCell, DateParts, DateTimeParts, PanelCell, TimeParts } from './utils'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMorphWindow } from '../../../../utils/use-morph-window'
import TxPicker from '../../picker/src/TxPicker.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import {
  addMonths,
  buildCalendarCells,
  buildDateWheelColumns,
  buildMonthCells,
  buildTimePickerColumns,
  buildYearCells,
  canMoveCalendarView,
  clampDate,
  clampDateTime,
  clampTime,
  compareDateParts,
  compareDateTimeParts,
  formatDateTime,
  formatTime,
  formatYmd,
  isDateOutsideBounds as checkDateOutsideBounds,
  normalizeStep,
  nowDateTimeParts,
  pad2,
  parseDateTime,
  parseTime,
  parseYmd,
  snapToStep,
  toDateObj,
  YEAR_BLOCK,
} from './utils'

defineOptions({ name: 'TxDatePicker' })

const props = withDefaults(defineProps<DatePickerProps>(), {
  modelValue: '',
  visible: false,
  popup: true,
  variant: 'picker',
  mode: 'date',
  title: 'Select date',
  placeholder: undefined,
  disabled: false,
  clearable: false,
  showToolbar: true,
  showSeconds: false,
  minuteStep: 1,
  secondStep: 1,
  presets: undefined,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  todayText: 'Today',
  nowText: 'Now',
  startPlaceholder: 'Start',
  endPlaceholder: 'End',
  timeLabel: 'Time',
  closeOnClickMask: true,
  adaptiveBreakpoint: 768,
  weekStartsOn: 0,
  range: false,
  rangeSeparator: ' → ',
})

const emit = defineEmits<DatePickerEmits>()

const resolvedMode = computed<DatePickerMode>(() => {
  if (props.mode && props.mode !== 'date') {
    if (props.range && props.mode === 'datetime')
      return 'datetimerange'
    return props.mode
  }
  return props.range ? 'daterange' : 'date'
})

const isRangeMode = computed(() =>
  resolvedMode.value === 'daterange' || resolvedMode.value === 'datetimerange',
)
const hasDate = computed(() => resolvedMode.value !== 'time')
const hasTime = computed(() =>
  resolvedMode.value === 'time'
  || resolvedMode.value === 'datetime'
  || resolvedMode.value === 'datetimerange',
)

const resolvedMinuteStep = computed(() => normalizeStep(props.minuteStep, 59))
const resolvedSecondStep = computed(() => normalizeStep(props.secondStep, 59))

const minDate = computed(() => {
  const p = parseYmd(props.min || '')
  return p ? toDateObj(p) : null
})

const maxDate = computed(() => {
  const p = parseYmd(props.max || '')
  return p ? toDateObj(p) : null
})

const minTime = computed<TimeParts | null>(() => {
  if (resolvedMode.value === 'time')
    return parseTime(props.min || '')
  return null
})

const maxTime = computed<TimeParts | null>(() => {
  if (resolvedMode.value === 'time')
    return parseTime(props.max || '')
  return null
})

const minDateTime = computed<DateTimeParts | null>(() => {
  if (resolvedMode.value === 'datetime' || resolvedMode.value === 'datetimerange')
    return parseDateTime(props.min || '')
  return null
})

const maxDateTime = computed<DateTimeParts | null>(() => {
  if (resolvedMode.value === 'datetime' || resolvedMode.value === 'datetimerange') {
    const parsed = parseDateTime(props.max || '')
    if (!parsed)
      return null
    // If caller supplied date-only max like "2026-06-20", include the full day.
    if ((props.max || '').trim().length <= 10)
      return { ...parsed, h: 23, min: 59, s: 59 }
    return parsed
  }
  return null
})

const localParts = ref<DateTimeParts>({ y: 2025, m: 1, d: 1, h: 0, min: 0, s: 0 })
const draftParts = ref<DateTimeParts>({ y: 2025, m: 1, d: 1, h: 0, min: 0, s: 0 })
const calendarMonth = ref<Pick<DateParts, 'y' | 'm'>>({ y: 2025, m: 1 })

/** Which grid the field calendar shows, and which way the last move went. */
const panelView = ref<DatePickerPanelView>('day')
const navDirection = ref<'next' | 'prev' | 'none'>('none')
const yearBlockStart = ref(2020)

const rangeStart = ref<DateTimeParts | null>(null)
const rangeEnd = ref<DateTimeParts | null>(null)
/** The end being previewed under the pointer while the second click is pending. */
const rangeHover = ref<DateParts | null>(null)
const pickingEnd = ref(false)
const activeRangeSlot = ref<'start' | 'end'>('start')

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

/** The wheel picker has no range surface, so range only applies to the calendar. */
const isRange = computed(() => isRangeMode.value && resolvedVariant.value === 'field')

const modelString = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))

function snapTimeParts(t: TimeParts): TimeParts {
  return {
    h: Math.min(23, Math.max(0, t.h)),
    min: snapToStep(t.min, resolvedMinuteStep.value, 59),
    s: props.showSeconds ? snapToStep(t.s, resolvedSecondStep.value, 59) : 0,
  }
}

function formatSingleValue(parts: DateTimeParts): string {
  if (resolvedMode.value === 'time')
    return formatTime(parts, props.showSeconds)
  if (resolvedMode.value === 'datetime')
    return formatDateTime(parts, props.showSeconds)
  return formatYmd(parts.y, parts.m, parts.d)
}

function formatEndpoint(parts: DateTimeParts): string {
  if (resolvedMode.value === 'datetimerange')
    return formatDateTime(parts, props.showSeconds)
  return formatYmd(parts.y, parts.m, parts.d)
}

function emitSingleModel(parts: DateTimeParts): void {
  const s = formatSingleValue(parts)
  emit('update:modelValue', s)
  emit('change', s)
}

function emitRangeModel(start: DateTimeParts, end: DateTimeParts): void {
  const value: DateRangeValue = [formatEndpoint(start), formatEndpoint(end)]
  emit('update:modelValue', value)
  emit('change', value)
}

function clampSingleByMode(parts: DateTimeParts): DateTimeParts {
  if (resolvedMode.value === 'time') {
    const clamped = clampTime(snapTimeParts(parts), minTime.value, maxTime.value)
    return { ...parts, ...clamped }
  }
  if (resolvedMode.value === 'datetime' || resolvedMode.value === 'datetimerange') {
    const snapped: DateTimeParts = { ...parts, ...snapTimeParts(parts) }
    return clampDateTime(snapped, minDateTime.value, maxDateTime.value)
  }
  const d = clampDate(parts, minDate.value, maxDate.value)
  return { ...parts, ...d }
}

function setRangeFromModel(v: unknown): void {
  const pair = Array.isArray(v) ? v : []
  const rawStart = typeof pair[0] === 'string' ? pair[0] : ''
  const rawEnd = typeof pair[1] === 'string' ? pair[1] : ''

  const parsedStart = resolvedMode.value === 'datetimerange'
    ? parseDateTime(rawStart)
    : (() => {
        const d = parseYmd(rawStart)
        return d ? { ...d, h: 0, min: 0, s: 0 } : null
      })()

  const parsedEnd = resolvedMode.value === 'datetimerange'
    ? parseDateTime(rawEnd)
    : (() => {
        const d = parseYmd(rawEnd)
        return d ? { ...d, h: 23, min: 59, s: 0 } : null
      })()

  rangeStart.value = parsedStart ? clampSingleByMode(parsedStart) : null
  rangeEnd.value = parsedEnd ? clampSingleByMode(parsedEnd) : null
  rangeHover.value = null
  pickingEnd.value = false
  activeRangeSlot.value = 'start'

  const anchor = rangeStart.value ?? rangeEnd.value
  if (anchor) {
    calendarMonth.value = { y: anchor.y, m: anchor.m }
    return
  }

  // An empty range still has to open somewhere; `setFromModel` is the single
  // mode's path, so without this the grid sat on the ref's placeholder month.
  const today = clampDate(nowDateTimeParts(), minDate.value, maxDate.value)
  calendarMonth.value = { y: today.y, m: today.m }
}

function setFromModel(v: string) {
  const now = nowDateTimeParts()

  if (resolvedMode.value === 'time') {
    const parsed = parseTime(v)
    const base: DateTimeParts = parsed
      ? { ...now, ...parsed }
      : { ...now, ...snapTimeParts(now) }
    const clamped = clampSingleByMode(base)
    localParts.value = clamped
    draftParts.value = { ...clamped }
    if (parsed && (clamped.h !== parsed.h || clamped.min !== parsed.min || (props.showSeconds && clamped.s !== parsed.s)))
      emitSingleModel(clamped)
    return
  }

  if (resolvedMode.value === 'datetime') {
    const parsed = parseDateTime(v)
    const base = parsed ?? { ...now, ...snapTimeParts(now) }
    const clamped = clampSingleByMode(base)
    localParts.value = clamped
    draftParts.value = { ...clamped }
    calendarMonth.value = { y: clamped.y, m: clamped.m }
    if (parsed && compareDateTimeParts(clamped, parsed) !== 0)
      emitSingleModel(clamped)
    return
  }

  const parsed = parseYmd(v)
  const base: DateTimeParts = parsed
    ? { ...parsed, h: 0, min: 0, s: 0 }
    : { ...now, h: 0, min: 0, s: 0 }
  const clamped = clampSingleByMode(base)
  localParts.value = clamped
  draftParts.value = { ...clamped }
  calendarMonth.value = { y: clamped.y, m: clamped.m }

  // A valid but out-of-bounds value is clamped for display; converge the parent
  // model to the rendered value instead of silently disagreeing with it.
  if (parsed && compareDateParts(clamped, parsed) !== 0)
    emitSingleModel(clamped)
}

watch(
  [() => props.modelValue, resolvedMode],
  ([v]) => {
    if (isRangeMode.value) {
      setRangeFromModel(v)
      return
    }
    setFromModel(typeof v === 'string' ? v : '')
  },
  { immediate: true },
)

watch([minDate, maxDate, minTime, maxTime, minDateTime, maxDateTime], () => {
  if (isRangeMode.value) {
    setRangeFromModel(props.modelValue)
    return
  }
  const clamped = clampSingleByMode(localParts.value)
  const changed = resolvedMode.value === 'date'
    ? compareDateParts(clamped, localParts.value) !== 0
    : compareDateTimeParts(clamped, localParts.value) !== 0
  localParts.value = clamped
  draftParts.value = { ...clamped }
  calendarMonth.value = { y: clamped.y, m: clamped.m }
  // Tightened bounds can pull the current value in-range; keep the parent in sync.
  if (changed)
    emitSingleModel(clamped)
})

const currentEditedTime = computed<TimeParts>(() => {
  if (resolvedMode.value === 'datetimerange') {
    const slot = activeRangeSlot.value === 'end'
      ? (rangeEnd.value ?? rangeStart.value)
      : (rangeStart.value ?? rangeEnd.value)
    if (slot)
      return { h: slot.h, min: slot.min, s: slot.s }
    return activeRangeSlot.value === 'end'
      ? { h: 23, min: snapToStep(59, resolvedMinuteStep.value, 59), s: 0 }
      : { h: 0, min: 0, s: 0 }
  }
  const src = resolvedVariant.value === 'field' ? draftParts.value : localParts.value
  return { h: src.h, min: src.min, s: src.s }
})

function buildTimeCols(refDate: DateParts | null): PickerColumn[] {
  const hasTimeBounds = Boolean(minTime.value || maxTime.value || minDateTime.value || maxDateTime.value)
  return buildTimePickerColumns({
    mode: resolvedMode.value,
    refDate,
    activeTime: hasTimeBounds ? currentEditedTime.value : { h: 0, min: 0, s: 0 },
    showSeconds: props.showSeconds,
    minuteStep: resolvedMinuteStep.value,
    secondStep: resolvedSecondStep.value,
    minTime: minTime.value,
    maxTime: maxTime.value,
    minDateTime: minDateTime.value,
    maxDateTime: maxDateTime.value,
  })
}

const timePickerColumns = computed<PickerColumn[]>(() => {
  if (resolvedMode.value === 'time')
    return buildTimeCols(null)
  if (resolvedMode.value === 'datetimerange') {
    const slot = activeRangeSlot.value === 'end' ? rangeEnd.value : rangeStart.value
    return buildTimeCols(slot)
  }
  return buildTimeCols(draftParts.value)
})

const activeTimePickerValue = computed<PickerValue>(() => {
  const t = currentEditedTime.value
  return props.showSeconds ? [t.h, t.min, t.s] : [t.h, t.min]
})

function onTimePickerChange(v: PickerValue) {
  const h = Number(v[0] ?? 0)
  const min = Number(v[1] ?? 0)
  const s = props.showSeconds ? Number(v[2] ?? 0) : 0

  if (resolvedMode.value === 'datetimerange') {
    const targetRef = activeRangeSlot.value === 'end' ? rangeEnd : rangeStart
    if (!targetRef.value) {
      const baseDate = clampDate(nowDateTimeParts(), minDate.value, maxDate.value)
      targetRef.value = clampSingleByMode({ ...baseDate, h, min, s })
    }
    else {
      targetRef.value = clampSingleByMode({ ...targetRef.value, h, min, s })
    }
    return
  }

  draftParts.value = clampSingleByMode({ ...draftParts.value, h, min, s })
}

const pickerColumns = computed<PickerColumn[]>(() => {
  if (resolvedMode.value === 'time')
    return buildTimeCols(null)
  const dateCols = buildDateWheelColumns({
    parts: localParts.value,
    minDate: minDate.value,
    maxDate: maxDate.value,
  })
  return resolvedMode.value === 'datetime'
    ? [...dateCols, ...buildTimeCols(localParts.value)]
    : dateCols
})

const pickerValue = computed<PickerValue>({
  get: () => {
    const p = localParts.value
    if (resolvedMode.value === 'time')
      return props.showSeconds ? [p.h, p.min, p.s] : [p.h, p.min]
    if (resolvedMode.value === 'datetime')
      return props.showSeconds ? [p.y, p.m, p.d, p.h, p.min, p.s] : [p.y, p.m, p.d, p.h, p.min]
    return [p.y, p.m, p.d]
  },
  set: (v) => {
    if (resolvedMode.value === 'time') {
      const next = clampSingleByMode({
        ...localParts.value,
        h: Number(v[0] ?? 0),
        min: Number(v[1] ?? 0),
        s: props.showSeconds ? Number(v[2] ?? 0) : 0,
      })
      localParts.value = next
      draftParts.value = { ...next }
      emitSingleModel(next)
      return
    }

    const next = clampSingleByMode({
      y: Number(v[0]),
      m: Number(v[1]),
      d: Number(v[2]),
      h: resolvedMode.value === 'datetime' ? Number(v[3] ?? 0) : localParts.value.h,
      min: resolvedMode.value === 'datetime' ? Number(v[4] ?? 0) : localParts.value.min,
      s: resolvedMode.value === 'datetime' && props.showSeconds ? Number(v[5] ?? 0) : localParts.value.s,
    })
    localParts.value = next
    draftParts.value = { ...next }
    emitSingleModel(next)
  },
})

const pickerOpen = computed({
  get: () => !!props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

const selectedValue = computed(() => formatSingleValue(localParts.value))

const rangeDisplayValue = computed(() => {
  const start = rangeStart.value
  const end = rangeEnd.value
  if (!start || !end)
    return ''
  return [formatEndpoint(start), formatEndpoint(end)].join(props.rangeSeparator)
})

const hasFieldValue = computed(() => {
  if (isRangeMode.value)
    return !!rangeDisplayValue.value
  if (resolvedMode.value === 'time')
    return !!parseTime(modelString.value)
  if (resolvedMode.value === 'datetime')
    return !!parseDateTime(modelString.value)
  return !!parseYmd(modelString.value)
})

const resolvedPlaceholder = computed(() => {
  if (props.placeholder !== undefined)
    return props.placeholder
  if (resolvedMode.value === 'time')
    return 'Select time'
  if (resolvedMode.value === 'datetime')
    return 'Select date & time'
  if (resolvedMode.value === 'daterange')
    return `${props.startPlaceholder}${props.rangeSeparator}${props.endPlaceholder}`
  if (resolvedMode.value === 'datetimerange')
    return `${props.startPlaceholder}${props.rangeSeparator}${props.endPlaceholder}`
  return 'Select date'
})

const fieldDisplayValue = computed(() => {
  if (!hasFieldValue.value)
    return resolvedPlaceholder.value
  return isRangeMode.value ? rangeDisplayValue.value : selectedValue.value
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

// Opening eases the field's border; a hover repaints it at once.
const fieldMorphing = useMorphWindow(fieldOpen, 200)
// A pick eases the day it lands on. Hovering for a range's far end moves the
// preview band with the pointer, so that repaints at once.
const dayMorphing = useMorphWindow(() => [localParts.value, draftParts.value, rangeStart.value, rangeEnd.value], 160)

/**
 * Crisp, non-rubbery popover motion tuned for dense form pickers: fast attack
 * with a clean ease-out settle and snappy exit, avoiding the taller menu's
 * underdamped height bounce.
 */
const popoverAnimation: BaseAnchorAnimationOptions = {
  type: 'expand',
  duration: 240,
  closeDuration: 150,
  ease: 'power3.out',
  closeEase: 'power2.in',
  scale: 0.96,
  distance: 6,
}

const popoverMinWidth = computed(() => {
  if (resolvedMode.value === 'time')
    return 224
  return 280
})

const popoverMaxWidth = computed(() => {
  if (resolvedMode.value === 'time')
    return 280
  if (hasDate.value && hasTime.value)
    return props.showSeconds ? 512 : 472
  return 360
})

const weekStart = computed<0 | 1>(() => (props.weekStartsOn === 1 ? 1 : 0))

const weekdayLabels = computed(() => {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }).map((_, index) => labels[(index + weekStart.value) % 7])
})

function isDateOutsideBounds(parts: DateParts): boolean {
  return checkDateOutsideBounds(parts, minDate.value, maxDate.value)
}

const effectiveRange = computed<{ start: DateParts, end: DateParts } | null>(() => {
  const start = rangeStart.value
  if (!start)
    return null
  const end = rangeEnd.value ?? (pickingEnd.value ? rangeHover.value : null)
  if (!end)
    return { start, end: start }
  return compareDateParts(start, end) <= 0 ? { start, end } : { start: end, end: start }
})

const activeSingleDate = computed<DateParts>(() =>
  resolvedMode.value === 'datetime' ? draftParts.value : localParts.value,
)

const calendarCells = computed<CalendarCell[]>(() =>
  buildCalendarCells({
    month: calendarMonth.value,
    weekStart: weekStart.value,
    isRangeMode: isRangeMode.value,
    activeDate: activeSingleDate.value,
    span: effectiveRange.value,
    minDate: minDate.value,
    maxDate: maxDate.value,
  }),
)

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

const panelKey = computed(() => {
  if (panelView.value === 'month')
    return `month-${calendarMonth.value.y}`
  if (panelView.value === 'year')
    return `year-${yearBlockStart.value}`
  return `day-${calendarMonth.value.y}-${calendarMonth.value.m}`
})

const monthCells = computed<PanelCell[]>(() =>
  buildMonthCells(calendarMonth.value, minDate.value, maxDate.value),
)

const yearCells = computed<PanelCell[]>(() =>
  buildYearCells(yearBlockStart.value, calendarMonth.value.y, minDate.value, maxDate.value),
)

function canMoveCalendarMonth(delta: number): boolean {
  return canMoveCalendarView({
    panelView: panelView.value,
    month: calendarMonth.value,
    yearBlockStart: yearBlockStart.value,
    delta,
    minDate: minDate.value,
    maxDate: maxDate.value,
  })
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

  const nextDate = clampDate(parts, minDate.value, maxDate.value)

  if (isRangeMode.value) {
    // The first click anchors the start and arms the preview; the second closes
    // the range. Clicking again on a finished range starts a new one.
    if (!pickingEnd.value) {
      const prevStart = rangeStart.value
      const startTime: TimeParts = prevStart
        ? { h: prevStart.h, min: prevStart.min, s: prevStart.s }
        : { h: 0, min: 0, s: 0 }
      rangeStart.value = clampSingleByMode({ ...nextDate, ...startTime })
      rangeEnd.value = null
      rangeHover.value = nextDate
      pickingEnd.value = true
      activeRangeSlot.value = 'end'
      return
    }

    const start = rangeStart.value ?? clampSingleByMode({ ...nextDate, h: 0, min: 0, s: 0 })
    const endTime: TimeParts = resolvedMode.value === 'datetimerange'
      ? { h: 23, min: snapToStep(59, resolvedMinuteStep.value, 59), s: 0 }
      : { h: 0, min: 0, s: 0 }
    const endCandidate = clampSingleByMode({ ...nextDate, ...endTime })

    const backwards = compareDateParts(start, endCandidate) > 0
    const from: DateTimeParts = backwards
      ? { ...endCandidate, h: start.h, min: start.min, s: start.s }
      : start
    const to: DateTimeParts = backwards
      ? { ...start, h: endCandidate.h, min: endCandidate.min, s: endCandidate.s }
      : endCandidate

    rangeStart.value = clampSingleByMode(from)
    rangeEnd.value = clampSingleByMode(to)
    rangeHover.value = null
    pickingEnd.value = false

    if (resolvedMode.value === 'datetimerange') {
      activeRangeSlot.value = 'end'
      return
    }

    emitRangeModel(rangeStart.value, rangeEnd.value)
    fieldOpen.value = false
    return
  }

  if (resolvedMode.value === 'datetime') {
    draftParts.value = clampSingleByMode({
      ...draftParts.value,
      ...nextDate,
    })
    calendarMonth.value = { y: nextDate.y, m: nextDate.m }
    return
  }

  const next = clampSingleByMode({ ...localParts.value, ...nextDate })
  localParts.value = next
  draftParts.value = { ...next }
  calendarMonth.value = { y: next.y, m: next.m }
  emitSingleModel(next)
  fieldOpen.value = false
}

function onCellHover(cell: CalendarCell) {
  if (!isRangeMode.value || !pickingEnd.value || cell.disabled)
    return
  rangeHover.value = cell.parts
}

function onSelectNowOrToday() {
  if (props.disabled)
    return
  const now = nowDateTimeParts()
  const clamped = clampSingleByMode({ ...now, ...snapTimeParts(now) })

  if (resolvedMode.value === 'date') {
    localParts.value = clamped
    draftParts.value = { ...clamped }
    calendarMonth.value = { y: clamped.y, m: clamped.m }
    panelView.value = 'day'
    emitSingleModel(clamped)
    fieldOpen.value = false
    return
  }

  if (resolvedMode.value === 'time' || resolvedMode.value === 'datetime') {
    draftParts.value = clamped
    if (resolvedMode.value === 'datetime') {
      calendarMonth.value = { y: clamped.y, m: clamped.m }
      panelView.value = 'day'
    }
    return
  }

  if (resolvedMode.value === 'datetimerange') {
    if (activeRangeSlot.value === 'end')
      rangeEnd.value = clamped
    else
      rangeStart.value = clamped
    calendarMonth.value = { y: clamped.y, m: clamped.m }
    panelView.value = 'day'
  }
}

const canConfirmField = computed(() => {
  if (resolvedMode.value === 'datetimerange')
    return Boolean(rangeStart.value && rangeEnd.value)
  return true
})

function onFieldConfirm() {
  if (props.disabled || !canConfirmField.value)
    return

  if (resolvedMode.value === 'datetimerange') {
    if (!rangeStart.value || !rangeEnd.value)
      return
    const ordered = compareDateTimeParts(rangeStart.value, rangeEnd.value) <= 0
      ? [rangeStart.value, rangeEnd.value] as const
      : [rangeEnd.value, rangeStart.value] as const
    rangeStart.value = ordered[0]
    rangeEnd.value = ordered[1]
    const pair: DateRangeValue = [formatEndpoint(ordered[0]), formatEndpoint(ordered[1])]
    emit('update:modelValue', pair)
    emit('change', pair)
    emit('confirm', pair)
    fieldOpen.value = false
    return
  }

  const next = clampSingleByMode(draftParts.value)
  localParts.value = next
  draftParts.value = { ...next }
  const s = formatSingleValue(next)
  emit('update:modelValue', s)
  emit('change', s)
  emit('confirm', s)
  fieldOpen.value = false
}

function applyPreset(preset: DatePickerPreset) {
  if (props.disabled)
    return
  const resolved: DatePickerValue = typeof preset.value === 'function' ? preset.value() : preset.value

  if (isRangeMode.value) {
    if (!Array.isArray(resolved) || resolved.length < 2)
      return
    setRangeFromModel(resolved)
    if (rangeStart.value && rangeEnd.value) {
      const pair: DateRangeValue = [formatEndpoint(rangeStart.value), formatEndpoint(rangeEnd.value)]
      emit('update:modelValue', pair)
      emit('change', pair)
      emit('confirm', pair)
      fieldOpen.value = false
    }
    return
  }

  if (typeof resolved !== 'string')
    return
  setFromModel(resolved)
  const s = formatSingleValue(localParts.value)
  emit('update:modelValue', s)
  emit('change', s)
  emit('confirm', s)
  fieldOpen.value = false
}

function onClearField() {
  if (props.disabled)
    return
  if (isRangeMode.value) {
    rangeStart.value = null
    rangeEnd.value = null
    rangeHover.value = null
    pickingEnd.value = false
    emit('update:modelValue', ['', ''])
    emit('change', ['', ''])
    return
  }
  emit('update:modelValue', '')
  emit('change', '')
}

// Closing puts the panel back at the day grid, and abandons a half-picked
// range or uncommitted time draft rather than leaving stale state for the next open.
watch(fieldOpen, (open) => {
  if (open) {
    draftParts.value = { ...localParts.value }
    return
  }
  panelView.value = 'day'
  navDirection.value = 'none'
  if (isRangeMode.value) {
    if (pickingEnd.value || resolvedMode.value === 'datetimerange')
      setRangeFromModel(props.modelValue)
  }
  else if (hasTime.value) {
    draftParts.value = { ...localParts.value }
  }
})

function onConfirm() {
  const s = formatSingleValue(localParts.value)
  emit('confirm', s)
}

function onCancel() {
  emit('cancel')
}

const rangeStartLabel = computed(() =>
  rangeStart.value ? formatEndpoint(rangeStart.value) : props.startPlaceholder,
)
const rangeEndLabel = computed(() =>
  rangeEnd.value ? formatEndpoint(rangeEnd.value) : props.endPlaceholder,
)
const editedTimeSummary = computed(() =>
  formatTime(currentEditedTime.value, props.showSeconds),
)
const showPanelFooter = computed(() =>
  resolvedMode.value === 'date'
  || resolvedMode.value === 'time'
  || resolvedMode.value === 'datetime'
  || resolvedMode.value === 'datetimerange',
)
</script>

<template>
  <TxPopover
    v-if="resolvedVariant === 'field'"
    v-model="fieldOpen"
    class="tx-date-picker-popover"
    placement="bottom-start"
    :disabled="disabled"
    :show-arrow="false"
    :animation="popoverAnimation"
    panel-background="blur"
    panel-shadow="medium"
    :max-width="popoverMaxWidth"
    :min-width="popoverMinWidth"
    :panel-padding="0"
    :panel-radius="16"
    :match-reference-width="false"
    reference-full-width
  >
    <template #reference>
      <button
        type="button"
        class="tx-date-picker-field"
        :class="{ 'is-disabled': disabled, 'is-open': fieldOpen, 'is-morphing': fieldMorphing }"
        :disabled="disabled"
        :aria-label="title"
      >
        <span class="tx-date-picker-field__value" :class="{ 'is-placeholder': !hasFieldValue }">
          {{ fieldDisplayValue }}
        </span>
        <span class="tx-date-picker-field__suffix">
          <span
            v-if="clearable && hasFieldValue && !disabled"
            role="button"
            tabindex="-1"
            class="tx-date-picker-field__clear"
            aria-label="Clear"
            @click.stop.prevent="onClearField"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          <span class="tx-date-picker-field__icon" aria-hidden="true">
            <svg v-if="resolvedMode === 'time'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
              <path d="M8 2.5v3M16 2.5v3M3 9.5h18" />
            </svg>
          </span>
        </span>
      </button>
    </template>

    <div
      class="tx-date-picker-calendar"
      :class="{
        'is-range': isRange,
        'is-morphing': dayMorphing,
        'is-time-only': resolvedMode === 'time',
        'is-split': hasDate && hasTime,
      }"
    >
      <div v-if="isRangeMode" class="tx-date-picker-calendar__range-bar">
        <button
          type="button"
          class="tx-date-picker-calendar__range-pill"
          :class="{ 'is-active': !pickingEnd && activeRangeSlot === 'start', 'is-placeholder': !rangeStart }"
          @click="activeRangeSlot = 'start'"
        >
          {{ rangeStartLabel }}
        </button>
        <span class="tx-date-picker-calendar__range-sep" aria-hidden="true">→</span>
        <button
          type="button"
          class="tx-date-picker-calendar__range-pill"
          :class="{ 'is-active': pickingEnd || activeRangeSlot === 'end', 'is-placeholder': !rangeEnd }"
          @click="activeRangeSlot = 'end'"
        >
          {{ rangeEndLabel }}
        </button>
      </div>

      <div v-if="presets?.length" class="tx-date-picker-calendar__presets">
        <button
          v-for="preset in presets"
          :key="preset.label"
          type="button"
          class="tx-date-picker-calendar__preset"
          :disabled="disabled"
          @click="applyPreset(preset)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div class="tx-date-picker-calendar__body">
        <div v-if="hasDate" class="tx-date-picker-calendar__date-pane">
          <div class="tx-date-picker-calendar__header">
            <button
              type="button"
              class="tx-date-picker-calendar__nav"
              :disabled="disabled || !canMoveCalendarMonth(-1)"
              :aria-label="`${title} previous`"
              @click="shiftCalendarMonth(-1)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14.5 6 8.5 12 14.5 18" />
              </svg>
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
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9.5 6 15.5 12 9.5 18" />
              </svg>
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

        <div v-if="hasTime" class="tx-date-picker-calendar__time-pane" :class="{ 'has-seconds': showSeconds }">
          <div class="tx-date-picker-calendar__time-head">
            <span class="tx-date-picker-calendar__time-label">
              {{ resolvedMode === 'datetimerange' ? (activeRangeSlot === 'end' ? endPlaceholder : startPlaceholder) : timeLabel }}
            </span>
            <span class="tx-date-picker-calendar__time-readout">{{ editedTimeSummary }}</span>
          </div>
          <div class="tx-date-picker-calendar__time-cols" aria-hidden="true">
            <span>HH</span>
            <span>MM</span>
            <span v-if="showSeconds">SS</span>
          </div>
          <div class="tx-date-picker-calendar__time-wheel">
            <TxPicker
              :model-value="activeTimePickerValue"
              :columns="timePickerColumns"
              :popup="false"
              :show-toolbar="false"
              :visible-item-count="5"
              :item-height="32"
              :disabled="disabled"
              @update:model-value="onTimePickerChange"
            />
          </div>
        </div>
      </div>

      <div v-if="showPanelFooter" class="tx-date-picker-calendar__footer">
        <button
          type="button"
          class="tx-date-picker-calendar__footer-link"
          :disabled="disabled"
          @click="onSelectNowOrToday"
        >
          {{ hasTime ? nowText : todayText }}
        </button>
        <button
          v-if="hasTime"
          type="button"
          class="tx-date-picker-calendar__footer-confirm"
          :disabled="disabled || !canConfirmField"
          @click="onFieldConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
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
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 12px;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  outline: none;
  cursor: pointer;

  &.is-morphing {
    transition: box-shadow 0.22s ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
}

.tx-date-picker-field:hover:not(.is-disabled) {
  box-shadow: inset 0 0 0 1px var(--tx-color-primary-light-3, #79bbff);
}

.tx-date-picker-field:focus-within:not(.is-disabled),
.tx-date-picker-field.is-open:not(.is-disabled) {
  transition: box-shadow 0.22s ease;
  box-shadow:
    inset 0 0 0 1px var(--tx-color-primary, #409eff),
    0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
}

.tx-date-picker-field.is-disabled {
  background: var(--tx-disabled-bg-color, #f5f7fa);
  color: var(--tx-disabled-text-color, #c0c4cc);
  cursor: not-allowed;
}

.tx-date-picker-field__value {
  min-width: 0;
  font-size: 13px;
  font-weight: var(--tx-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-date-picker-field__value.is-placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-weight: var(--tx-font-weight-regular, 400);
}

.tx-date-picker-field__suffix {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.tx-date-picker-field__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  color: var(--tx-text-color-placeholder, #a8abb2);

  &:hover {
    color: var(--tx-text-color-primary, #303133);
    background: var(--tx-fill-color-light, #f5f7fa);
  }
}

.tx-date-picker-field__icon {
  display: inline-flex;
  color: var(--tx-text-color-secondary, #909399);
}

// The panel sizes to this calendar rather than to the field (`matchReferenceWidth`
// is off): a month grid's width has nothing to do with how wide the input is, and
// matching a narrow field cut the last weekday column off the panel's edge.
.tx-date-picker-calendar {
  width: min(288px, calc(100vw - 24px));
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 96%, transparent);
  overflow: hidden;

  &.is-time-only {
    width: min(232px, calc(100vw - 24px));
  }

  &.is-split {
    width: min(452px, calc(100vw - 24px));
  }
}

.tx-date-picker-calendar__range-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-date-picker-calendar__range-pill {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  &.is-placeholder {
    color: var(--tx-text-color-placeholder, #a8abb2);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, transparent);
    color: var(--tx-color-primary, #409eff);
  }
}

.tx-date-picker-calendar__range-sep {
  flex: none;
  font-size: 12px;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-date-picker-calendar__preset {
  padding: 3px 8px;
  border: 0;
  border-radius: 7px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
  }
}

.tx-date-picker-calendar__body {
  display: flex;
  align-items: stretch;
}

.tx-date-picker-calendar__date-pane {
  flex: 1 1 280px;
  min-width: 0;
  padding: 12px;
}

.tx-date-picker-calendar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.tx-date-picker-calendar__title {
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.tx-date-picker-calendar__title:hover:not(:disabled) {
  background: var(--tx-fill-color-light, #f5f7fa);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--tx-text-color-regular, #606266);
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }
}

.tx-date-picker-calendar__nav:disabled {
  cursor: not-allowed;
  opacity: 0.36;
}

.tx-date-picker-calendar__weekdays,
.tx-date-picker-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

// The ARIA row wrappers must not disturb the 7-column grid: `display: contents`
// keeps each week's cells as direct grid items while still exposing role="row".
.tx-date-picker-calendar__row {
  display: contents;
}

.tx-date-picker-calendar__weekdays {
  margin-bottom: 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-weight: var(--tx-font-weight-medium, 500);
  text-align: center;
}

.tx-date-picker-calendar__cell {
  min-width: 0;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-size: 13px;
  font-weight: var(--tx-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: box-shadow 0.14s ease;
}

.tx-date-picker-calendar.is-morphing .tx-date-picker-calendar__cell {
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-date-picker-calendar__cell:hover:not(:disabled):not(.is-selected) {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-date-picker-calendar__cell.is-outside-month {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__cell.is-today:not(.is-selected) {
  color: var(--tx-color-primary, #409eff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent);
}

.tx-date-picker-calendar__cell.is-selected {
  color: var(--tx-color-on-primary, #fff);
  background: var(--tx-color-primary, #409eff);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
  animation: tx-date-pick 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-date-picker-calendar__cell.is-selected:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 88%, var(--tx-date-picker-selected-shade, #111827));
}

@keyframes tx-date-pick {
  0% {
    transform: scale(0.88);
  }
  100% {
    transform: scale(1);
  }
}

// The band between the ends. It is a square-cornered fill so consecutive days
// read as one continuous stretch, with the ends rounding it off.
.tx-date-picker-calendar__cell.is-in-range {
  border-radius: 0;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
}

.tx-date-picker-calendar__cell.is-in-range.is-outside-month {
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

.tx-date-picker-calendar__cell.is-range-start:not(.is-range-end) {
  border-radius: 8px 0 0 8px;
}

.tx-date-picker-calendar__cell.is-range-end:not(.is-range-start) {
  border-radius: 0 8px 8px 0;
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
  padding: 10px 0;
  border: 0;
  border-radius: 8px;
  color: var(--tx-text-color-primary, #303133);
  background: transparent;
  font-size: 13px;
  font-weight: var(--tx-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.tx-date-picker-calendar__tile:hover:not(:disabled):not(.is-selected) {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-date-picker-calendar__tile.is-muted {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__tile.is-today:not(.is-selected) {
  color: var(--tx-color-primary, #409eff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent);
}

.tx-date-picker-calendar__tile.is-selected {
  color: var(--tx-color-on-primary, #fff);
  background: var(--tx-color-primary, #409eff);
}

.tx-date-picker-calendar__tile:disabled {
  cursor: not-allowed;
  opacity: 0.34;
}

.tx-date-picker-calendar__time-pane {
  display: flex;
  flex-direction: column;
  width: 164px;
  flex: none;
  padding: 12px 10px 10px;
  box-sizing: border-box;

  .tx-date-picker-calendar.is-split & {
    border-left: 1px solid var(--tx-border-color-lighter, #ebeef5);
  }

  .tx-date-picker-calendar.is-time-only & {
    width: 100%;
    padding: 12px;
  }

  &.has-seconds {
    width: 196px;
  }
}

.tx-date-picker-calendar__time-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}

.tx-date-picker-calendar__time-label {
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  color: var(--tx-text-color-secondary, #909399);
}

.tx-date-picker-calendar__time-readout {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
  font-variant-numeric: tabular-nums;
}

.tx-date-picker-calendar__time-cols {
  display: flex;
  text-align: center;
  font-size: 10px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-placeholder, #a8abb2);
  margin-bottom: 2px;

  > span {
    flex: 1;
  }
}

.tx-date-picker-calendar__time-wheel {
  flex: 1;
  display: flex;
  align-items: center;

  :deep(.tx-picker) {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  :deep(.tx-picker__highlight) {
    left: 2px;
    right: 2px;
    border-radius: 8px;
  }

  :deep(.tx-picker__item) {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    padding: 0 4px;
  }
}

.tx-date-picker-calendar__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-date-picker-calendar__footer-link {
  padding: 4px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-color-primary, #409eff);
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-color-primary-light-9, #ecf5ff);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.tx-date-picker-calendar__footer-confirm {
  padding: 5px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-color-primary, #409eff);
  color: var(--tx-color-on-primary, #fff);
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// Stepping a month or a year block travels sideways; changing zoom level has
// no direction, so it scales in place.
.tx-date-slide-next-enter-active,
.tx-date-slide-prev-enter-active,
.tx-date-zoom-enter-active {
  transition: opacity 150ms ease, transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-date-slide-next-leave-active,
.tx-date-slide-prev-leave-active,
.tx-date-zoom-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
}

.tx-date-slide-next-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.tx-date-slide-next-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

.tx-date-slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}

.tx-date-slide-prev-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.tx-date-zoom-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.tx-date-zoom-leave-to {
  opacity: 0;
  transform: scale(1.03);
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
  .tx-date-picker-calendar.is-split {
    width: min(100vw - 20px, 320px);
  }

  .tx-date-picker-calendar.is-split .tx-date-picker-calendar__body {
    flex-direction: column;
  }

  .tx-date-picker-calendar.is-split .tx-date-picker-calendar__time-pane {
    width: 100%;
    border-left: 0;
    border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  }
}
</style>
