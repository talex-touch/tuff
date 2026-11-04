<script setup lang="ts">
import type { StyleValue } from 'vue'
import { computed, ref, useAttrs } from 'vue'
import { useTxFormField } from '../../../../utils/form-field'
import { useMorphWindow } from '../../../../utils/use-morph-window'

defineOptions({
  name: 'TxNumberInput',
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: number | null
    min?: number
    max?: number
    step?: number
    precision?: number
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    controls?: boolean
    /** Accessible label for the decrement button. Localize by passing e.g. '减少'. */
    decreaseLabel?: string
    /** Accessible label for the increment button. Localize by passing e.g. '增加'. */
    increaseLabel?: string
  }>(),
  {
    modelValue: null,
    min: undefined,
    max: undefined,
    step: 1,
    precision: undefined,
    placeholder: '',
    disabled: false,
    readonly: false,
    controls: true,
    decreaseLabel: 'Decrease value',
    increaseLabel: 'Increase value',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  'change': [value: number | null]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
}>()

const attrs = useAttrs()
const field = useTxFormField('input')
const inputRef = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
// Raw text while the user is typing. Kept unclamped so intermediate states
// ("5" on the way to "50", "-", "1.") survive until blur re-normalizes.
const rawValue = ref('')

const isDisabled = computed(() => props.disabled || !!field?.disabled)
const isReadonly = computed(() => props.readonly || !!field?.readonly)

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return field ? field.attrs(rest) : rest
})

const wrapperStyle = computed(() => attrs.style as StyleValue)

// While focused, mirror exactly what was typed so keystrokes are never
// rewritten mid-edit; when blurred, follow the normalized model value.
const displayValue = computed(() => {
  if (isFocused.value)
    return rawValue.value
  return props.modelValue ?? ''
})

const canDecrease = computed(() => {
  return !isDisabled.value && !isReadonly.value && (props.min === undefined || (props.modelValue ?? 0) > props.min)
})

const canIncrease = computed(() => {
  return !isDisabled.value && !isReadonly.value && (props.max === undefined || (props.modelValue ?? 0) < props.max)
})

// Focusing eases the border, and a step that hits a bound eases that control
// into its disabled ink; hovers repaint at once.
const morphing = useMorphWindow(() => [isFocused.value, canDecrease.value, canIncrease.value], 200)

function applyPrecision(value: number): number {
  return props.precision === undefined ? value : Number(value.toFixed(props.precision))
}

function normalizeValue(value: number): number {
  let next = value
  if (props.min !== undefined)
    next = Math.max(props.min, next)
  if (props.max !== undefined)
    next = Math.min(props.max, next)
  return applyPrecision(next)
}

function commitValue(value: number | null, emitChange: boolean) {
  emit('update:modelValue', value)
  if (emitChange)
    emit('change', value)
}

function handleInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  rawValue.value = raw
  const trimmed = raw.trim()
  // A `type="number"` field sanitizes any partial or invalid input ("-", "1.",
  // "abc", an overflowing exponent) down to an empty string before it reaches
  // us, so an empty buffer is the only non-numeric state and it clears the
  // model. Min/max clamping is intentionally deferred to blur/step, so a value
  // like "5" (min 10) can be typed on the way to "50" without being rewritten
  // to "10" mid-keystroke.
  if (trimmed === '') {
    commitValue(null, true)
    return
  }
  commitValue(applyPrecision(Number(trimmed)), true)
}

function stepBy(direction: 1 | -1) {
  if (isDisabled.value || isReadonly.value)
    return
  const base = props.modelValue ?? 0
  commitValue(normalizeValue(base + props.step * direction), true)
}

function handleFocus(event: FocusEvent) {
  isFocused.value = true
  rawValue.value = props.modelValue == null ? '' : String(props.modelValue)
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  isFocused.value = false
  const trimmed = rawValue.value.trim()
  let resolved: number | null
  if (trimmed === '') {
    resolved = null
  }
  else {
    const value = Number(trimmed)
    // Leftover intermediate text ("-", "1.") falls back to the current model.
    resolved = Number.isFinite(value) ? normalizeValue(value) : props.modelValue ?? null
  }
  // Only commit when blur actually changed the value: a focus/tab-away round trip on an
  // untouched field must not dirty the model or fire a spurious change.
  if (resolved !== (props.modelValue ?? null))
    commitValue(resolved, true)
  emit('blur', event)
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  inputRef,
})
</script>

<template>
  <div
    class="tx-number-input"
    :class="[
      {
        'is-disabled': isDisabled,
        'is-readonly': isReadonly,
        'is-invalid': field?.invalid,
        'is-focused': isFocused,
        'has-controls': controls,
        'is-morphing': morphing,
      },
      attrs.class,
    ]"
    :style="wrapperStyle"
  >
    <button
      v-if="controls"
      type="button"
      class="tx-number-input__control"
      :disabled="!canDecrease"
      :aria-label="decreaseLabel"
      @click="stepBy(-1)"
    >
      -
    </button>
    <input
      ref="inputRef"
      :value="displayValue"
      class="tx-number-input__field"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      :disabled="isDisabled"
      :readonly="isReadonly"
      v-bind="inputAttrs"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
    >
    <button
      v-if="controls"
      type="button"
      class="tx-number-input__control"
      :disabled="!canIncrease"
      :aria-label="increaseLabel"
      @click="stepBy(1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
/* The edge is an inset ring, as the design rules require, so the box stays 32px through focus.
   Its 1px padding keeps the steppers inside the ring, and their outer corners take the ring's
   inner radius (12px - 1px) so they stay concentric with the box. */
.tx-number-input {
  display: inline-flex;
  align-items: stretch;
  box-sizing: border-box;
  width: 100%;
  min-width: 120px;
  height: 32px;
  padding: 1px;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
}

.tx-number-input.is-morphing {
  transition: box-shadow 0.25s ease;
}

.tx-number-input:hover:not(.is-disabled) {
  box-shadow: inset 0 0 0 1px var(--tx-color-primary-light-3, #79bbff);
}

.tx-number-input.is-focused:not(.is-disabled) {
  transition: box-shadow 0.25s ease;
  box-shadow:
    inset 0 0 0 1px var(--tx-color-primary, #409eff),
    0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
}

/* Set by a TxFormItem while it shows an error for this field. */
.tx-number-input.is-invalid:not(.is-disabled) {
  box-shadow: inset 0 0 0 1px var(--tx-color-danger, #f56c6c);
}

.tx-number-input.is-invalid.is-focused:not(.is-disabled) {
  box-shadow:
    inset 0 0 0 1px var(--tx-color-danger, #f56c6c),
    0 0 0 3px color-mix(in srgb, var(--tx-color-danger, #f56c6c) 15%, transparent);
}

.tx-number-input__field {
  flex: 1;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0 12px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
  font-size: 14px;
  text-align: center;
}

.tx-number-input__field::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-number-input__field::-webkit-outer-spin-button,
.tx-number-input__field::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.tx-number-input__control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  border: 0;
  padding: 1px 6px;
  box-shadow: inset -1px 0 0 0 var(--tx-border-color, #dcdfe6);
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  cursor: pointer;
}

.tx-number-input.is-morphing .tx-number-input__control {
  transition: background-color 0.2s ease, color 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .tx-number-input.is-morphing,
  .tx-number-input.is-morphing .tx-number-input__control {
    transition: none;
  }
}

.tx-number-input__control:first-child {
  padding-right: 7px;
  border-radius: 11px 0 0 11px;
}

.tx-number-input__control:last-child {
  padding-left: 7px;
  box-shadow: inset 1px 0 0 0 var(--tx-border-color, #dcdfe6);
  border-radius: 0 11px 11px 0;
}

.tx-number-input__control:hover:not(:disabled) {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
}

.tx-number-input__control:disabled {
  color: var(--tx-disabled-text-color, #c0c4cc);
  cursor: not-allowed;
}

.tx-number-input.is-disabled {
  background: var(--tx-disabled-bg-color, #f5f7fa);
  cursor: not-allowed;
}

.tx-number-input.is-disabled .tx-number-input__field {
  color: var(--tx-disabled-text-color, #c0c4cc);
  cursor: not-allowed;
}

.tx-number-input.is-readonly .tx-number-input__field {
  cursor: default;
}
</style>
