<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const page = ref(1)
const total = 120
const pageSize = 10

const summary = computed(() => {
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total)

  if (locale.value === 'zh')
    return `正在查看第 ${start}–${end} 条，共 ${total} 条`

  return `Viewing ${start}–${end} of ${total} items`
})
</script>

<template>
  <div class="pagination-demo">
    <TxPagination
      v-model:current-page="page"
      :total="total"
      :page-size="pageSize"
      show-info
      show-first-last
    />
    <p>{{ summary }}</p>
  </div>
</template>

<style scoped>
.pagination-demo {
  display: grid;
  gap: 10px;
  justify-items: center;
}

.pagination-demo p {
  margin: 0;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
}
</style>
