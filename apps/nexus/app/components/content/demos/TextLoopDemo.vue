<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

const sample = 'Quarterly-financial-report-final-version-v3.pdf'

const rows = computed(() => [
  { label: t('docs.textLoopDemo.gap'), edge: 'gap' as const },
  { label: t('docs.textLoopDemo.clip'), edge: 'clip' as const },
  { label: t('docs.textLoopDemo.fade'), edge: 'fade' as const },
  { label: t('docs.textLoopDemo.wrap'), edge: 'wrap' as const },
])
</script>

<template>
  <div class="grid max-w-md gap-4">
    <div v-for="row in rows" :key="row.edge" class="grid gap-1.5">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ row.label }}</span>
      <div class="w-64 rounded-lg border border-[var(--tx-border-color)] bg-[var(--tx-bg-color)] px-3 py-2 text-sm text-[var(--tx-text-color-regular)]">
        <TxText :text="sample" scroll="loop" :loop-edge="row.edge" />
      </div>
    </div>
  </div>
</template>
