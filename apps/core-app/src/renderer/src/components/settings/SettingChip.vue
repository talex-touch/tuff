<script lang="ts" name="SettingChip" setup>
withDefaults(
  defineProps<{
    mono?: boolean
    /**
     * Status colouring. `neutral` is the annotation chip (macOS / 可选 / Beta and any
     * state that is simply unknown); `success` and `danger` are the only two the shell
     * spends colour on, so a coloured chip always means a state the user can act on.
     */
    tone?: 'neutral' | 'success' | 'danger'
  }>(),
  { mono: false, tone: 'neutral' }
)
</script>

<template>
  <span class="SettingChip" :class="[{ mono }, `tone-${tone}`]"><slot /></span>
</template>

<style lang="scss" scoped>
.SettingChip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 9px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  &.mono {
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  // `--shell-*` carries no success ramp — the shell only ever needed a failure colour — so the
  // positive state borrows the `--tx-*` one and softens it the same way the shell tokens do.
  &.tone-success {
    background: color-mix(in srgb, var(--tx-color-success) 12%, transparent);
    color: var(--tx-color-success);
  }

  &.tone-danger {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}
</style>
