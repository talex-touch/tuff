<script setup lang="ts">
import type { TxRadioGroupProps, TxRadioIndicatorVariant, TxRadioValue } from './types'
import { computed, provide, ref, toRefs } from 'vue'
import { TxGlassSurface } from '../../glass-surface'
import { useRadioGroupIndicator } from './radio-group-indicator'
import { useRadioGroupModel } from './radio-group-model'

defineOptions({ name: 'TxRadioGroup' })

const props = withDefaults(defineProps<TxRadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  type: 'button',
  indicatorVariant: undefined,
  glass: false,
  blur: false,
  stiffness: 110,
  damping: 12,
  blurAmount: 1,
  elastic: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: TxRadioValue): void
  (e: 'change', v: TxRadioValue): void
}>()

const { disabled, type } = toRefs(props)

const resolvedIndicatorVariant = computed<TxRadioIndicatorVariant>(() => {
  const v = props.indicatorVariant
  if (v)
    return v
  if (props.glass)
    return 'glass'
  if (props.blur)
    return 'blur'
  return 'solid'
})

const useGlassIndicator = computed(() => type.value === 'button' && resolvedIndicatorVariant.value === 'glass')
const useBlurIndicator = computed(() => type.value === 'button' && resolvedIndicatorVariant.value === 'blur')

const resolvedDirection = computed(() => {
  if (type.value === 'button') {
    return 'row'
  }
  if (type.value === 'standard') {
    return props.direction ?? 'row'
  }
  return props.direction ?? 'column'
})

const updateModelOnSettled = computed(() => {
  const enabled = props.updateOnSettled
    ?? (resolvedIndicatorVariant.value === 'glass' || resolvedIndicatorVariant.value === 'blur')
  return enabled && type.value === 'button'
})

const groupRef = ref<HTMLElement | null>(null)
const { model, commitPendingModelValue } = useRadioGroupModel({
  props,
  updateModelOnSettled,
  emit,
})

const {
  indicatorVisible,
  currentRect,
  isDragging,
  motionPhase,
  motionActive,
  outlineStyle,
  glassWrapStyle,
  glassInnerStyle,
  glassRadius,
  glassLook,
  blurWrapStyle,
  plainIndicatorStyle,
  hitStyle,
  onPointerDown,
  onKeydown,
} = useRadioGroupIndicator({
  props,
  groupRef,
  type,
  disabled,
  modelValue: model,
  commitPendingModelValue,
})

const ctx = {
  model,
  disabled: computed(() => disabled.value),
  type: computed(() => type.value),
}

provide('tx-radio-group', ctx)
</script>

<template>
  <div
    ref="groupRef"
    class="tx-radio-group"
    role="radiogroup"
    :aria-disabled="disabled"
    :class="[
      `tx-radio-group--${type}`,
      `tx-radio-group--dir-${resolvedDirection}`,
      `tx-radio-group--indicator-${resolvedIndicatorVariant}`,
      { 'is-motion': motionActive },
    ]"
    @keydown="onKeydown"
  >
    <span v-if="type === 'button'" class="tx-radio-group__indicator-outline" :style="outlineStyle" aria-hidden="true" />

    <TxGlassSurface
      v-if="useGlassIndicator && indicatorVisible"
      class="tx-radio-group__indicator-glass-wrap"
      :class="{ 'is-active': motionActive, 'is-sink': motionPhase === 'sink', 'is-emerge': motionPhase === 'emerge' }"
      :style="glassWrapStyle"
      :width="currentRect.width || 1"
      :height="currentRect.height || 1"
      :border-radius="glassRadius"
      :border-width="8"
      :brightness="glassLook.brightness"
      :opacity="glassLook.opacity"
      :blur="2"
      :displace="0.25"
      :background-opacity="glassLook.backgroundOpacity"
      :saturation="glassLook.saturation"
      :distortion-scale="2"
      :red-offset="0"
      :green-offset="4"
      :blue-offset="8"
      aria-hidden="true"
    >
      <div class="tx-radio-group__indicator-glass-inner" :style="glassInnerStyle" />
    </TxGlassSurface>

    <span
      v-if="useBlurIndicator && indicatorVisible"
      class="tx-radio-group__indicator-blur"
      :class="{ 'is-active': motionActive }"
      :style="blurWrapStyle"
      aria-hidden="true"
    />

    <span
      v-if="type === 'button' && indicatorVisible"
      class="tx-radio-group__indicator-plain"
      :class="{ 'is-active': motionActive }"
      :style="plainIndicatorStyle"
      aria-hidden="true"
    />

    <span
      v-if="type === 'button' && indicatorVisible"
      class="tx-radio-group__indicator-hit"
      :class="{ 'is-dragging': isDragging }"
      :style="hitStyle"
      aria-hidden="true"
      @pointerdown="onPointerDown"
    />
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-radio-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  touch-action: none;

  &--button {
    flex-wrap: wrap;
    padding: 3px;
    gap: 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  }

  &--standard {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
  }

  &--card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 0;
    border: none;
    background: transparent;
  }
}

.tx-radio-group--standard.tx-radio-group--dir-row,
.tx-radio-group--card.tx-radio-group--dir-row {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.tx-radio-group__indicator-outline {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0));
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 55%, transparent);
  // box-shadow:
  //   0 10px 18px rgba(15, 23, 42, 0.08),
  //   inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transition: opacity 40ms ease;
  pointer-events: none;
  z-index: 0;
}

.tx-radio-group__indicator-glass-wrap {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 10;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 80%, transparent);
  will-change: transform, opacity;
  transition: opacity 40ms ease, filter 40ms ease;
  opacity: 0;
}

.tx-radio-group__indicator-glass-wrap.is-active {
  opacity: 1;
}

.tx-radio-group__indicator-glass-inner {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  transition: transform 120ms ease;
  background:
    radial-gradient(ellipse 80% 60% at 20% 15%, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 55%),
    radial-gradient(ellipse 50% 40% at 75% 80%, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0) 50%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 60%);
}

.tx-radio-group__indicator-blur {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
  will-change: transform, opacity, backdrop-filter;
  transition: opacity 40ms ease, box-shadow 40ms ease, backdrop-filter 55ms ease, -webkit-backdrop-filter 55ms ease;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 40%, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tx-radio-group__indicator-blur.is-active {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.tx-radio-group__indicator-plain {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  pointer-events: none;
  z-index: 0;
  will-change: transform, opacity;
  transition: opacity 40ms ease, box-shadow 40ms ease;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 50%, transparent);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.17);
}

.tx-radio-group--indicator-outline .tx-radio-group__indicator-plain {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 40%, var(--tx-color-primary, #409eff));
  box-shadow: none;
}

// .tx-radio-group__indicator-plain.is-active {
//   box-shadow:
//     0 10px 20px rgba(15, 23, 42, 0.12),
//     inset 0 1px 0 rgba(255, 255, 255, 0.75);
// }

.tx-radio-group__indicator-hit {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  cursor: grab;
  z-index: 2;
}

.tx-radio-group__indicator-hit.is-dragging {
  pointer-events: none;
}

.tx-radio-group__indicator-hit:active {
  cursor: grabbing;
}

.tx-radio-group--button :deep(.tx-radio) {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  white-space: nowrap;
}
</style>
