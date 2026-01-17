<script setup lang="ts">
import type { PickerColumn, PickerValue } from '../../picker/src/types'
import type { DatePickerEmits, DatePickerProps } from './types'
import { computed, ref, watch } from 'vue'
import TxPicker from '../../picker/src/TxPicker.vue'

defineOptions({ name: 'TxDatePicker' })

const props = withDefaults(defineProps<DatePickerProps>(), {
  modelValue: '',
  visible: false,
  popup: true,
  title: 'Select date',
  disabled: false,
  showToolbar: true,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  closeOnClickMask: true,
})

const emit = defineEmits<DatePickerEmits>()

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

function parseYmd(s: string): { y: number, m: number, d: number } | null {
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

function toDateObj(p: { y: number, m: number, d: number }): Date {
  return new Date(p.y, p.m - 1, p.d)
}

function clampDate(p: { y: number, m: number, d: number }, min: Date | null, max: Date | null) {
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

const localParts = ref<{ y: number, m: number, d: number }>({ y: 2025, m: 1, d: 1 })

function setFromModel(v: string) {
  const parsed = parseYmd(v)
  const base = parsed ?? (() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
  })()

  localParts.value = clampDate(base, minDate.value, maxDate.value)
}

watch(
  () => props.modelValue,
  v => setFromModel(v || ''),
  { immediate: true },
)

watch([minDate, maxDate], () => {
  localParts.value = clampDate(localParts.value, minDate.value, maxDate.value)
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

const open = computed({
  get: () => !!props.visible,
  set: (v: boolean) => emit('update:visible', v),
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
  <TxPicker
    v-model="pickerValue"
    v-model:visible="open"
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
