<script lang="ts" name="TTag" setup>
const props = withDefaults(
  defineProps<{
    type?: 'default' | 'success' | 'danger' | 'warning' | 'info'
    size?: 'sm' | 'md'
    pill?: boolean
  }>(),
  {
    type: 'default',
    size: 'md',
    pill: false
  }
)
</script>

<template>
  <span
    class="TTag"
    :class="[`type-${props.type}`, `tuff-tag-size-${props.size}`, { pill: props.pill }]"
  >
    <slot />
  </span>
</template>

<style scoped lang="scss">
.TTag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid transparent;

  &.pill {
    border-radius: 999px;
  }

  &.tuff-tag-size-sm {
    font-size: 11px;
    padding: 1px 6px;
  }

  &.type-default {
    background: var(--el-fill-color-lighter);
    color: var(--el-text-color-secondary);
  }

  &.type-success {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
    border-color: var(--el-color-success-light-7);
  }

  &.type-danger {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
    border-color: var(--el-color-danger-light-7);
  }

  &.type-warning {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
    border-color: var(--el-color-warning-light-7);
  }

  &.type-info {
    background: var(--el-color-info-light-9);
    color: var(--el-color-info);
    border-color: var(--el-color-info-light-7);
  }
}
</style>
