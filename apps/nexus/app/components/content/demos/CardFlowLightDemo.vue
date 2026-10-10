<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const cards = computed(() => [
  { variant: 'corners' as const, title: zh.value ? '双角柔光' : 'Corners' },
  { variant: 'rim' as const, title: zh.value ? '顶缘流光带' : 'Rim' },
  { variant: 'aurora' as const, title: zh.value ? '极光漫射' : 'Aurora' },
])
</script>

<template>
  <div class="card-flow-light-demo not-prose">
    <TxCard
      v-for="card in cards"
      :key="card.variant"
      background="pure"
      shadow="soft"
      :flow-light="card.variant"
    >
      <strong>{{ card.title }}</strong>
      <p>flow-light="{{ card.variant }}"</p>
    </TxCard>
  </div>
</template>

<style scoped>
.card-flow-light-demo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.card-flow-light-demo p {
  margin: 6px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
