<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const sample = 'Quarterly-financial-report-final-version-v3.pdf'

const rows = computed(() => (locale.value === 'zh'
  ? [
      { label: '末尾省略（默认）', overflow: 'end' as const },
      { label: '开头省略', overflow: 'start' as const },
      { label: '中间省略', overflow: 'middle' as const },
    ]
  : [
      { label: 'End (default)', overflow: 'end' as const },
      { label: 'Start', overflow: 'start' as const },
      { label: 'Middle', overflow: 'middle' as const },
    ]))
</script>

<template>
  <div class="grid max-w-md gap-4">
    <div v-for="row in rows" :key="row.overflow" class="grid gap-1.5">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ row.label }}</span>
      <div class="w-64 rounded-lg border border-[var(--tx-border-color)] bg-[var(--tx-bg-color)] px-3 py-2 text-sm text-[var(--tx-text-color-regular)]">
        <TxText :text="sample" :overflow="row.overflow" />
      </div>
    </div>
  </div>
</template>
