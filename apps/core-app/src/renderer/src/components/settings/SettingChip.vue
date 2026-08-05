<script lang="ts" name="SettingChip" setup>
withDefaults(defineProps<{ mono?: boolean }>(), { mono: false })
</script>

<template>
  <span class="SettingChip" :class="{ mono }"><slot /></span>
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
}
</style>
