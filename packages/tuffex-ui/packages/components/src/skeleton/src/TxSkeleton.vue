<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { SkeletonProps } from './types.ts'

defineOptions({
  name: 'TxSkeleton',
})

const props = withDefaults(defineProps<SkeletonProps>(), {
  loading: true,
  variant: 'text',
  width: '100%',
  height: 12,
  radius: 8,
  lines: 1,
  gap: 10,
})

function toCssUnit(v: string | number): string {
  return typeof v === 'number' ? `${v}px` : v
}

const itemStyle = computed<CSSProperties>(() => {
  const height = props.variant === 'text' ? toCssUnit(props.height) : toCssUnit(props.height)
  const width = toCssUnit(props.width)

  const radius = props.variant === 'circle'
    ? '999px'
    : toCssUnit(props.radius)

  return {
    '--tx-skeleton-width': width,
    '--tx-skeleton-height': height,
    '--tx-skeleton-radius': radius,
  } as CSSProperties
})

const rootStyle = computed<CSSProperties>(() => {
  return {
    '--tx-skeleton-gap': toCssUnit(props.gap),
  } as CSSProperties
})

const linesArray = computed(() => {
  return Array.from({ length: Math.max(1, props.lines) })
})
</script>

<template>
  <template v-if="!loading">
    <slot />
  </template>

  <div v-else class="tx-skeleton" :style="rootStyle">
    <div
      v-for="(_, i) in linesArray"
      :key="i"
      class="tx-skeleton__item"
      :class="[`tx-skeleton__item--${variant}`]"
      :style="itemStyle"
    />
  </div>
</template>

<style lang="scss">
@keyframes tx-skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.tx-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--tx-skeleton-gap, 10px);
}

.tx-skeleton__item {
  width: var(--tx-skeleton-width, 100%);
  height: var(--tx-skeleton-height, 12px);
  border-radius: var(--tx-skeleton-radius, 8px);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 0%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 95%, transparent) 50%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: tx-skeleton-shimmer 1.2s ease-in-out infinite;
}

.tx-skeleton__item--circle {
  aspect-ratio: 1;
}
</style>
