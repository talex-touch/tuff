<script lang="ts" name="PluginEmptyState" setup>
import { TxButton } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div
    class="relative w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
  >
    <div
      class="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--tx-color-primary-light-9)] to-[var(--tx-color-primary-light-8)] flex items-center justify-center mb-6 shadow-lg"
    >
      <i class="i-ri-puzzle-line text-3xl text-[var(--tx-color-primary)]" />
    </div>
    <div class="max-w-96">
      <p class="text-[var(--tx-text-color-regular)] opacity-80 mb-6">
        {{ t('plugin.emptyState.message') }}
      </p>
      <TxButton variant="flat" class="cta-button text-sm" @click="() => $router.push('/store')">
        <i class="i-ri-store-line" />
        {{ t('plugin.emptyState.exploreStore') }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.cta-button :deep(.tx-button) {
  @apply px-8 py-3 bg-[var(--tx-color-primary)] text-white rounded-full font-semibold flex items-center gap-3 transition-all duration-300 ease-out relative overflow-hidden;
}

.cta-button :deep(.tx-button:hover) {
  @apply bg-[var(--tx-color-primary-dark-2)] -translate-y-0.5 scale-105;
  box-shadow: 0 12px 30px rgba(var(--tx-color-primary-rgb), 0.4);
}

.cta-button :deep(.tx-button) i {
  @apply text-lg;
}
</style>
