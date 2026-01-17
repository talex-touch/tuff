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

.tx-gradient-border {
  position: relative;
  display: block;
  border-radius: var(--tx-gradient-border-radius);
  overflow: hidden;
}

.tx-gradient-border::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.85;
  filter: blur(var(--tx-gradient-border-width));
  border-style: solid;
  border-width: var(--tx-gradient-border-width);
  border-radius: var(--tx-gradient-border-radius);
  border-image-slice: 1;
  border-image-source: linear-gradient(
    var(--tx-gradient-angle),
    #0894ff 0%,
    #c959dd 34%,
    #ff2e54 68%,
    #ff9004 100%
  );
  pointer-events: none;
  animation: tx-gradient-border-rotate var(--tx-gradient-duration) linear infinite;
}

.tx-gradient-border__inner {
  position: relative;
  display: block;
  padding: var(--tx-gradient-inner-padding);
}

@keyframes tx-gradient-border-rotate {
  from {
    --tx-gradient-angle: 0deg;
  }
  to {
    --tx-gradient-angle: 360deg;
  }
}
</style>
