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
  emit('update:modelValue', dragging.value ? applySnap(raw) : raw)
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
  gap: 8px;
  min-width: 0;
}

.tx-ae-slider__icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--a-s);
}

.tx-ae-slider__track-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 7px;
  box-sizing: border-box;
}

.tx-ae-slider__rail {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--tx-fill-color-dark, #e4e7ed);
}

.tx-ae-slider__detent {
  left: 50%;
  width: 2px;
  height: 8px;
  border-radius: 1px;
  background: var(--tx-border-color, #cbd5e1);
}

.tx-ae-slider__fill {
  position: absolute;
  inset: 0 auto;
  border-radius: 999px;
  background: var(--a-p);
}

.tx-ae-slider__thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--a-b);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--a-k) 18%, transparent), inset 0 0 0 1.5px var(--a-p);
  transition: transform 180ms var(--a-e), box-shadow 180ms var(--a-e);
  pointer-events: none;
}

.tx-ae-slider__track-wrap:hover .tx-ae-slider__thumb {
  transform: translate(-50%, -50%) scale(1.12);
}

.tx-ae-slider.is-dragging .tx-ae-slider__thumb {
  transform: translate(-50%, -50%) scale(1.2);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--a-p) 18%, transparent), 0 1px 4px color-mix(in srgb, var(--a-k) 20%, transparent), inset 0 0 0 1.5px var(--a-p);
}

.tx-ae-slider__native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.tx-ae-slider__track-wrap:has(.tx-ae-slider__native:focus-visible) .tx-ae-slider__thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--a-p) 24%, transparent), inset 0 0 0 1.5px var(--a-p);
}

.tx-ae-slider__readout {
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--a-s);
}

.tx-ae-slider__readout--btn {
  padding: 2px 5px;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;

  &.is-modified {
    color: var(--a-p);
    font-weight: 500;
  }

  &:hover {
    background: var(--a-f);
    color: var(--a-t);
  }
}
</style>
