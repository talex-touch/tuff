<script setup lang="ts">
import type { StreamCaretProps } from './types'
import { useId } from 'vue'

defineOptions({ name: 'TxStreamCaret' })

defineProps<StreamCaretProps>()

// Gradient ids must survive several carets on one page.
const uid = useId()
const orbitGradient = `tx-stream-caret-orbit-${uid}`
const coreGradient = `tx-stream-caret-core-${uid}`
</script>

<template>
  <!-- The Tuff logo, reduced to a caret: its ring becomes a travelling arc and
       its core glyph breathes inside it (`apps/nexus/public/logo.svg`). -->
  <span class="tx-stream-caret" :data-state="state" aria-hidden="true">
    <svg class="tx-stream-caret__orbit" viewBox="0 0 100 100" focusable="false">
      <defs>
        <linearGradient :id="orbitGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class="tx-stream-caret__stop is-start" stop-opacity="0" />
          <stop offset="1" class="tx-stream-caret__stop is-end" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="`url(#${orbitGradient})`"
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray="190 400"
      />
    </svg>
    <svg class="tx-stream-caret__core" viewBox="22 22 56 56" focusable="false">
      <defs>
        <linearGradient :id="coreGradient" gradientTransform="rotate(45)">
          <stop offset="0" class="tx-stream-caret__stop is-start" />
          <stop offset="1" class="tx-stream-caret__stop is-end" />
        </linearGradient>
      </defs>
      <path
        d="M30,70 C35,65 45,65 50,70 Q55,75 60,70 L70,60 C75,55 75,45 70,40 L60,30 Q55,25 50,30 Q45,35 40,30 L30,40 C25,45 25,55 30,60 Z"
        :fill="`url(#${coreGradient})`"
      />
    </svg>
  </span>
</template>

<style lang="scss">
// Sized in em so it follows the text it trails.
.tx-stream-caret {
  position: relative;
  display: inline-block;
  width: 0.95em;
  height: 0.95em;
  vertical-align: -0.12em;
  pointer-events: none;
}

.tx-stream-caret__orbit,
.tx-stream-caret__core {
  position: absolute;
  overflow: visible;
}

.tx-stream-caret__orbit {
  top: -12%;
  left: -12%;
  width: 124%;
  height: 124%;
}

.tx-stream-caret__core {
  top: 22%;
  left: 22%;
  width: 56%;
  height: 56%;
  filter: drop-shadow(0 0 0.18em color-mix(in srgb, var(--tx-stream-caret-start, #199ffe) 55%, transparent));
}

.tx-stream-caret__stop.is-start {
  stop-color: var(--tx-stream-caret-start, #199ffe);
}

.tx-stream-caret__stop.is-end {
  stop-color: var(--tx-stream-caret-end, #810dc6);
}

// A looping effect plays while the model is busy, so it stays on the
// compositor: `rotate` and `scale` as individual properties, nothing read from
// a custom property inside the keyframes. Under reduced motion it rests as a
// still arc around the core.
@media (prefers-reduced-motion: no-preference) {
  .tx-stream-caret__orbit {
    animation: tx-stream-caret-orbit 1.6s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  }

  .tx-stream-caret__core {
    animation: tx-stream-caret-breath 1.8s ease-in-out infinite alternate;
  }
}

@keyframes tx-stream-caret-orbit {
  to {
    rotate: 360deg;
  }
}

@keyframes tx-stream-caret-breath {
  from {
    scale: 0.82;
    opacity: 0.78;
  }

  to {
    scale: 1.04;
    opacity: 1;
  }
}
</style>
