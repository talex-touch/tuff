<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const sample = 'Quarterly-financial-report-final-version-v3.pdf'

const rows = computed(() => (locale.value === 'zh'
  ? [
      { label: '完全消失再进入（默认）', edge: 'gap' as const },
      { label: '部分消失（边缘硬切）', edge: 'clip' as const },
      { label: '比例消失（边缘渐隐）', edge: 'fade' as const },
      { label: '不消失（首尾相接）', edge: 'wrap' as const },
    ]
  : [
      { label: 'Clears fully, then re-enters (default)', edge: 'gap' as const },
      { label: 'Partly clipped at the edge', edge: 'clip' as const },
      { label: 'Fades at the edges', edge: 'fade' as const },
      { label: 'Never clears (wraps)', edge: 'wrap' as const },
    ]))
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
