<script lang="ts" name="TButton" setup>
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    loading?: boolean
    disabled?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    block: false,
    loading: false,
    disabled: false,
    nativeType: 'button',
  },
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent) {
  if (props.disabled || props.loading)
    return
  emits('click', event)
}
</script>

<template>
  <button
    class="TButton"
    :class="[`variant-${variant}`, `tuff-size-${size}`, { block, loading, disabled }]"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="spinner i-carbon-renew" />
    <slot />
  </button>
</template>

<style scoped lang="scss">
.TButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  padding: 0 16px;
  height: 36px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-primary);

  .spinner {
    font-size: 16px;
    animation: spin 1s linear infinite;
  }

  &.block {
    width: 100%;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.loading {
    cursor: progress;
  }

  &.variant-primary {
    background: var(--el-color-primary);
    color: #fff;
    border-color: var(--el-color-primary);

    &:hover:not(.disabled) {
      background: var(--el-color-primary-light-3);
      border-color: var(--el-color-primary-light-3);
    }
  }

  &.variant-secondary {
    background: var(--el-fill-color);
    border-color: var(--el-border-color);

    &:hover:not(.disabled) {
      border-color: var(--el-color-primary-light-3);
    }
  }

  &.variant-ghost {
    background: transparent;
    border-color: transparent;

    &:hover:not(.disabled) {
      background: var(--el-fill-color);
    }
  }

  &.variant-danger {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-5);
    color: var(--el-color-danger);

    &:hover:not(.disabled) {
      background: var(--el-color-danger-light-7);
    }
  }

  &.tuff-size-sm {
    padding: 0 12px;
    height: 30px;
    font-size: 13px;
  }

  &.tuff-size-lg {
    padding: 0 20px;
    height: 42px;
    font-size: 15px;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
