<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const page = ref(1)
const total = 120
const pageSize = ref(10)

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
      :total="total"
      :page-size="pageSize"
      show-info
      show-first-last
    />
    <label class="pagination-demo__size">
      <span>{{ locale === 'zh' ? '每页条数' : 'Items per page' }}</span>
      <TxSelect v-model="pageSize" :aria-label="locale === 'zh' ? '每页条数' : 'Items per page'">
        <TxSelectItem v-for="size in [10, 20, 50]" :key="size" :value="size" :label="String(size)" />
      </TxSelect>
    </label>
    <p>{{ summary }}</p>
  </div>
</template>

<style scoped>
.pagination-demo {
  display: grid;
  gap: 10px;
  justify-items: center;
}
.pagination-demo__size {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.pagination-demo__size :deep(.tuff-select) {
  width: 88px;
}


.pagination-demo p {
  margin: 0;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
}
</style>
