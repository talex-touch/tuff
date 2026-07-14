<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const percentage = ref(35)
const labels = computed(() => (locale.value === 'zh'
  ? { label: '灰度比例', suffix: '当前会按 5% 步进，并限制在 0-100。' }
  : { label: 'Rollout percentage', suffix: 'Steps by 5% and clamps between 0 and 100.' }))
</script>

<template>
  <label class="grid max-w-sm gap-2">
    <span class="text-sm font-medium text-[var(--tx-text-color-primary)]">{{ labels.label }}</span>
    <TxNumberInput v-model="percentage" :min="0" :max="100" :step="5" :precision="0" />
    <span class="text-sm text-[var(--tx-text-color-secondary)]">{{ labels.suffix }}</span>
  </label>
</template>
