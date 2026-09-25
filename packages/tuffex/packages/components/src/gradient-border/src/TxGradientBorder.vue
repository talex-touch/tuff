<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { GradientBorderProps } from '../index'
import { computed } from 'vue'

defineOptions({
  name: 'TxGradientBorder',
})

const props = withDefaults(defineProps<GradientBorderProps>(), {
  as: 'div',
  borderWidth: '2px',
  borderRadius: '12px',
  padding: '12px',
  animationDuration: 4,
})

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

const rootStyle = computed<CSSProperties>(() => {
  return {
    '--tx-gradient-border-width': toCssUnit(props.borderWidth),
    '--tx-gradient-border-radius': toCssUnit(props.borderRadius),
    '--tx-gradient-inner-padding': toCssUnit(props.padding),
    '--tx-gradient-duration': `${props.animationDuration}s`,
  } as CSSProperties
})
</script>

<template>
  <component :is="as" class="tx-gradient-border" :style="rootStyle">
    <span class="tx-gradient-border__ring" aria-hidden="true" />
    <span class="tx-gradient-border__inner">
      <slot />
    </span>
  </component>
</template>

<style scoped>
@property --tx-gradient-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

/* Not clipped: the ring's glow has to spread past the edge. The root used to
   be `overflow: hidden`, which cut the outer half of the glow off flat. */
.tx-gradient-border {
  position: relative;
  display: block;
  border-radius: var(--tx-gradient-border-radius);
}

/* The blur sits on this layer and the ring shape on its child, because
   `filter` runs before `mask` on one element: blurring an already-masked ring
   is what spreads it to both sides. */
.tx-gradient-border__ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0.85;
  filter: blur(var(--tx-gradient-border-width));
  pointer-events: none;
}

/* A ring cut from a filled box, so it follows `border-radius`. It used to be a
   `border-image`, which ignores the radius: a square frame whose corners the
   rounded clip then cut away, leaving four straight sides. */
.tx-gradient-border__ring::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: var(--tx-gradient-border-width);
  border-radius: inherit;
  background: linear-gradient(
    var(--tx-gradient-angle),
    #0894ff 0%,
    #c959dd 34%,
    #ff2e54 68%,
    #ff9004 100%
  );
  -webkit-mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  -webkit-mask-clip: content-box, border-box;
  -webkit-mask-composite: xor;
  mask-image: linear-gradient(#000 0 0), linear-gradient(#000 0 0);
  mask-clip: content-box, border-box;
  mask-composite: exclude;
  animation: tx-gradient-border-rotate var(--tx-gradient-duration) linear infinite;
}

/* Content is still clipped to the rounded box, as it was when the root did it. */
.tx-gradient-border__inner {
  position: relative;
  display: block;
  padding: var(--tx-gradient-inner-padding);
  border-radius: inherit;
  overflow: hidden;
}

@keyframes tx-gradient-border-rotate {
  from {
    --tx-gradient-angle: 0deg;
  }
  to {
    --tx-gradient-angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-gradient-border__ring::before {
    animation: none;
  }
}
</style>
