<script setup lang="ts">
import type { TxSelectValue } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const compact = ref<TxSelectValue>('daily')
const fluid = ref<TxSelectValue>('weekly')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      compact: '默认宽度（240px）',
      fluid: 'width: 100% 跟随容器',
      options: [
        { value: 'daily', label: '每日同步' },
        { value: 'weekly', label: '每周汇总' },
        { value: 'monthly', label: '每月归档' },
      ],
    }
  }

  return {
    compact: 'Default width (240px)',
    fluid: 'width: 100% follows the container',
    options: [
      { value: 'daily', label: 'Daily sync' },
      { value: 'weekly', label: 'Weekly digest' },
      { value: 'monthly', label: 'Monthly archive' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-400">
    <div class="select-width-demo__row">
      <span class="select-width-demo__label">{{ labels.compact }}</span>
      <TuffSelect v-model="compact" :options="labels.options" />
    </div>
    <div class="select-width-demo__row">
      <span class="select-width-demo__label">{{ labels.fluid }}</span>
      <TuffSelect v-model="fluid" style="width: 100%" :options="labels.options" />
    </div>
  </div>
</template>

<style scoped>
.select-width-demo__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.select-width-demo__label {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
