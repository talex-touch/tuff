<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { KeyframeStrokeTextProps } from './types'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

defineOptions({
  name: 'TxKeyframeStrokeText',
})

const props = withDefaults(defineProps<KeyframeStrokeTextProps>(), {
  text: '',
  strokeColor: '#4C4CFF',
  fillColor: '#111827',
  durationMs: 1800,
  strokeWidth: 2,
  fontSize: 64,
  fontWeight: 700,
  fontFamily: 'inherit',
})

const measureRef = ref<SVGTextElement>()
const textLength = ref(100)
const viewBox = ref('0 0 100 100')
const textX = ref(0)
const textY = ref(0)

const renderedText = computed(() => props.text || '\u00A0')

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

function syncMetrics() {
  const el = measureRef.value
  if (!el)
    return

  const bbox = el.getBBox()
  const width = Math.max(1, bbox.width)
  const height = Math.max(1, bbox.height)
  const padding = Math.max(4, props.strokeWidth * 3)

  textX.value = padding - bbox.x
  textY.value = padding - bbox.y
  viewBox.value = `0 0 ${width + padding * 2} ${height + padding * 2}`
  textLength.value = Math.max(1, el.getComputedTextLength())
}

const styleVars = computed<CSSProperties>(() => ({
  '--tx-kf-stroke-color': props.strokeColor,
  '--tx-kf-fill-color': props.fillColor,
  '--tx-kf-duration': `${props.durationMs}ms`,
  '--tx-kf-stroke-width': `${props.strokeWidth}`,
  '--tx-kf-stroke-length': `${textLength.value}`,
  '--tx-kf-font-size': toCssUnit(props.fontSize),
  '--tx-kf-font-weight': String(props.fontWeight),
  '--tx-kf-font-family': props.fontFamily,
}))

watch(
  () => [renderedText.value, props.fontSize, props.fontWeight, props.fontFamily, props.strokeWidth],
  async () => {
    await nextTick()
    syncMetrics()
  },
  { immediate: true },
)

onMounted(() => {
  if ('fonts' in document) {
    void document.fonts.ready.then(() => {
      syncMetrics()
    })
  }
})
</script>

<template>
  <svg
    class="tx-keyframe-stroke-text"
    :style="styleVars"
    :viewBox="viewBox"
    preserveAspectRatio="xMinYMid meet"
    role="img"
    :aria-label="text || undefined"
  >
    <text
      ref="measureRef"
      class="tx-keyframe-stroke-text__measure"
      :x="textX"
      :y="textY"
    >
      {{ renderedText }}
    </text>
    <text
      class="tx-keyframe-stroke-text__stroke"
      :x="textX"
      :y="textY"
    >
      {{ renderedText }}
    </text>
    <text
      class="tx-keyframe-stroke-text__fill"
      :x="textX"
      :y="textY"
    >
      {{ renderedText }}
    </text>
  </svg>
</template>

<style scoped lang="scss">
.tx-keyframe-stroke-text {
  display: inline-block;
  width: auto;
  height: var(--tx-kf-font-size, 64px);
  overflow: visible;
}

.tx-keyframe-stroke-text text {
  font-size: var(--tx-kf-font-size, 64px);
  font-family: var(--tx-kf-font-family, inherit);
  font-weight: var(--tx-kf-font-weight, 700);
  letter-spacing: 0.012em;
  dominant-baseline: alphabetic;
}

.tx-keyframe-stroke-text__measure {
  opacity: 0;
  fill: transparent;
  stroke: none;
}

.tx-keyframe-stroke-text__stroke {
  fill: transparent;
  stroke: var(--tx-kf-stroke-color, #4C4CFF);
  stroke-width: var(--tx-kf-stroke-width, 2);
  stroke-linejoin: round;
  stroke-linecap: round;
  paint-order: stroke fill;
  stroke-dasharray: var(--tx-kf-stroke-length, 100);
  stroke-dashoffset: var(--tx-kf-stroke-length, 100);
  animation: tx-kf-stroke-draw var(--tx-kf-duration, 1800ms) cubic-bezier(0.65, 0, 0.35, 1) forwards;
}

.tx-keyframe-stroke-text__fill {
  fill: var(--tx-kf-fill-color, #111827);
  opacity: 0;
  animation: tx-kf-fill-reveal var(--tx-kf-duration, 1800ms) ease forwards;
}

@keyframes tx-kf-stroke-draw {
  0% {
    stroke-dashoffset: var(--tx-kf-stroke-length, 100);
  }
  70% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes tx-kf-fill-reveal {
  0%,
  55% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-keyframe-stroke-text__stroke {
    animation: none;
    stroke-dashoffset: 0;
  }

  .tx-keyframe-stroke-text__fill {
    animation: none;
    opacity: 1;
  }
}
</style>
