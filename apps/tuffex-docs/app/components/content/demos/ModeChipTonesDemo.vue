<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const chips = computed(() => [
  { tone: 'muted' as const, icon: 'i-carbon-touch-1', label: zh.value ? '请求批准' : 'Request approval' },
  { tone: 'info' as const, icon: 'i-carbon-earth', label: zh.value ? '联网搜索' : 'Web search' },
  { tone: 'success' as const, icon: 'i-carbon-checkmark-outline', label: zh.value ? '自动接受编辑' : 'Auto-accept edits' },
  { tone: 'warning' as const, icon: 'i-carbon-warning-alt', label: zh.value ? '计划模式' : 'Plan mode' },
  { tone: 'danger' as const, icon: 'i-carbon-unlocked', label: zh.value ? '无限制访问' : 'Unrestricted access' },
])
</script>

<template>
  <div class="mode-chip-tones-demo">
    <TxModeChip
      v-for="chip in chips"
      :key="chip.tone"
      :icon="chip.icon"
      :label="chip.label"
      :tone="chip.tone"
    />
  </div>
</template>

<style scoped>
.mode-chip-tones-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
