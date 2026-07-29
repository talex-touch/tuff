<script setup lang="ts">
import type { StyleValue } from 'vue'
import { computed, ref, useAttrs } from 'vue'

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
const inputRef = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
// Raw text while the user is typing. Kept unclamped so intermediate states
// ("5" on the way to "50", "-", "1.") survive until blur re-normalizes.
const rawValue = ref('')

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
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
  return !props.disabled && !props.readonly && (props.min === undefined || (props.modelValue ?? 0) > props.min)
})

const canIncrease = computed(() => {
  return !props.disabled && !props.readonly && (props.max === undefined || (props.modelValue ?? 0) < props.max)
})

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
  if (props.disabled || props.readonly)
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
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-focused': isFocused,
        'has-controls': controls,
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
      :disabled="disabled"
      :readonly="readonly"
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
.tx-number-input {
  display: inline-flex;
  align-items: stretch;
  width: 100%;
  min-width: 120px;
  height: 34px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 10px;
  background: var(--tx-bg-color, #ffffff);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.tx-number-input:hover:not(.is-disabled) {
  border-color: var(--tx-color-primary-light-3, #79bbff);
}

.tx-number-input.is-focused:not(.is-disabled) {
  border-color: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
}

.tx-number-input__field {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 0 10px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
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
  border-right: 1px solid var(--tx-border-color, #dcdfe6);
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.tx-number-input__control:last-child {
  border-right: 0;
  border-left: 1px solid var(--tx-border-color, #dcdfe6);
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
