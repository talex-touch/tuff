<script lang="ts" name="SettingChip" setup>
withDefaults(
  defineProps<{
    mono?: boolean
    /**
     * Status colouring, all four hues soft-filled and inked in the same tone — the badge shape
     * the board draws. `neutral` is the annotation chip (macOS / 可选 / Beta and the default
     * member of any pair); `info` marks the notable-but-not-actionable one; `success`, `warning`
     * and `danger` are outcomes, in ascending severity. Colour is always additive here: the chip
     * label states the same thing in words.
     */
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
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

  &.tone-info {
    background: var(--shell-info-soft);
    color: var(--shell-info);
  }

  &.tone-success {
    background: var(--shell-success-soft);
    color: var(--shell-success);
  }

  &.tone-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  &.tone-danger {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}
</style>
