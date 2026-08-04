<script lang="ts" name="ShellBrand" setup>
import AppLogo from '~/components/icon/AppLogo.vue'
</script>

<template>
  <div class="ShellBrand">
    <AppLogo class="ShellBrand-Mark" />
    <span class="ShellBrand-Name">Tuff</span>
  </div>
</template>

<style lang="scss" scoped>
.ShellBrand {
  display: flex;
  gap: 9px;
  align-items: center;
  width: 100%;
  padding: 2px 8px;
  -webkit-app-region: drag;
}

.ShellBrand-Mark {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
}

.ShellBrand-Name {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  font-weight: 600;
}
</style>
