<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const variants = computed(() => {
  if (locale.value === 'zh') {
    return [
      { variant: 'drive' as const, label: '正在搅拌', note: '方块，人字形波前向右推进' },
      { variant: 'dots' as const, label: '正在取样', note: '同一套波前，圆点造型' },
      { variant: 'orbit' as const, label: '正在盘点', note: '彗星绕格子外圈，中心留空' },
    ]
  }

  return [
    { variant: 'drive' as const, label: 'Churning', note: 'Squares, chevron wavefront driving right' },
    { variant: 'dots' as const, label: 'Sampling', note: 'Same wavefront, circular cells' },
    { variant: 'orbit' as const, label: 'Counting', note: 'A comet lapping the grid, centre unlit' },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-for="item in variants" :key="item.variant" class="flex flex-col gap-1">
      <TxWorkingIndicator :variant="item.variant" :label="item.label" />
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ item.note }}</span>
    </div>
  </div>
</template>
