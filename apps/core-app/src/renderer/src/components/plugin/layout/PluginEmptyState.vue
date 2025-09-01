<template>
  <div
    class="relative w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
  >
    <div
      class="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--el-color-primary-light-9)] to-[var(--el-color-primary-light-8)] flex items-center justify-center mb-6 shadow-lg"
    >
      <i class="i-ri-puzzle-line text-3xl text-[var(--el-color-primary)]" />
    </div>
    <div class="max-w-96">
      <p class="text-[var(--el-text-color-regular)] opacity-80 mb-6">
        Choose a plugin to view details
      </p>
      <FlatButton class="cta-button text-sm" @click="() => $router.push('/market')">
        <i class="i-ri-store-line" />
        Explore Market
      </FlatButton>
    </div>
  </div>
</template>

<script lang="ts" name="PluginEmptyState" setup>
import FlatButton from '@comp/base/button/FlatButton.vue'
</script>

<style lang="scss" scoped>
.cta-button :deep(.FlatButton-Container) {
  @apply px-8 py-3 bg-[var(--el-color-primary)] text-white rounded-full font-semibold flex items-center gap-3 transition-all duration-300 ease-out relative overflow-hidden;
}

.cta-button :deep(.FlatButton-Container:hover) {
  @apply bg-[var(--el-color-primary-dark-2)] -translate-y-0.5 scale-105;
  box-shadow: 0 12px 30px rgba(var(--el-color-primary-rgb), 0.4);
}

.cta-button :deep(.FlatButton-Container) i {
  @apply text-lg;
}
</style>