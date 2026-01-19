<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { CornerOverlayProps } from './types'
import { computed } from 'vue'

defineOptions({
  name: 'TxCornerOverlay',
})

const props = withDefaults(defineProps<CornerOverlayProps>(), {
  placement: 'bottom-right',
  offsetX: 0,
  offsetY: 0,
  overlayPointerEvents: 'none',
})

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

const overlayStyle = computed<CSSProperties>(() => {
  const x = toCssUnit(props.offsetX)
  const y = toCssUnit(props.offsetY)

  const style: CSSProperties = {
    pointerEvents: props.overlayPointerEvents,
  }

  switch (props.placement) {
    case 'top-left':
      style.top = y
      style.left = x
      break
    case 'top-right':
      style.top = y
      style.right = x
      break
    case 'bottom-left':
      style.bottom = y
      style.left = x
      break
    case 'bottom-right':
    default:
      style.bottom = y
      style.right = x
      break
  }

  return style
})
</script>

<template>
  <span class="tx-corner-overlay">
    <slot />
    <span v-if="$slots.overlay" class="tx-corner-overlay__overlay" :style="overlayStyle" aria-hidden="true">
      <slot name="overlay" />
    </span>
  </span>
</template>

<style scoped>
.tx-corner-overlay {
  position: relative;
  display: inline-block;
}

.tx-corner-overlay__overlay {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
