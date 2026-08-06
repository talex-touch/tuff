<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { SkeletonProps } from './types.ts'
import { computed } from 'vue'
import { toCssUnit } from './utils'

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

  <div v-else class="tx-skeleton" :style="rootStyle" aria-hidden="true">
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
@use '../../../style/mixins.scss' as *;

@include skeleton-keyframes;

.tx-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--tx-skeleton-gap, 10px);
}

.tx-skeleton__item {
  width: var(--tx-skeleton-width, 100%);
  height: var(--tx-skeleton-height, 12px);
  border-radius: var(--tx-skeleton-radius, 8px);

  @include skeleton-surface;
}

.tx-skeleton__item--circle {
  aspect-ratio: 1;
}
</style>
