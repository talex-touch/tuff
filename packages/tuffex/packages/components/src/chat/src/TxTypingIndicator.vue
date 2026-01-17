<script setup lang="ts">
import type { TypingIndicatorProps } from './types'
import { computed, useId } from 'vue'

defineOptions({
  name: 'TxTypingIndicator',
})

const props = withDefaults(defineProps<TypingIndicatorProps>(), {
  variant: 'dots',
  text: 'Typing…',
  showText: true,
  size: 6,
  gap: 5,
  loaderSize: 44,
  pureSize: 14,
  ringSize: 18,
  ringThickness: 2,
  circleDashSize: 18,
  circleDashThickness: 2,
  circleDashDashDeg: 12,
  circleDashGapDeg: 12,
  barsSize: 12,
})

const uid = useId()
const maskId = `tx-typing-indicator-mask-${uid}`

const normalizedVariant = computed(() => props.variant ?? 'dots')

const dotStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))

const dotsStyle = computed(() => ({
  gap: `${props.gap}px`,
}))

const aiWrapStyle = computed(() => ({
  '--tx-typing-ai-size': `${props.loaderSize ?? 44}px`,
  '--tx-typing-ai-scale': String((props.loaderSize ?? 44) / 100),
}))

const aiBoxMaskStyle = computed(() => ({
  mask: `url(#${maskId})`,
  WebkitMask: `url(#${maskId})`,
}))

const pureStyle = computed(() => ({
  '--tx-typing-pure-size': `${props.pureSize ?? 14}px`,
}))

const ringStyle = computed(() => ({
  '--tx-typing-ring-size': `${props.ringSize ?? 18}px`,
  '--tx-typing-ring-thickness': `${props.ringThickness ?? 2}px`,
}))

const barsStyle = computed(() => ({
  '--tx-typing-bars-size': `${props.barsSize ?? 12}px`,
}))

const circleDashStyle = computed(() => ({
  '--tx-typing-circle-dash-size': `${props.circleDashSize ?? 18}px`,
  '--tx-typing-circle-dash-thickness': `${props.circleDashThickness ?? 2}px`,
  '--tx-typing-circle-dash-deg': `${props.circleDashDashDeg ?? 12}deg`,
  '--tx-typing-circle-gap-deg': `${props.circleDashGapDeg ?? 12}deg`,
}))
</script>

<template>
  <div class="tx-typing-indicator" role="status" aria-live="polite">
    <div v-if="normalizedVariant === 'ai'" class="tx-typing-indicator__ai-wrap" :style="aiWrapStyle" aria-hidden="true">
      <div class="tx-typing-indicator__ai">
        <svg class="tx-typing-indicator__ai-svg" width="100" height="100" viewBox="0 0 100 100">
          <defs>
            <mask :id="maskId" class="tx-typing-indicator__ai-mask">
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div class="tx-typing-indicator__ai-box" :style="aiBoxMaskStyle" />
      </div>
    </div>

    <div v-else-if="normalizedVariant === 'pure'" class="tx-typing-indicator__pure" :style="pureStyle" aria-hidden="true" />

    <div v-else-if="normalizedVariant === 'ring'" class="tx-typing-indicator__ring" :style="ringStyle" aria-hidden="true" />

    <div v-else-if="normalizedVariant === 'circle-dash'" class="tx-typing-indicator__circle-dash" :style="circleDashStyle" aria-hidden="true" />

    <div v-else-if="normalizedVariant === 'bars'" class="tx-typing-indicator__bars" :style="barsStyle" aria-hidden="true">
      <span class="tx-typing-indicator__bar" />
      <span class="tx-typing-indicator__bar" />
      <span class="tx-typing-indicator__bar" />
    </div>

    <div v-else class="tx-typing-indicator__dots" :style="dotsStyle" aria-hidden="true">
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
    </div>
    <span v-if="showText" class="tx-typing-indicator__text">{{ text }}</span>
  </div>
</template>

<style scoped lang="scss">
.tx-typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;
}

.tx-typing-indicator__circle-dash {
  width: var(--tx-typing-circle-dash-size, 18px);
  height: var(--tx-typing-circle-dash-size, 18px);
  border-radius: 999px;
  background: repeating-conic-gradient(
    from 0deg,
    currentColor 0 var(--tx-typing-circle-dash-deg, 12deg),
    transparent var(--tx-typing-circle-dash-deg, 12deg) calc(var(--tx-typing-circle-dash-deg, 12deg) + var(--tx-typing-circle-gap-deg, 12deg))
  );
  mask: radial-gradient(
    farthest-side,
    transparent calc(100% - var(--tx-typing-circle-dash-thickness, 2px)),
    #000 calc(100% - var(--tx-typing-circle-dash-thickness, 2px) + 1px)
  );
  -webkit-mask: radial-gradient(
    farthest-side,
    transparent calc(100% - var(--tx-typing-circle-dash-thickness, 2px)),
    #000 calc(100% - var(--tx-typing-circle-dash-thickness, 2px) + 1px)
  );
  animation: tx-typing-circle-dash-rotate 0.95s linear infinite;
  opacity: 0.95;
}

.tx-typing-indicator__dots {
  display: inline-flex;
  align-items: center;
}

.tx-typing-indicator__dot {
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 72%, transparent);
  animation: tx-typing-indicator-bounce 1.1s infinite ease-in-out;
}

.tx-typing-indicator__dot:nth-child(2) {
  animation-delay: 0.12s;
}

.tx-typing-indicator__dot:nth-child(3) {
  animation-delay: 0.24s;
}

.tx-typing-indicator__pure {
  width: var(--tx-typing-pure-size, 14px);
  height: var(--tx-typing-pure-size, 14px);
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
  border-top-color: currentColor;
  animation: tx-typing-pure-rotate 0.8s linear infinite;
  opacity: 0.9;
}

.tx-typing-indicator__ring {
  width: var(--tx-typing-ring-size, 18px);
  height: var(--tx-typing-ring-size, 18px);
  border-radius: 999px;
  background: conic-gradient(
    from 0deg,
    currentColor 0deg,
    currentColor 92deg,
    transparent 92deg,
    transparent 360deg
  );
  mask: radial-gradient(
    farthest-side,
    transparent calc(100% - var(--tx-typing-ring-thickness, 2px)),
    #000 calc(100% - var(--tx-typing-ring-thickness, 2px) + 1px)
  );
  -webkit-mask: radial-gradient(
    farthest-side,
    transparent calc(100% - var(--tx-typing-ring-thickness, 2px)),
    #000 calc(100% - var(--tx-typing-ring-thickness, 2px) + 1px)
  );
  animation: tx-typing-ring-rotate 0.9s linear infinite;
  opacity: 0.95;
}

.tx-typing-indicator__bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: var(--tx-typing-bars-size, 12px);
}

.tx-typing-indicator__bar {
  width: max(2px, calc(var(--tx-typing-bars-size, 12px) / 6));
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 75%, transparent);
  transform-origin: center bottom;
  animation: tx-typing-bars-pulse 0.92s ease-in-out infinite;
}

.tx-typing-indicator__bar:nth-child(2) {
  animation-delay: 0.12s;
}

.tx-typing-indicator__bar:nth-child(3) {
  animation-delay: 0.24s;
}

.tx-typing-indicator__ai-wrap {
  width: var(--tx-typing-ai-size, 44px);
  height: var(--tx-typing-ai-size, 44px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tx-typing-indicator__ai {
  --tx-typing-ai-color-one: var(--tx-color-warning, #ffbf48);
  --tx-typing-ai-color-two: var(--tx-color-danger, #be4a1d);
  --tx-typing-ai-color-three: color-mix(in srgb, var(--tx-typing-ai-color-one) 50%, transparent);
  --tx-typing-ai-color-four: color-mix(in srgb, var(--tx-typing-ai-color-two) 50%, transparent);
  --tx-typing-ai-color-five: color-mix(in srgb, var(--tx-typing-ai-color-one) 25%, transparent);
  --tx-typing-ai-time: 2s;

  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  transform: scale(var(--tx-typing-ai-scale, 0.44));
  transform-origin: center;
  box-shadow:
    0 0 25px 0 var(--tx-typing-ai-color-three),
    0 20px 50px 0 var(--tx-typing-ai-color-four);
  animation: tx-typing-ai-colorize calc(var(--tx-typing-ai-time) * 3) ease-in-out infinite;
}

.tx-typing-indicator__ai::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border-top: solid 1px var(--tx-typing-ai-color-one);
  border-bottom: solid 1px var(--tx-typing-ai-color-two);
  background: linear-gradient(180deg, var(--tx-typing-ai-color-five), var(--tx-typing-ai-color-four));
  box-shadow:
    inset 0 10px 10px 0 var(--tx-typing-ai-color-three),
    inset 0 -10px 10px 0 var(--tx-typing-ai-color-four);
}

.tx-typing-indicator__ai-box {
  width: 100px;
  height: 100px;
  background: linear-gradient(
    180deg,
    var(--tx-typing-ai-color-one) 30%,
    var(--tx-typing-ai-color-two) 70%
  );
}

.tx-typing-indicator__ai-svg {
  position: absolute;
  top: 0;
  left: 0;
}

.tx-typing-indicator__ai-mask {
  filter: contrast(15);
  animation: tx-typing-ai-roundness calc(var(--tx-typing-ai-time) / 2) linear infinite;
}

.tx-typing-indicator__ai-mask polygon {
  filter: blur(7px);
}

.tx-typing-indicator__ai-mask polygon:nth-child(1) {
  transform-origin: 75% 25%;
  transform: rotate(90deg);
}

.tx-typing-indicator__ai-mask polygon:nth-child(2) {
  transform-origin: 50% 50%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite reverse;
}

.tx-typing-indicator__ai-mask polygon:nth-child(3) {
  transform-origin: 50% 60%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite;
  animation-delay: calc(var(--tx-typing-ai-time) / -3);
}

.tx-typing-indicator__ai-mask polygon:nth-child(4) {
  transform-origin: 40% 40%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite reverse;
}

.tx-typing-indicator__ai-mask polygon:nth-child(5) {
  transform-origin: 40% 40%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite reverse;
  animation-delay: calc(var(--tx-typing-ai-time) / -2);
}

.tx-typing-indicator__ai-mask polygon:nth-child(6) {
  transform-origin: 60% 40%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite;
}

.tx-typing-indicator__ai-mask polygon:nth-child(7) {
  transform-origin: 60% 40%;
  animation: tx-typing-ai-rotation var(--tx-typing-ai-time) linear infinite;
  animation-delay: calc(var(--tx-typing-ai-time) / -1.5);
}

@keyframes tx-typing-indicator-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@keyframes tx-typing-ai-rotation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-typing-ai-roundness {
  0% {
    filter: contrast(15);
  }
  20% {
    filter: contrast(3);
  }
  40% {
    filter: contrast(3);
  }
  60% {
    filter: contrast(15);
  }
  100% {
    filter: contrast(15);
  }
}

@keyframes tx-typing-ai-colorize {
  0% {
    filter: hue-rotate(0deg);
  }
  20% {
    filter: hue-rotate(-30deg);
  }
  40% {
    filter: hue-rotate(-60deg);
  }
  60% {
    filter: hue-rotate(-90deg);
  }
  80% {
    filter: hue-rotate(-45deg);
  }
  100% {
    filter: hue-rotate(0deg);
  }
}

@keyframes tx-typing-pure-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-typing-ring-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-typing-circle-dash-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-typing-bars-pulse {
  0%,
  100% {
    transform: scaleY(0.35);
    opacity: 0.45;
  }
  45% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
