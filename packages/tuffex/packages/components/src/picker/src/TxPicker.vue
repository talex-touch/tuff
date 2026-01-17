<script setup lang="ts">
import type { PickerColumn, PickerEmits, PickerProps, PickerValue } from './types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({ name: 'TxPicker' })

const props = withDefaults(defineProps<PickerProps>(), {
  modelValue: () => [],
  columns: () => [],
  visible: false,
  popup: true,
  title: '',
  showToolbar: true,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  disabled: false,
  itemHeight: 36,
  visibleItemCount: 5,
  closeOnClickMask: true,
  lazyMount: true,
})

const emit = defineEmits<PickerEmits>()

const open = computed({
  get: () => !!props.visible,
  set: v => emit('update:visible', v),
})

const mountedOnce = ref(false)

const columns = computed<PickerColumn[]>(() => props.columns ?? [])

const itemHeightPx = computed(() => Math.max(24, props.itemHeight ?? 36))
const visibleCount = computed(() => {
  const n = Math.floor(props.visibleItemCount ?? 5)
  return Math.max(3, n % 2 === 0 ? n + 1 : n)
})

const paddingY = computed(() => (visibleCount.value - 1) / 2 * itemHeightPx.value)

const localValue = ref<PickerValue>([])

function normalizeValue(v: PickerValue): PickerValue {
  const cols = columns.value
  const out: PickerValue = []
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    if (!col)
      continue
    const opts = col.options ?? []
    const desired = v[i]

    if (desired !== undefined) {
      const idx = opts.findIndex(o => o.value === desired)
      if (idx >= 0) {
        out[i] = desired
        continue
      }
    }

    const first = opts.find(o => !o.disabled)
    out[i] = first?.value ?? ''
  }
  return out
}

watch(
  () => props.modelValue,
  (v) => {
    localValue.value = normalizeValue(Array.isArray(v) ? v : [])
  },
  { immediate: true },
)

watch(
  columns,
  () => {
    localValue.value = normalizeValue(localValue.value)
  },
  { flush: 'sync' },
)

const colRefs = ref<Array<HTMLElement | null>>([])
const isDragging = ref(false)

interface ScrollState {
  rafId: number | null
  debounceId: number | null
}

const scrollStates = ref<ScrollState[]>([])

function ensureStates() {
  const n = columns.value.length
  if (scrollStates.value.length === n)
    return
  scrollStates.value = Array.from({ length: n }).map(() => ({ rafId: null, debounceId: null }))
}

function getIndexForValue(colIndex: number, v: any): number {
  const opts = columns.value[colIndex]?.options ?? []
  const idx = opts.findIndex(o => o.value === v)
  return Math.max(0, idx)
}

function clampIndex(colIndex: number, idx: number): number {
  const len = (columns.value[colIndex]?.options ?? []).length
  if (len <= 0)
    return 0
  return Math.min(len - 1, Math.max(0, idx))
}

function scrollToIndex(colIndex: number, idx: number, behavior: ScrollBehavior = 'auto') {
  const el = colRefs.value[colIndex]
  if (!el)
    return
  const top = idx * itemHeightPx.value
  el.scrollTo({ top, behavior })
}

function pickIndexFromScroll(colIndex: number) {
  const el = colRefs.value[colIndex]
  if (!el)
    return

  const raw = el.scrollTop / itemHeightPx.value
  const idx = clampIndex(colIndex, Math.round(raw))
  const opts = columns.value[colIndex]?.options ?? []
  const option = opts[idx]

  if (option?.disabled) {
    const next = opts.findIndex((o, i) => i >= idx && !o.disabled)
    const prev = [...opts].reverse().findIndex(o => !o.disabled)
    const prevIdx = prev >= 0 ? opts.length - 1 - prev : -1

    const fallback = next >= 0 ? next : prevIdx
    if (fallback >= 0 && fallback !== idx) {
      scrollToIndex(colIndex, fallback, 'smooth')
      setValueAt(colIndex, opts[fallback]?.value)
      return
    }
  }

  setValueAt(colIndex, option?.value)
}

function settleScroll(colIndex: number) {
  const el = colRefs.value[colIndex]
  if (!el)
    return

  const idx = clampIndex(colIndex, Math.round(el.scrollTop / itemHeightPx.value))
  scrollToIndex(colIndex, idx, 'smooth')
}

function setValueAt(colIndex: number, v: any) {
  const next = localValue.value.slice()
  next[colIndex] = v
  localValue.value = normalizeValue(next)

  emit('update:modelValue', localValue.value)
  emit('change', localValue.value)
}

function onScroll(colIndex: number) {
  ensureStates()
  const state = scrollStates.value[colIndex]
  if (!state)
    return

  if (state.rafId != null)
    cancelAnimationFrame(state.rafId)
  state.rafId = requestAnimationFrame(() => {
    state.rafId = null
    pickIndexFromScroll(colIndex)
  })

  if (state.debounceId != null)
    window.clearTimeout(state.debounceId)
  state.debounceId = window.setTimeout(() => {
    state.debounceId = null
    if (!isDragging.value)
      settleScroll(colIndex)
  }, 120)
}

function onPointerDown() {
  if (props.disabled)
    return
  isDragging.value = true
}

function onPointerUp() {
  if (!isDragging.value)
    return
  isDragging.value = false
  for (let i = 0; i < columns.value.length; i++) settleScroll(i)
}

async function syncScrollPositions(behavior: ScrollBehavior = 'auto') {
  await nextTick()
  ensureStates()

  const v = localValue.value
  for (let i = 0; i < columns.value.length; i++) {
    const idx = getIndexForValue(i, v[i])
    scrollToIndex(i, idx, behavior)
  }
}

watch(
  open,
  async (v) => {
    if (v) {
      emit('open')
      mountedOnce.value = true
      await syncScrollPositions('auto')
      return
    }

    emit('close')
  },
  { flush: 'post' },
)

watch(
  () => props.modelValue,
  () => {
    if (!open.value && props.popup)
      return
    syncScrollPositions('auto')
  },
)

watch(
  columns,
  () => {
    if (!open.value && props.popup)
      return
    syncScrollPositions('auto')
  },
)

function close() {
  open.value = false
}

function onMaskClick() {
  if (!props.closeOnClickMask)
    return
  close()
}

function onCancel() {
  emit('cancel')
  close()
}

function onConfirm() {
  emit('confirm', localValue.value)
  close()
}

defineExpose({
  open: () => (open.value = true),
  close,
  toggle: () => (open.value = !open.value),
})

onBeforeUnmount(() => {
  for (const s of scrollStates.value) {
    if (s.rafId != null)
      cancelAnimationFrame(s.rafId)
    if (s.debounceId != null)
      window.clearTimeout(s.debounceId)
  }
})
</script>

<template>
  <div v-if="!popup" class="tx-picker" :class="{ 'is-disabled': disabled }">
    <div v-if="showToolbar" class="tx-picker__toolbar">
      <button type="button" class="tx-picker__btn" :disabled="disabled" @click="onCancel">
        {{ cancelText }}
      </button>
      <div class="tx-picker__title">
        {{ title }}
      </div>
      <button type="button" class="tx-picker__btn is-primary" :disabled="disabled" @click="onConfirm">
        {{ confirmText }}
      </button>
    </div>

    <div class="tx-picker__columns" :style="{ '--tx-picker-item-height': `${itemHeightPx}px`, '--tx-picker-padding-y': `${paddingY}px` }">
      <div class="tx-picker__highlight" aria-hidden="true" />

      <div v-for="(col, colIndex) in columns" :key="col.key ?? colIndex" class="tx-picker__col">
        <div
          :ref="(el) => (colRefs[colIndex] = el as HTMLElement)"
          class="tx-picker__scroller"
          role="listbox"
          tabindex="-1"
          @scroll.passive="onScroll(colIndex)"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div class="tx-picker__pad" aria-hidden="true" />

          <button
            v-for="opt in col.options"
            :key="String(opt.value)"
            type="button"
            class="tx-picker__item"
            :class="{ 'is-disabled': !!opt.disabled, 'is-selected': localValue[colIndex] === opt.value }"
            :disabled="disabled || !!opt.disabled"
            @click="scrollToIndex(colIndex, clampIndex(colIndex, col.options.findIndex(o => o.value === opt.value)), 'smooth')"
          >
            {{ opt.label }}
          </button>

          <div class="tx-picker__pad" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>

  <Teleport v-else to="body">
    <Transition name="tx-picker-popup">
      <div v-if="open && (!lazyMount || mountedOnce)" class="tx-picker-popup" @pointerup="onPointerUp">
        <div class="tx-picker-popup__mask" @click="onMaskClick" />

        <div class="tx-picker-popup__panel" :class="{ 'is-disabled': disabled }">
          <div v-if="showToolbar" class="tx-picker__toolbar">
            <button type="button" class="tx-picker__btn" :disabled="disabled" @click="onCancel">
              {{ cancelText }}
            </button>
            <div class="tx-picker__title">
              {{ title }}
            </div>
            <button type="button" class="tx-picker__btn is-primary" :disabled="disabled" @click="onConfirm">
              {{ confirmText }}
            </button>
          </div>

          <div class="tx-picker__columns" :style="{ '--tx-picker-item-height': `${itemHeightPx}px`, '--tx-picker-padding-y': `${paddingY}px` }">
            <div class="tx-picker__highlight" aria-hidden="true" />

            <div v-for="(col, colIndex) in columns" :key="col.key ?? colIndex" class="tx-picker__col">
              <div
                :ref="(el) => (colRefs[colIndex] = el as HTMLElement)"
                class="tx-picker__scroller"
                role="listbox"
                tabindex="-1"
                @scroll.passive="onScroll(colIndex)"
                @pointerdown="onPointerDown"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
              >
                <div class="tx-picker__pad" aria-hidden="true" />

                <button
                  v-for="opt in col.options"
                  :key="String(opt.value)"
                  type="button"
                  class="tx-picker__item"
                  :class="{ 'is-disabled': !!opt.disabled, 'is-selected': localValue[colIndex] === opt.value }"
                  :disabled="disabled || !!opt.disabled"
                  @click="scrollToIndex(colIndex, clampIndex(colIndex, col.options.findIndex(o => o.value === opt.value)), 'smooth')"
                >
                  {{ opt.label }}
                </button>

                <div class="tx-picker__pad" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.tx-picker {
  --tx-picker-item-height: 36px;
  --tx-picker-padding-y: 72px;

  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
}

.tx-picker__toolbar {
  display: grid;
  grid-template-columns: 88px 1fr 88px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 60%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.tx-picker__title {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-picker__btn {
  border: none;
  background: transparent;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-primary {
    color: var(--tx-color-primary, #409eff);
  }
}

.tx-picker__columns {
  position: relative;
  display: flex;
  width: 100%;
  height: calc(var(--tx-picker-item-height) * 5);
}

.tx-picker__col {
  flex: 1;
  min-width: 0;
}

.tx-picker__scroller {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  -webkit-overflow-scrolling: touch;
  padding: var(--tx-picker-padding-y) 0;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

.tx-picker__pad {
  height: 0;
}

.tx-picker__item {
  scroll-snap-align: center;
  height: var(--tx-picker-item-height);
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;

  &.is-selected {
    color: var(--tx-text-color-primary, #303133);
    font-weight: 600;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.tx-picker__highlight {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 50%;
  height: var(--tx-picker-item-height);
  transform: translateY(-50%);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
  pointer-events: none;
}

.tx-picker-popup {
  position: fixed;
  inset: 0;
  z-index: 3000;
}

.tx-picker-popup__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}

.tx-picker-popup__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 18px 18px 0 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 78%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 60%, transparent);
}

.tx-picker-popup-enter-active,
.tx-picker-popup-leave-active {
  transition: opacity 0.18s ease;
}

.tx-picker-popup-enter-from,
.tx-picker-popup-leave-to {
  opacity: 0;
}

.tx-picker-popup-enter-active .tx-picker-popup__panel,
.tx-picker-popup-leave-active .tx-picker-popup__panel {
  transition: transform 0.22s ease;
}

.tx-picker-popup-enter-from .tx-picker-popup__panel,
.tx-picker-popup-leave-to .tx-picker-popup__panel {
  transform: translateY(18px);
}

.is-disabled {
  opacity: 0.7;
}
</style>
