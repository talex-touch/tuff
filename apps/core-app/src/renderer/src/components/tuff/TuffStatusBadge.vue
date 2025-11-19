<script lang="ts" name="TuffStatusBadge" setup>
import { computed } from 'vue'

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'
type StatusKey = 'granted' | 'denied' | 'notDetermined' | 'unsupported' | string

const props = withDefaults(
  defineProps<{
    text: string
    icon?: string
    status?: StatusTone
    statusKey?: StatusKey
    size?: 'sm' | 'md'
  }>(),
  {
    icon: '',
    status: undefined,
    statusKey: '',
    size: 'md',
  },
)

const toneMap: Record<StatusTone, { color: string, icon: string }> = {
  success: { color: 'var(--el-color-success)', icon: 'i-carbon-checkmark-filled' },
  warning: { color: 'var(--el-color-warning)', icon: 'i-carbon-warning' },
  danger: { color: 'var(--el-color-error)', icon: 'i-carbon-close-outline' },
  info: { color: 'var(--el-color-primary)', icon: 'i-carbon-information' },
  muted: { color: 'var(--el-text-color-secondary)', icon: 'i-carbon-minimize' },
}

const resolvedTone = computed<StatusTone>(() => {
  if (props.status)
    return props.status
  switch (props.statusKey) {
    case 'granted':
      return 'success'
    case 'denied':
      return 'danger'
    case 'notDetermined':
      return 'warning'
    case 'unsupported':
      return 'muted'
    default:
      return 'info'
  }
})

const toneMeta = computed(() => toneMap[resolvedTone.value])

const styleVars = computed(() => {
  const color = toneMeta.value.color
  return {
    '--tuff-status-color': color,
    '--tuff-status-bg': `color-mix(in srgb, ${color} 12%, transparent)`,
    '--tuff-status-border': `color-mix(in srgb, ${color} 32%, transparent)`,
  }
})

const iconClass = computed(() => props.icon || toneMeta.value.icon)
</script>

<template>
  <div class="TuffStatusBadge" :class="[`tuff-status-size-${size}`]" :style="styleVars">
    <i v-if="iconClass" :class="iconClass" />
    <span>{{ text }}</span>
  </div>
</template>

<style lang="scss" scoped>
.TuffStatusBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tuff-status-color, var(--el-text-color-primary));
  background: var(--tuff-status-bg, color-mix(in srgb, currentColor 12%, transparent));
  border: 1px solid
    var(--tuff-status-border, color-mix(in srgb, currentColor 32%, transparent));
  transition: background-color 0.25s ease;

  i {
    font-size: 14px;
  }

  &.tuff-status-size-sm {
    padding: 2px 8px;
  }

  &.tuff-status-size-md {
    padding: 4px 12px;
  }
}
</style>
