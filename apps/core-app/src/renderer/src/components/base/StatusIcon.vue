<script lang="ts" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed } from 'vue'
import TuffIcon from './TuffIcon.vue'

type StatusIconTone = 'none' | 'loading' | 'warning' | 'success' | 'error' | 'info'

const props = withDefaults(
  defineProps<{
    icon?: ITuffIcon | null
    alt?: string
    size?: number
    empty?: string
    colorful?: boolean
    tone?: StatusIconTone
    indicatorSize?: number
    indicatorOffset?: number
  }>(),
  {
    icon: null,
    alt: '',
    size: 18,
    empty: '',
    colorful: true,
    tone: 'none',
    indicatorSize: undefined,
    indicatorOffset: 0,
  },
)

const indicatorSize = computed(() => {
  if (typeof props.indicatorSize === 'number' && props.indicatorSize > 0) return props.indicatorSize
  const base = Math.round((props.size ?? 18) * 0.32)
  return Math.max(6, Math.min(12, base))
})
</script>

<template>
  <span
    class="StatusIcon"
    :style="{
      '--status-icon-size': `${size}px`,
      '--status-indicator-size': `${indicatorSize}px`,
      '--status-indicator-offset': `${indicatorOffset}px`,
    }"
  >
    <TuffIcon
      class="StatusIcon-Icon"
      :icon="icon"
      :alt="alt"
      :size="size"
      :empty="empty"
      :colorful="colorful"
    />

    <span
      v-if="tone !== 'none'"
      class="StatusIcon-Indicator"
      :class="`is-${tone}`"
      aria-hidden="true"
    />
  </span>
</template>

<style lang="scss" scoped>
.StatusIcon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--status-icon-size, 18px);
  height: var(--status-icon-size, 18px);
}

.StatusIcon-Icon {
  width: 100%;
  height: 100%;
}

.StatusIcon-Indicator {
  position: absolute;
  right: var(--status-indicator-offset, 0px);
  bottom: var(--status-indicator-offset, 0px);
  width: var(--status-indicator-size, 8px);
  height: var(--status-indicator-size, 8px);
  border-radius: 999px;
  box-sizing: border-box;
  border: 2px solid var(--el-bg-color-overlay, var(--el-bg-color, #fff));
  background: var(--status-indicator-color, #9ca3af);
}

.StatusIcon-Indicator.is-info {
  --status-indicator-color: #9ca3af;
}

.StatusIcon-Indicator.is-success {
  --status-indicator-color: #22c55e;
}

.StatusIcon-Indicator.is-warning {
  --status-indicator-color: #f59e0b;
}

.StatusIcon-Indicator.is-error {
  --status-indicator-color: #ef4444;
}

.StatusIcon-Indicator.is-loading {
  --status-indicator-color: var(--el-color-primary, #3b82f6);
}

.StatusIcon-Indicator.is-loading::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 2px solid var(--status-indicator-color);
  opacity: 0.55;
  animation: status-icon-pulse 1.2s ease-out infinite;
  pointer-events: none;
}

@keyframes status-icon-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.55;
  }
  70% {
    transform: scale(2.1);
    opacity: 0;
  }
  100% {
    transform: scale(2.1);
    opacity: 0;
  }
}
</style>

