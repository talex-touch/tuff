<script lang="ts" name="TuffBlockTag" setup>
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string | null
    icon?: string
    color?: string
    background?: string
    border?: string
    size?: 'sm' | 'md'
  }>(),
  {
    label: '',
    icon: '',
    color: 'var(--el-color-primary)',
    background: '',
    border: '',
    size: 'sm'
  }
)

const safeLabel = computed(() => {
  return props.label ?? ''
})

const safeColor = computed(() => {
  return props.color || 'var(--el-color-primary)'
})

const resolvedBackground = computed(() => {
  if (props.background) return props.background
  return `color-mix(in srgb, ${safeColor.value} 12%, transparent)`
})

const resolvedBorder = computed(() => {
  if (props.border) return props.border
  return `color-mix(in srgb, ${safeColor.value} 32%, transparent)`
})

const styleVars = computed(() => ({
  '--tuff-tag-color': safeColor.value,
  '--tuff-tag-bg': resolvedBackground.value,
  '--tuff-tag-border': resolvedBorder.value
}))
</script>

<template>
  <span class="TuffBlockTag" :class="[`tuff-block-tag-size-${size}`]" :style="styleVars">
    <i v-if="icon" :class="icon" aria-hidden="true" />
    <span class="TuffBlockTag-Text">
      <slot>{{ safeLabel }}</slot>
    </span>
  </span>
</template>

<style lang="scss" scoped>
.TuffBlockTag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  color: var(--tuff-tag-color, var(--el-color-primary));
  background: var(--tuff-tag-bg, color-mix(in srgb, currentColor 12%, transparent));
  border: 1px solid var(--tuff-tag-border, color-mix(in srgb, currentColor 32%, transparent));
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.05em;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    transform 0.15s ease;
  animation: tag-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;

  &:hover {
    box-shadow: 0 0 0 2px var(--tuff-tag-bg, color-mix(in srgb, currentColor 8%, transparent));
  }

  i {
    font-size: 12px;
    line-height: 1;
  }

  &.tuff-block-tag-size-sm {
    padding: 1px 6px;
  }

  &.tuff-block-tag-size-md {
    padding: 3px 9px;
    font-size: 12px;
  }
}

@keyframes tag-fade-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
