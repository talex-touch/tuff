<script setup lang="ts">
import type { DockHintPosition } from '../composables/useDrag'
import { computed } from 'vue'

/**
 * Props definition for DockHint component
 */
interface Props {
  /** Position and size of the dock hint */
  position?: DockHintPosition
}

const props = defineProps<Props>()

// Computed
const hintStyle = computed(() => {
  if (!props.position) {
    return {
      display: 'none'
    }
  }

  return {
    left: `${props.position.x}px`,
    top: `${props.position.y}px`,
    width: `${props.position.width}px`,
    height: `${props.position.height}px`
  }
})
</script>

<template>
  <div class="dock-hint" :style="hintStyle">
    <div class="dock-hint-border" />
  </div>
</template>

<style scoped lang="scss">
.dock-hint {
  position: fixed;
  z-index: 999;
  pointer-events: none;
  background: var(--el-color-primary);
  opacity: 0.1;
  transition: opacity 0.2s ease;
}

.dock-hint-border {
  position: absolute;
  inset: 0;
  border: 2px solid var(--el-color-primary);
  opacity: 0.5;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
