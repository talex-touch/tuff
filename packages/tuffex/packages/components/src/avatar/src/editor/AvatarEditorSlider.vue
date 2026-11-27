<script setup lang="ts">
import type { AvatarEditorIconName } from './icons'
import { computed, ref } from 'vue'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorIcon from './AvatarEditorIcon.vue'

defineOptions({ name: 'AvatarEditorSlider' })

const props = withDefaults(defineProps<{
  modelValue: number
  min: number
  max: number
  step?: number
  icon?: AvatarEditorIconName
  label: string
  readout?: string
  /** Highlights fill outward from center (e.g. -180°..180° angle) and renders a center tick mark. */
  centerOrigin?: boolean
  /** Optional magnetic snap points while dragging (e.g. `[0, -90, 90]`). */
  snapPoints?: readonly number[]
  snapThreshold?: number
  /** Clicking the readout smoothly resets to this value when defined. */
  resetValue?: number
  resetTitle?: string
}>(), {
  step: 1,
  centerOrigin: false,
  snapThreshold: 3,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'reset': [value: number]
}>()

const dragging = ref(false)

const ratio = computed(() => {
  const span = props.max - props.min
  if (span <= 0)
    return 0
  return Math.max(0, Math.min(1, (props.modelValue - props.min) / span))
})

const fillStyle = computed(() => {
  const pct = ratio.value * 100
  if (props.centerOrigin) {
    const start = Math.min(50, pct)
    const width = Math.abs(pct - 50)
    return { left: `${start}%`, width: `${width}%` }
  }
  return { left: '0%', width: `${pct}%` }
})

const thumbStyle = computed(() => ({
  left: `${ratio.value * 100}%`,
}))

const isModified = computed(() =>
  typeof props.resetValue === 'number' && Math.abs(props.modelValue - props.resetValue) > props.step * 0.5,
)

function applySnap(raw: number): number {
  if (!props.snapPoints?.length)
    return raw
  for (const pt of props.snapPoints) {
    if (Math.abs(raw - pt) <= props.snapThreshold)
      return pt
  }
  return raw
}

function onInput(ev: Event): void {
  const raw = Number((ev.target as HTMLInputElement).value)
  if (!Number.isFinite(raw))
    return
  emit('update:modelValue', applySnap(raw))
}

function handleReset(): void {
  if (typeof props.resetValue !== 'number')
    return
  emit('reset', props.resetValue)
}
</script>

<template>
  <div class="tx-ae-slider" :class="{ 'is-dragging': dragging }">
    <TxTooltip v-if="icon" :content="label">
      <span class="tx-ae-slider__icon" aria-hidden="true">
        <AvatarEditorIcon :name="icon" :size="14" />
      </span>
    </TxTooltip>

    <div class="tx-ae-slider__track-wrap">
      <div class="tx-ae-slider__rail">
        <span v-if="centerOrigin" class="tx-ae-slider__detent" aria-hidden="true" />
        <span class="tx-ae-slider__fill" :style="fillStyle" />
        <span class="tx-ae-slider__thumb" :style="thumbStyle" />
      </div>
      <input
        type="range"
        class="tx-ae-slider__native"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="label"
        @input="onInput"
        @pointerdown="dragging = true"
        @pointerup="dragging = false"
        @pointercancel="dragging = false"
        @blur="dragging = false"
        @dblclick="handleReset"
      >
    </div>

    <button
      v-if="readout !== undefined && typeof resetValue === 'number'"
      type="button"
      class="tx-ae-slider__readout tx-ae-slider__readout--btn"
      :class="{ 'is-modified': isModified }"
      :title="resetTitle || label"
      @click="handleReset"
    >
      {{ readout }}
    </button>
    <span v-else-if="readout !== undefined" class="tx-ae-slider__readout">
      {{ readout }}
    </span>
  </div>
</template>

<style lang="scss">
.tx-ae-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tx-ae-slider__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-ae-slider__track-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 7px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.tx-ae-slider__rail {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--tx-fill-color-dark, #e4e7ed);
}

.tx-ae-slider__detent {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 8px;
  border-radius: 1px;
  transform: translate(-50%, -50%);
  background: var(--tx-border-color, #cbd5e1);
}

.tx-ae-slider__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: var(--tx-color-primary, #409eff);
}

.tx-ae-slider__thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(1);
  background: var(--tx-bg-color, #ffffff);
  box-shadow:
    0 1px 3px color-mix(in srgb, var(--tx-color-black, #000000) 18%, transparent),
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff);
  transition:
    transform 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-ae-slider__track-wrap:hover .tx-ae-slider__thumb {
  transform: translate(-50%, -50%) scale(1.12);
}

.tx-ae-slider.is-dragging .tx-ae-slider__thumb {
  transform: translate(-50%, -50%) scale(1.2);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent),
    0 1px 4px color-mix(in srgb, var(--tx-color-black, #000000) 20%, transparent),
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff);
}

.tx-ae-slider__native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;

  &:focus-visible + .tx-ae-slider__rail,
  &:focus-visible ~ .tx-ae-slider__rail {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 4px;
  }
}

.tx-ae-slider__track-wrap:has(.tx-ae-slider__native:focus-visible) .tx-ae-slider__thumb {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 24%, transparent),
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff);
}

.tx-ae-slider__readout {
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-ae-slider__readout--btn {
  appearance: none;
  padding: 2px 5px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;
  transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &.is-modified {
    color: var(--tx-color-primary, #409eff);
    font-weight: 500;
  }

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active {
    transform: scale(0.95);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
