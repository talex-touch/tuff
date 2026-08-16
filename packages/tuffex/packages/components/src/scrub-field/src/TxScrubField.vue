<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// A Figma-style numeric field: the caption is the drag handle, the value is
// still typeable, and the keyboard reaches every value without a pointer.

import type { ScrubFieldEmits, ScrubFieldProps } from './types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({ name: 'TxScrubField' })

const props = withDefaults(defineProps<ScrubFieldProps>(), {
  step: 1,
  suffix: undefined,
  active: false,
  disabled: false,
  pixelsPerStep: 2,
  shiftMultiplier: 10,
  clampOn: 'input',
  ariaLabel: undefined,
  valueLabel: undefined,
})

const emit = defineEmits<ScrubFieldEmits>()

const handleRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const draft = ref(String(props.modelValue))
const editing = ref(false)
const dragging = ref(false)

interface DragOrigin {
  x: number
  value: number
  pointerId: number
}
let origin: DragOrigin | null = null

// Decimals implied by `step`, so a 0.1 step keeps one decimal instead of being
// rounded onto integers the way upstream's Math.round does.
const decimals = computed(() => {
  const text = String(props.step)
  const fraction = text.includes('.') ? text.split('.')[1] : undefined
  return fraction ? fraction.length : 0
})

const valueText = computed(() => (props.suffix ? `${props.modelValue}${props.suffix}` : undefined))

watch(
  () => props.modelValue,
  (value) => {
    if (!editing.value)
      draft.value = String(value)
  },
)

function clampValue(value: number): number {
  const bounded = Math.min(props.max, Math.max(props.min, value))
  return Number(bounded.toFixed(decimals.value))
}

function commit(value: number): void {
  if (props.disabled)
    return
  const next = clampValue(value)
  if (next === props.modelValue)
    return
  emit('update:modelValue', next)
  emit('change', next)
}

function parse(raw: string): number | null {
  // Keep digits, one sign and one separator; anything else is noise from a
  // paste or an IME and must not blank the field.
  const cleaned = raw.replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.')
    return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function endDrag(): void {
  if (!dragging.value)
    return

  // Pointer capture is best-effort: hosts without it still work, the drag just
  // ends when the pointer leaves the handle.
  try {
    if (origin && handleRef.value?.hasPointerCapture?.(origin.pointerId))
      handleRef.value.releasePointerCapture(origin.pointerId)
  }
  catch {}

  dragging.value = false
  origin = null
  detachCancelKeys()
  emit('scrubEnd')
}

function onCancelKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !origin)
    return
  event.preventDefault()
  // Escape abandons the gesture: back to where the drag started, not to the
  // last value the pointer happened to pass over.
  commit(origin.value)
  endDrag()
}

function attachCancelKeys(): void {
  if (typeof window !== 'undefined')
    window.addEventListener('keydown', onCancelKey, true)
}

function detachCancelKeys(): void {
  if (typeof window !== 'undefined')
    window.removeEventListener('keydown', onCancelKey, true)
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled)
    return

  origin = { x: event.clientX, value: props.modelValue, pointerId: event.pointerId }
  dragging.value = true
  try {
    handleRef.value?.setPointerCapture?.(event.pointerId)
  }
  catch {}
  // The handle is its own control; take focus rather than letting the wrapping
  // label hand it to the number input.
  handleRef.value?.focus?.()
  attachCancelKeys()
  emit('scrubStart')
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || !origin)
    return
  // Quantise the travel, not the result: a value that started off-grid stays
  // off-grid instead of being yanked onto the nearest step.
  const steps = Math.round((event.clientX - origin.x) / props.pixelsPerStep)
  commit(origin.value + steps * props.step)
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled)
    return

  const multiplier = event.shiftKey ? props.shiftMultiplier : 1

  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      event.preventDefault()
      commit(props.modelValue + props.step * multiplier)
      break
    case 'ArrowDown':
    case 'ArrowLeft':
      event.preventDefault()
      commit(props.modelValue - props.step * multiplier)
      break
    case 'Home':
      event.preventDefault()
      commit(props.min)
      break
    case 'End':
      event.preventDefault()
      commit(props.max)
      break
    default:
  }
}

function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  draft.value = raw
  if (props.clampOn !== 'input')
    return
  const parsed = parse(raw)
  if (parsed !== null)
    commit(parsed)
}

function onFocus(): void {
  editing.value = true
}

async function onBlur(): Promise<void> {
  editing.value = false
  const parsed = parse(draft.value)
  if (parsed !== null)
    commit(parsed)

  // Snap the text back to whatever the host settled on — including the case
  // where it refused the edit and the value never changed.
  await nextTick()
  draft.value = String(props.modelValue)
}

function onInputKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    draft.value = String(props.modelValue)
    inputRef.value?.blur()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const parsed = parse(draft.value)
    if (parsed !== null)
      commit(parsed)
  }
}

onBeforeUnmount(() => {
  detachCancelKeys()
})

defineExpose({
  focus: () => handleRef.value?.focus(),
  focusInput: () => inputRef.value?.focus(),
})
</script>

<template>
  <label
    class="tx-bui-scrub-field"
    :class="{ 'is-active': active, 'is-disabled': disabled, 'is-dragging': dragging }"
  >
    <span
      ref="handleRef"
      class="tx-bui-scrub-field__handle"
      role="slider"
      :aria-label="ariaLabel ?? label"
      :aria-valuenow="modelValue"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuetext="valueText"
      :aria-disabled="disabled || undefined"
      aria-orientation="horizontal"
      :tabindex="disabled ? -1 : 0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="onKeyDown"
      @click.prevent
    >{{ label }}</span>
    <input
      ref="inputRef"
      class="tx-bui-scrub-field__input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="draft"
      :disabled="disabled"
      :aria-label="valueLabel ?? `${label} value`"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onInputKeyDown"
    >
    <span v-if="suffix" class="tx-bui-scrub-field__suffix">{{ suffix }}</span>
  </label>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-scrub-field {
  @include bui-scope;

  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  height: 26px;
  padding: 4px 4px 4px 2px;
  background: var(--tx-bui-field, #f2f2f3);
  border-radius: var(--tx-bui-radius-chip, 6px);
  transition:
    background-color 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &.is-active {
    background: var(--tx-bui-accent-tint, #e9f3ff);
    // Ring, not border: the field's box has to stay 26px tall next to its
    // untinted neighbour in the same grid row.
    box-shadow: 0 0 0 1px var(--tx-bui-accent, #0285ff);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-scrub-field__handle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 100%;
  padding: 0 2px;
  font-size: 12px;
  color: var(--tx-bui-ink-3, #9a9da3);
  cursor: ew-resize;
  user-select: none;
  border-radius: 4px;
  // The drag owns the horizontal axis; the page keeps the vertical one.
  touch-action: pan-y;

  &:hover {
    color: var(--tx-bui-ink-2, #62656b);
  }

  &:focus-visible {
    color: var(--tx-bui-accent-ink, #0170dd);
    outline: none;
  }

  .tx-bui-scrub-field.is-disabled & {
    cursor: not-allowed;
  }
}

.tx-bui-scrub-field__input {
  @include bui-tabular-nums;

  flex: 1;
  min-width: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--tx-bui-ink, #1f2124);
  background: transparent;
  border: 0;
  outline: none;

  &:disabled {
    cursor: not-allowed;
    color: var(--tx-bui-ink-3, #9a9da3);
  }
}

.tx-bui-scrub-field__suffix {
  flex-shrink: 0;
  padding-right: 2px;
  font-size: 11.5px;
  color: var(--tx-bui-ink-3, #9a9da3);
}
</style>
