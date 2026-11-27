<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      high: '高置信',
      medium: '需要复核',
      low: '证据薄弱',
      none: '无信号',
    }
  }

  return {
    high: 'High confidence',
    medium: 'Needs review',
    low: 'Weak evidence',
    none: 'No signal',
  }
})

const levels = computed(() => [
  { value: 3, tone: 'var(--tx-bui-green)', label: copy.value.high },
  { value: 2, tone: 'var(--tx-bui-orange)', label: copy.value.medium },
  { value: 1, tone: 'var(--tx-bui-red)', label: copy.value.low },
  { value: 0, tone: 'var(--tx-bui-ink-3)', label: copy.value.none },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="level in levels"
      :key="level.label"
      class="flex items-center gap-2.5"
    >
      <TxSignalMeter :value="level.value" :tone="level.tone" :label="level.label" />
      <span class="text-[12.5px] text-[var(--tx-text-color-secondary)]">{{ level.label }}</span>
    </div>
  </div>
</template>
