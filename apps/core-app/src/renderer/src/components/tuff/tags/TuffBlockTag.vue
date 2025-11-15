<script lang="ts" name="TuffBlockTag" setup>
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    icon?: string
    color?: string
    background?: string
    border?: string
    size?: 'sm' | 'md'
  }>(),
  {
    icon: '',
    color: 'var(--el-color-primary)',
    background: '',
    border: '',
    size: 'sm'
  }
)

const resolvedBackground = computed(() => {
  if (props.background) return props.background
  return `color-mix(in srgb, ${props.color} 12%, transparent)`
})

const resolvedBorder = computed(() => {
  if (props.border) return props.border
  return `color-mix(in srgb, ${props.color} 32%, transparent)`
})

const styleVars = computed(() => ({
  '--tuff-tag-color': props.color,
  '--tuff-tag-bg': resolvedBackground.value,
  '--tuff-tag-border': resolvedBorder.value
}))
</script>

<template>
  <span class="TuffBlockTag" :class="[`tuff-block-tag-size-${size}`]" :style="styleVars">
    <i v-if="icon" :class="icon" aria-hidden="true" />
    <span class="TuffBlockTag-Text">
      <slot>{{ label }}</slot>
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
</style>
