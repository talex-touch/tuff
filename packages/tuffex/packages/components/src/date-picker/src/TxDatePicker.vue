<script setup lang="ts">
import type { PickerColumn, PickerValue } from '../../picker/src/types'
import type { DatePickerEmits, DatePickerProps } from './types'
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

function setFromModel(v: string) {
  const parsed = parseYmd(v)
  const base = parsed ?? (() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
  })()

  localParts.value = clampDate(base, minDate.value, maxDate.value)
  calendarMonth.value = { y: localParts.value.y, m: localParts.value.m }
}

watch(
  () => props.modelValue,
  v => setFromModel(v || ''),
  { immediate: true },
)

watch([minDate, maxDate], () => {
  localParts.value = clampDate(localParts.value, minDate.value, maxDate.value)
  calendarMonth.value = { y: localParts.value.y, m: localParts.value.m }
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

const hasFieldValue = computed(() => !!parseYmd(props.modelValue || ''))
const fieldDisplayValue = computed(() => hasFieldValue.value ? selectedValue.value : props.placeholder)

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

const calendarCells = computed<CalendarCell[]>(() => {
  const { y, m } = calendarMonth.value
  const firstDay = new Date(y, m - 1, 1).getDay()
  const startOffset = (firstDay - weekStart.value + 7) % 7
  const start = new Date(y, m - 1, 1 - startOffset)
  const today = toPartsFromDate(new Date())

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const parts = toPartsFromDate(date)
    return {
      key: formatYmd(parts.y, parts.m, parts.d),
      label: String(parts.d),
      parts,
      inCurrentMonth: parts.y === y && parts.m === m,
      selected: compareDateParts(parts, localParts.value) === 0,
      today: compareDateParts(parts, today) === 0,
      disabled: isDateOutsideBounds(parts),
    }
  })
})

const calendarTitle = computed(() => {
  const { y, m } = calendarMonth.value
  return `${y}-${pad2(m)}`
})

function canMoveCalendarMonth(delta: number): boolean {
  const next = addMonths(calendarMonth.value, delta)
  const start = { y: next.y, m: next.m, d: 1 }
  const end = { y: next.y, m: next.m, d: new Date(next.y, next.m, 0).getDate() }
  const min = minDate.value ? toPartsFromDate(minDate.value) : null
  const max = maxDate.value ? toPartsFromDate(maxDate.value) : null

  if (delta < 0 && min && compareDateParts(end, min) < 0)
    return false
  if (delta > 0 && max && compareDateParts(start, max) > 0)
    return false
  return true
}

function shiftCalendarMonth(delta: number) {
  if (!canMoveCalendarMonth(delta))
    return
  calendarMonth.value = addMonths(calendarMonth.value, delta)
}

function selectCalendarDate(parts: DateParts) {
  if (props.disabled || isDateOutsideBounds(parts))
    return

  const next = clampDate(parts, minDate.value, maxDate.value)
  localParts.value = next
  calendarMonth.value = { y: next.y, m: next.m }
  const value = formatYmd(next.y, next.m, next.d)
  emit('update:modelValue', value)
  emit('change', value)
  fieldOpen.value = false
}

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

    <div class="tx-date-picker-calendar">
      <div class="tx-date-picker-calendar__header">
        <button
          type="button"
          class="tx-date-picker-calendar__nav"
          :disabled="disabled || !canMoveCalendarMonth(-1)"
          :aria-label="`${title} previous month`"
          @click="shiftCalendarMonth(-1)"
        >
          ‹
        </button>
        <span class="tx-date-picker-calendar__title">{{ calendarTitle }}</span>
        <button
          type="button"
          class="tx-date-picker-calendar__nav"
          :disabled="disabled || !canMoveCalendarMonth(1)"
          :aria-label="`${title} next month`"
          @click="shiftCalendarMonth(1)"
        >
          ›
        </button>
      </div>

      <div class="tx-date-picker-calendar__weekdays" aria-hidden="true">
        <span v-for="weekday in weekdayLabels" :key="weekday">
          {{ weekday }}
        </span>
      </div>

      <div class="tx-date-picker-calendar__grid" role="grid">
        <button
          v-for="cell in calendarCells"
          :key="cell.key"
          type="button"
          class="tx-date-picker-calendar__cell"
          :class="{
            'is-outside-month': !cell.inCurrentMonth,
            'is-selected': cell.selected,
            'is-today': cell.today,
          }"
          :disabled="disabled || cell.disabled"
          :aria-selected="cell.selected"
          role="gridcell"
          @click="selectCalendarDate(cell.parts)"
        >
          {{ cell.label }}
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

<style scoped>
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

.tx-date-picker-calendar {
  width: min(336px, calc(100vw - 28px));
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
  font-size: 14px;
  font-weight: 700;
  color: var(--tx-text-color-primary, #303133);
  font-variant-numeric: tabular-nums;
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

.tx-date-picker-calendar__cell:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 11%, transparent);
}

.tx-date-picker-calendar__cell.is-outside-month {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-date-picker-calendar__cell.is-today:not(.is-selected) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.tx-date-picker-calendar__cell.is-selected {
  color: var(--tx-color-white, #fff);
  background: linear-gradient(135deg, var(--tx-color-primary, #409eff), color-mix(in srgb, var(--tx-color-primary, #409eff) 72%, #111827));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
}

.tx-date-picker-calendar__cell:disabled {
  cursor: not-allowed;
  opacity: 0.34;
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
