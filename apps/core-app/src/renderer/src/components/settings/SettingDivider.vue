<script lang="ts" name="SettingDivider" setup></script>

<template>
  <div class="SettingDivider" role="separator" />
</template>

<style lang="scss" scoped>
/**
 * Asymmetric on purpose: the artboard insets the hairline 16px on the left so it starts at
 * the row's text, and runs flush to the right edge.
 */
.SettingDivider {
  height: 1px;
  margin-left: 16px;
  background: var(--shell-border);
}
</style>
