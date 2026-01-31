<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="PluginFeature-EmptyState flex flex-col items-center justify-center py-16 text-center">
    <div
      class="PluginFeature-EmptyIcon w-20 h-20 bg-[var(--el-bg-color-overlay)] rounded-2xl flex items-center justify-center mb-6"
    >
      <i class="i-ri-function-line text-4xl text-[var(--el-text-color-disabled)]" />
    </div>
    <h3 class="text-xl font-semibold text-[var(--el-text-color-primary)] mb-2">
      {{ t('plugin.features.empty.title') }}
    </h3>
    <p class="text-[var(--el-text-color-secondary)]">
      {{ t('plugin.features.empty.subtitle') }}
    </p>
  </div>
</template>
