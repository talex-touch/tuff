<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      rows: [
        { color: 'var(--tx-bui-green, #189a4d)', label: '非常紧密' },
        { color: 'var(--tx-bui-orange, #ef720c)', label: '一般' },
        { color: 'var(--tx-bui-red, #e3474c)', label: '较弱' },
        { color: 'var(--tx-bui-ink-3, #9a9da3)', label: '无往来' },
      ],
      summary: '汇总行：44% 平均强度',
    }
  }

  return {
    rows: [
      { color: 'var(--tx-bui-green, #189a4d)', label: 'Very strong' },
      { color: 'var(--tx-bui-orange, #ef720c)', label: 'Weak' },
      { color: 'var(--tx-bui-red, #e3474c)', label: 'Very weak' },
      { color: 'var(--tx-bui-ink-3, #9a9da3)', label: 'No communication' },
    ],
    summary: 'Footer aggregate: 44% average',
  }
})
</script>

<template>
  <div class="dot-indicator-demo">
    <TxDotIndicator
      v-for="row in copy.rows"
      :key="row.label"
      :color="row.color"
      :label="row.label"
    />

    <TxDotIndicator color="var(--tx-bui-orange, #ef720c)" :size="8">
      <strong>{{ copy.summary }}</strong>
    </TxDotIndicator>
  </div>
</template>

<style scoped>
.dot-indicator-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
</style>
