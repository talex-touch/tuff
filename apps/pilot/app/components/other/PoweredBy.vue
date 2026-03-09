<script setup lang="ts">
import Logo from '../chore/Logo.vue'
</script>

<template>
  <div class="PoweredBy" flex items-center gap-2>
    <Logo />Powered by QuotaWish.
  </div>
</template>

<style lang="scss" scoped>
.LogoContainer {
  margin: 0;

  width: 1.2em;
  height: 1.2em;

  box-shadow: none;
  filter: grayscale(0.5);
}

.PoweredBy {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}
</style>
