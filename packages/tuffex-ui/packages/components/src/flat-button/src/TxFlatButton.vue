<script lang="ts" setup>
defineOptions({
  name: 'TuffFlatButton',
})

const props = withDefaults(
  defineProps<{
    primary?: boolean
    mini?: boolean
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    primary: false,
    mini: false,
    disabled: false,
    loading: false,
  }
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent) {
  if (props.disabled || props.loading) return
  emit('click', event)
}

function handleKeyActivate(event: KeyboardEvent) {
  if (props.disabled || props.loading) return
  ;(event.currentTarget as HTMLElement | null)?.click()
}
</script>

<template>
  <div
    role="button"
    :tabindex="disabled || loading ? -1 : 0"
    :aria-disabled="disabled || loading || undefined"
    :class="[
      'tuff-flat-button',
      {
        'is-primary': primary,
        'fake-background': !primary,
        'is-mini': mini,
        'is-disabled': disabled,
        'is-loading': loading,
      },
    ]"
    @click="handleClick"
    @keydown.enter.prevent="handleKeyActivate"
    @keydown.space.prevent="handleKeyActivate"
  >
    <span v-if="loading" class="tx-flat-button__loading">
      <svg class="tx-flat-button__spinner" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </span>
    <span class="tx-flat-button__content">
      <slot />
    </span>
  </div>
</template>

<style lang="scss" scoped>
.tuff-flat-button {
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 120px;
  min-height: 32px;
  padding: 0 16px;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  background-color: transparent;
  color: var(--tx-text-color-regular, #606266);
  font-size: var(--tx-font-size-base, 14px);
  transition: all 0.25s ease-in-out;

  &.fake-background {
    --fake-radius: 8px;
  }

  .tx-flat-button__content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .tx-flat-button__loading {
    display: flex;
    align-items: center;
  }

  .tx-flat-button__spinner {
    width: 16px;
    height: 16px;
    animation: tx-spin 1s linear infinite;

    circle {
      stroke-dasharray: 60;
      stroke-dashoffset: 45;
      stroke-linecap: round;
    }
  }

  &:hover:not(.is-disabled):not(.is-loading) {
    --fake-color: var(--tx-fill-color, #f0f2f5);
    background-color: transparent;
  }

  &:active:not(.is-disabled):not(.is-loading) {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary-light-5, #a0cfff);
    outline-offset: 2px;
  }

  // Primary variant
  &.is-primary {
    color: var(--tx-color-primary-dark-2, #337ecc);
    border-color: var(--tx-color-primary, #409eff);

    &:hover:not(.is-disabled):not(.is-loading) {
      color: var(--tx-text-color-primary, #303133);
      background-color: var(--tx-color-primary-light-3, #79bbff);
    }
  }

  // Mini variant
  &.is-mini {
    min-width: 32px;
    min-height: 32px;
    padding: 0 8px;
  }

  // Disabled state
  &.is-disabled,
  &.is-loading {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }
}

@keyframes tx-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
