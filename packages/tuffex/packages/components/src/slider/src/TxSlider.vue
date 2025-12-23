<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SliderEmits, SliderProps } from './types'

defineOptions({
  name: 'TxSlider',
})

const props = withDefaults(defineProps<SliderProps>(), {
  modelValue: 0,
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  showValue: false,
})

const emit = defineEmits<SliderEmits>()

const inputRef = ref<HTMLInputElement | null>(null)

const clampedValue = computed(() => {
  const v = Number.isFinite(props.modelValue) ? props.modelValue : props.min
  return Math.min(props.max, Math.max(props.min, v))
})

const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return ((clampedValue.value - props.min) / range) * 100
})

const displayValue = computed(() => {
  return props.formatValue ? props.formatValue(clampedValue.value) : String(clampedValue.value)
})

function updateValue(next: number) {
  const v = Math.min(props.max, Math.max(props.min, next))
  emit('update:modelValue', v)
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  updateValue(Number(el.value))
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  emit('change', Number(el.value))
}

watch(
  () => props.modelValue,
  () => {
    if (inputRef.value) {
      inputRef.value.value = String(clampedValue.value)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="tx-slider" :class="{ 'is-disabled': disabled }">
    <input
      ref="inputRef"
      class="tx-slider__input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :value="clampedValue"
      @input="onInput"
      @change="onChange"
    />

    <div class="tx-slider__track" aria-hidden="true">
      <div class="tx-slider__range" :style="{ width: `${percent}%` }" />
    </div>

    <div v-if="showValue" class="tx-slider__value">{{ displayValue }}</div>
  </div>
</template>

<style lang="scss">
.tx-slider {
  --tx-slider-height: 16px;
  --tx-slider-track-height: 4px;
  --tx-slider-thumb-size: 14px;
  --tx-slider-thumb-shadow: 0 0 0 6px color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);

  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  &:hover {
    --tx-slider-track-height: 8px;
    --tx-slider-thumb-size: 18px;
  }

  &:active {
    --tx-slider-track-height: 10px;
    --tx-slider-thumb-size: 20px;
  }

  &__track {
    position: relative;
    flex: 1;
    height: var(--tx-slider-height);
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  &__track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: var(--tx-slider-track-height);
    border-radius: 999px;
    background: var(--tx-fill-color, #f0f2f5);
  }

  &__range {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: var(--tx-slider-track-height);
    border-radius: 999px;
    background: var(--tx-color-primary, #409eff);
  }

  &__input {
    flex: 1;
    width: 100%;
    height: var(--tx-slider-height);
    margin: 0;
    cursor: pointer;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    outline: none;
    position: relative;
    z-index: 1;

    &::-webkit-slider-runnable-track {
      height: var(--tx-slider-height);
      background: transparent;
    }

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: var(--tx-slider-thumb-size);
      height: var(--tx-slider-thumb-size);
      border-radius: 999px;
      background: var(--tx-color-primary, #409eff);
      border: 2px solid color-mix(in srgb, var(--tx-bg-color, #fff) 85%, transparent);
      box-shadow: var(--tx-slider-thumb-shadow);
      margin-top: calc((var(--tx-slider-height) - var(--tx-slider-thumb-size)) / 2);
      transition: width 0.18s ease, height 0.18s ease, box-shadow 0.18s ease;
    }

    &:active::-webkit-slider-thumb {
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--tx-color-primary, #409eff) 25%, transparent);
    }
  }

  &__value {
    font-size: 12px;
    color: var(--tx-text-color-secondary, #909399);
    min-width: 36px;
    text-align: right;
  }

  &.is-disabled {
    opacity: 0.6;

    .tx-slider__input {
      cursor: not-allowed;
    }

    .tx-slider__range {
      background: var(--tx-text-color-placeholder, #a8abb2);
    }
  }
}
</style>
