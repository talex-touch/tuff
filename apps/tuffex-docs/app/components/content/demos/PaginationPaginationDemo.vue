<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const page = ref(1)
const total = 120
const pageSize = ref(10)

// The component only reports the new size. The rows the reader was looking at
// have moved, so the demo starts over from page 1.
function onPageSizeChange() {
  page.value = 1
}

const summary = computed(() => {
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, total)

  if (locale.value === 'zh')
    return `正在查看第 ${start}–${end} 条，共 ${total} 条`

  return `Viewing ${start}–${end} of ${total} items`
})
</script>

<template>
  <div class="pagination-demo not-prose">
    <TxPagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :page-size-label="locale === 'zh' ? '每页条数' : 'Items per page'"
      :total="total"
      show-info
      show-first-last
      @page-size-change="onPageSizeChange"
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
