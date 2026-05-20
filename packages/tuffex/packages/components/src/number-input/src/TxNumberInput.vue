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

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const wrapperStyle = computed(() => attrs.style as StyleValue)

const displayValue = computed({
  get: () => props.modelValue ?? '',
  set: (value: string | number) => {
    commitValue(parseValue(String(value)), true)
  },
})

const canDecrease = computed(() => {
  return !props.disabled && !props.readonly && (props.min === undefined || (props.modelValue ?? 0) > props.min)
})

const canIncrease = computed(() => {
  return !props.disabled && !props.readonly && (props.max === undefined || (props.modelValue ?? 0) < props.max)
})

function parseValue(raw: string): number | null {
  if (raw.trim() === '')
    return null
  const value = Number(raw)
  return Number.isFinite(value) ? normalizeValue(value) : props.modelValue ?? null
}

function normalizeValue(value: number): number {
  let next = value
  if (props.min !== undefined)
    next = Math.max(props.min, next)
  if (props.max !== undefined)
    next = Math.min(props.max, next)
  if (props.precision !== undefined)
    next = Number(next.toFixed(props.precision))
  return next
}

function commitValue(value: number | null, emitChange: boolean) {
  emit('update:modelValue', value)
  if (emitChange)
    emit('change', value)
}

function stepBy(direction: 1 | -1) {
  if (props.disabled || props.readonly)
    return
  const base = props.modelValue ?? 0
  commitValue(normalizeValue(base + props.step * direction), true)
}

function handleFocus(event: FocusEvent) {
  isFocused.value = true
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  isFocused.value = false
  commitValue(parseValue(inputRef.value?.value ?? ''), true)
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
      aria-label="Decrease value"
      @click="stepBy(-1)"
    >
      -
    </button>
    <input
      ref="inputRef"
      v-model="displayValue"
      class="tx-number-input__field"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      v-bind="inputAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
    >
    <button
      v-if="controls"
      type="button"
      class="tx-number-input__control"
      :disabled="!canIncrease"
      aria-label="Increase value"
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
