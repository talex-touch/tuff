<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const sample = 'Quarterly-financial-report-final-version-v3.pdf'

const rows = computed(() => (locale.value === 'zh'
  ? [
      { label: '静态截断（默认）', scroll: 'none' as const },
      { label: '自动滚动', scroll: 'auto' as const },
      { label: '悬停滚动（触屏点按）', scroll: 'hover' as const },
    ]
  : [
      { label: 'Static (default)', scroll: 'none' as const },
      { label: 'Auto scroll', scroll: 'auto' as const },
      { label: 'Hover scroll (tap on touch)', scroll: 'hover' as const },
    ]))
</script>

<template>
  <div class="grid max-w-md gap-4">
    <div v-for="row in rows" :key="row.scroll" class="grid gap-1.5">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ row.label }}</span>
      <div class="w-64 rounded-lg border border-[var(--tx-border-color)] bg-[var(--tx-bg-color)] px-3 py-2 text-sm text-[var(--tx-text-color-regular)]">
        <TxText :text="sample" :scroll="row.scroll" />
      </div>
    </div>
  </div>
</template>
