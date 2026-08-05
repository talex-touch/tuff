<script lang="ts" name="SettingButton" setup>
withDefaults(
  defineProps<{
    /** `primary` is the filled accent button; `secondary` is the bordered neutral one. */
    variant?: 'primary' | 'secondary'
    disabled?: boolean
  }>(),
  { variant: 'primary', disabled: false }
)

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="SettingButton"
    :class="`variant-${variant}`"
    type="button"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
.SettingButton {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.variant-primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
  }

  &.variant-secondary {
    border-color: var(--shell-border);
    background: var(--shell-bg);
    color: var(--shell-text-primary);

    &:hover:not(:disabled) {
      border-color: var(--shell-border-strong);
    }
  }
}
</style>
