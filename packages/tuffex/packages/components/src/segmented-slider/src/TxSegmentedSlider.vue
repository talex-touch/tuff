<script setup lang="ts">
import type { SegmentedSliderEmits, SegmentedSliderProps, SegmentedSliderSegment } from './types'
import { computed, onMounted, ref } from 'vue'

defineOptions({
  name: 'TxSegmentedSlider',
})

const props = withDefaults(defineProps<SegmentedSliderProps>(), {
  modelValue: 0,
  segments: () => [],
  disabled: false,
  showLabels: true,
  vertical: false,
})

const emit = defineEmits<SegmentedSliderEmits>()

const sliderRef = ref<HTMLDivElement | null>(null)
void sliderRef.value

const currentIndex = computed(() => {
  const index = props.segments.findIndex(seg => seg.value === props.modelValue)
  return Math.max(0, index)
})

const progressPercent = computed(() => {
  if (props.segments.length <= 1)
    return 0
  return (currentIndex.value / (props.segments.length - 1)) * 100
})

const progressStyle = computed(() => {
  const value = `${progressPercent.value}%`
  return props.vertical ? { height: value } : { width: value }
})

const segmentDenom = computed(() => {
  return Math.max(1, props.segments.length - 1)
})

function segmentLeftPercent(index: number) {
  return (index / segmentDenom.value) * 100
}

function segmentStyle(index: number) {
  const value = `${segmentLeftPercent(index)}%`
  return props.vertical ? { bottom: value } : { left: value }
}

function selectIndex(index: number) {
  if (props.disabled)
    return
  const segment = props.segments[index]
  if (!segment || segment.value === props.modelValue)
    return
  emit('update:modelValue', segment.value)
  emit('change', segment.value)
}

function handleSegmentClick(segment: SegmentedSliderSegment) {
  if (props.disabled)
    return
  emit('update:modelValue', segment.value)
  emit('change', segment.value)
}

/**
 * A row of mutually exclusive stops is a radio group, and a radio group moves
 * with the arrow keys: Tab reaches the row once and lands on the current stop.
 * The vertical layout stacks bottom-to-top, so Up advances there.
 */
function onKeydown(event: KeyboardEvent) {
  if (props.disabled || props.segments.length === 0)
    return

  const forward = props.vertical ? ['ArrowUp', 'ArrowRight'] : ['ArrowRight', 'ArrowDown']
  const backward = props.vertical ? ['ArrowDown', 'ArrowLeft'] : ['ArrowLeft', 'ArrowUp']
  const last = props.segments.length - 1

  let next = -1
  if (forward.includes(event.key))
    next = Math.min(last, currentIndex.value + 1)
  else if (backward.includes(event.key))
    next = Math.max(0, currentIndex.value - 1)
  else if (event.key === 'Home')
    next = 0
  else if (event.key === 'End')
    next = last
  else
    return

  event.preventDefault()
  selectIndex(next)
  segmentRefs.value[next]?.focus()
}

const segmentRefs = ref<(HTMLButtonElement | null)[]>([])

function setSegmentRef(el: Element | null, index: number) {
  segmentRefs.value[index] = el as HTMLButtonElement | null
}

onMounted(() => {
  // Auto select first segment if no value provided and segments exist
  if (props.modelValue == null && props.segments.length > 0) {
    const first = props.segments[0]
    if (first)
      emit('update:modelValue', first.value)
  }
})
</script>

<template>
  <div
    ref="sliderRef"
    class="tx-segmented-slider"
    :class="{
      'is-disabled': disabled,
      'is-vertical': vertical,
    }"
    role="radiogroup"
    :aria-disabled="disabled || undefined"
    :aria-orientation="vertical ? 'vertical' : 'horizontal'"
    @keydown="onKeydown"
  >
    <!-- Track -->
    <div class="tx-segmented-slider__track">
      <div class="tx-segmented-slider__progress" :style="progressStyle" />

      <!-- Segments -->
      <button
        v-for="(segment, index) in segments"
        :key="segment.value"
        :ref="el => setSegmentRef(el as Element | null, index)"
        type="button"
        class="tx-segmented-slider__segment"
        :class="{
          'is-active': segment.value === modelValue,
          'is-completed': index < currentIndex,
        }"
        :style="segmentStyle(index)"
        :disabled="disabled"
        role="radio"
        :aria-checked="segment.value === modelValue"
        :tabindex="disabled || index !== currentIndex ? -1 : 0"
        :aria-label="segment.label ?? String(segment.value)"
        @click="handleSegmentClick(segment)"
      >
        <span class="tx-segmented-slider__dot" />
        <span v-if="showLabels && segment.label" class="tx-segmented-slider__label">
          {{ segment.label }}
        </span>
      </button>
    </div>
  </div>
</template>

<style lang="scss">
.tx-segmented-slider {
  --tx-segmented-slider-height: 32px;
  --tx-segmented-slider-track-height: 4px;
  --tx-segmented-slider-dot-size: 16px;
  --tx-segmented-slider-dot-active-size: 20px;

  position: relative;
  width: 100%;
  min-height: var(--tx-segmented-slider-height);
  padding: 8px 0;

  &__track {
    position: relative;
    height: var(--tx-segmented-slider-track-height);
    // Tinted from the text colour, the one pair that really inverts between
    // themes: a fill token reads as a hole in the page on a dark surface.
    background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
    border-radius: 999px;
    margin: calc((var(--tx-segmented-slider-dot-size) - var(--tx-segmented-slider-track-height)) / 2) 0;
  }

  &__progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--tx-color-primary, #409eff) 62%, transparent),
      var(--tx-color-primary, #409eff)
    );
    border-radius: 999px;
    transition:
      width 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      height 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  &__segment {
    appearance: none;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    outline: none;

    &:disabled {
      cursor: not-allowed;
    }

    // Keyboard only: a pointer click already moves the fill, and a ring on
    // every click reads as an error state.
    &:focus-visible {
      .tx-segmented-slider__dot {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
      }
    }

    &:hover:not(:disabled):not(.is-active) {
      .tx-segmented-slider__dot {
        border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
        transform: scale(1.12);
      }

      .tx-segmented-slider__label {
        color: var(--tx-text-color-primary, #303133);
      }
    }

    &.is-active {
      .tx-segmented-slider__dot {
        width: var(--tx-segmented-slider-dot-active-size);
        height: var(--tx-segmented-slider-dot-active-size);
        background: var(--tx-color-primary, #409eff);
        border-color: var(--tx-color-primary, #409eff);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
      }

      .tx-segmented-slider__label {
        color: var(--tx-color-primary, #409eff);
        font-weight: 600;
      }
    }

    &.is-completed {
      .tx-segmented-slider__dot {
        background: var(--tx-color-primary, #409eff);
        border-color: var(--tx-color-primary, #409eff);
      }
    }
  }

  // `display: block` is the whole reason a stop is round: a bare `<span>` is
  // inline, which drops width and height and left the 2px border rendering as
  // a bare vertical stroke on the track.
  &__dot {
    display: block;
    box-sizing: border-box;
    width: var(--tx-segmented-slider-dot-size);
    height: var(--tx-segmented-slider-dot-size);
    border-radius: 50%;
    background: var(--tx-bg-color, #ffffff);
    border: 2px solid var(--tx-border-color, #dcdfe6);
    transition:
      width 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      height 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      transform 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
    margin: 0 auto;
    position: relative;
    z-index: 2;
  }

  &__label {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    color: var(--tx-text-color-secondary, #909399);
    white-space: nowrap;
    transition: color 0.2s ease, font-weight 0.2s ease;
    line-height: 1.2;
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-segmented-slider__progress,
    .tx-segmented-slider__dot,
    .tx-segmented-slider__label {
      transition: none;
    }
  }

  &.is-disabled {
    opacity: 0.6;
    pointer-events: none;

    .tx-segmented-slider__segment {
      cursor: not-allowed;
    }

    .tx-segmented-slider__progress {
      background: var(--tx-text-color-placeholder, #a8abb2);
    }
  }

  &.is-vertical {
    width: var(--tx-segmented-slider-height);
    min-height: 200px;
    padding: 0 8px;

    .tx-segmented-slider__track {
      width: var(--tx-segmented-slider-track-height);
      height: 100%;
      margin: 0 calc((var(--tx-segmented-slider-dot-size) - var(--tx-segmented-slider-track-height)) / 2);
    }

    .tx-segmented-slider__progress {
      width: 100%;
      height: var(--height, 0%);
      top: auto;
      bottom: 0;
    }

    .tx-segmented-slider__segment {
      left: 50%;
      top: auto;
      bottom: var(--bottom, 0%);
      transform: translate(-50%, 50%);
    }

    .tx-segmented-slider__label {
      top: 50%;
      left: calc(100% + 8px);
      transform: translateY(-50%);
    }
  }
}
</style>
