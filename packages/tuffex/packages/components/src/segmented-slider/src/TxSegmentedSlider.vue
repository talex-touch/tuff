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

const currentIndex = computed(() => {
  const index = props.segments.findIndex(seg => seg.value === props.modelValue)
  return Math.max(0, index)
})

const progressPercent = computed(() => {
  if (props.segments.length <= 1)
    return 0
  return (currentIndex.value / (props.segments.length - 1)) * 100
})

const segmentDenom = computed(() => {
  return Math.max(1, props.segments.length - 1)
})

function segmentLeftPercent(index: number) {
  return (index / segmentDenom.value) * 100
}

function handleSegmentClick(segment: SegmentedSliderSegment) {
  if (props.disabled)
    return
  emit('update:modelValue', segment.value)
  emit('change', segment.value)
}

function handleKeydown(e: KeyboardEvent, segment: SegmentedSliderSegment) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    handleSegmentClick(segment)
  }
}

onMounted(() => {
  // Auto select first segment if no value provided and segments exist
  if (props.modelValue == null && props.segments.length > 0) {
    emit('update:modelValue', props.segments[0].value)
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
  >
    <!-- Track -->
    <div class="tx-segmented-slider__track">
      <div class="tx-segmented-slider__progress" :style="{ width: `${progressPercent}%` }" />

      <!-- Segments -->
      <div
        v-for="(segment, index) in segments"
        :key="segment.value"
        class="tx-segmented-slider__segment"
        :class="{
          'is-active': segment.value === modelValue,
          'is-completed': index < currentIndex,
        }"
        :style="{ left: `${segmentLeftPercent(index)}%` }"
        tabindex="0"
        role="button"
        :aria-pressed="segment.value === modelValue"
        @click="handleSegmentClick(segment)"
        @keydown="(e) => handleKeydown(e, segment)"
      >
        <div class="tx-segmented-slider__dot" />
        <div v-if="showLabels && segment.label" class="tx-segmented-slider__label">
          {{ segment.label }}
        </div>
      </div>
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
    background: var(--tx-fill-color-light, #f5f7fa);
    border-radius: 999px;
    margin: calc((var(--tx-segmented-slider-dot-size) - var(--tx-segmented-slider-track-height)) / 2) 0;
  }

  &__progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--tx-color-primary, #409eff);
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  &__segment {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    cursor: pointer;
    outline: none;
    transition: all 0.2s ease;

    &:focus {
      .tx-segmented-slider__dot {
        box-shadow: 0 0 0 2px var(--tx-color-primary, #409eff);
      }
    }

    &.is-active {
      .tx-segmented-slider__dot {
        width: var(--tx-segmented-slider-dot-active-size);
        height: var(--tx-segmented-slider-dot-active-size);
        background: var(--tx-color-primary, #409eff);
        border-color: var(--tx-color-primary, #409eff);
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

  &__dot {
    width: var(--tx-segmented-slider-dot-size);
    height: var(--tx-segmented-slider-dot-size);
    border-radius: 50%;
    background: var(--tx-bg-color, #ffffff);
    border: 2px solid var(--tx-border-color, #dcdfe6);
    transition: all 0.2s ease;
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
    color: var(--tx-text-color-regular, #606266);
    white-space: nowrap;
    transition: all 0.2s ease;
    line-height: 1.2;
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
