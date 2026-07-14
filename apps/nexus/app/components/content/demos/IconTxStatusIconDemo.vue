<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const tones = ['success', 'warning', 'error', 'info', 'loading'] as const

const groupLabel = computed(() => locale.value === 'zh' ? '翻译插件状态' : 'Translation plugin status')
const toneLabels = computed(() => {
  if (locale.value === 'zh') {
    return {
      success: '可用',
      warning: '需注意',
      error: '失败',
      info: '信息',
      loading: '同步中',
    }
  }

  return {
    success: 'Available',
    warning: 'Needs attention',
    error: 'Failed',
    info: 'Info',
    loading: 'Syncing',
  }
})
</script>

<template>
  <div class="icon-status-demo" :aria-label="groupLabel">
    <div v-for="tone in tones" :key="tone" class="icon-status-demo__item">
      <TxStatusIcon name="i-ri-translate-2" :size="24" :tone="tone" />
      <span>{{ toneLabels[tone] }}</span>
    </div>
  </div>
</template>

<style scoped>
.icon-status-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.icon-status-demo__item {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.32));
  border-radius: 999px;
  color: var(--tx-text-color-regular, #475569);
  font-size: 12px;
  background: var(--tx-fill-color-blank, rgba(255, 255, 255, 0.78));
}
</style>

