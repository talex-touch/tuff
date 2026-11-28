<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const total = 230
const page = ref(3)
const pageSize = ref(20)

// A new size starts over from page 1: the rows the reader was looking at are
// somewhere else now. The component leaves that call to the host.
function onPageSizeChange() {
  page.value = 1
}

const copy = computed(() => (isZh.value
  ? {
      perPage: '每页条数',
      ariaLabel: '分页',
      prev: '上一页',
      next: '下一页',
      info: (current: number, pages: number) => `共 ${total} 条 · 第 ${current} / ${pages} 页`,
      range: (start: number, end: number) => `正在查看第 ${start}–${end} 条`,
    }
  : {
      perPage: 'Items per page',
      ariaLabel: 'Pagination',
      prev: 'Previous page',
      next: 'Next page',
      info: (current: number, pages: number) => `${total} items · page ${current} of ${pages}`,
      range: (start: number, end: number) => `Viewing ${start}–${end}`,
    }))

const range = computed(() => {
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, total)
  return copy.value.range(start, end)
})
</script>

<template>
  <div class="pagination-page-size-demo not-prose">
    <TxPagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :page-size-label="copy.perPage"
      :total="total"
      :aria-label="copy.ariaLabel"
      :prev-label="copy.prev"
      :next-label="copy.next"
      show-info
      @page-size-change="onPageSizeChange"
    >
      <template #info="{ currentPage, totalPages }">
        {{ copy.info(currentPage, totalPages) }}
      </template>
    </TxPagination>
    <p class="pagination-page-size-demo__range">
      {{ range }}
    </p>
  </div>
</template>

<style scoped>
.pagination-page-size-demo {
  display: grid;
  gap: 10px;
  justify-items: center;
  width: 100%;
}

.pagination-page-size-demo__range {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}
</style>
