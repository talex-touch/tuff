<script setup lang="ts">
import type { PaginationProps } from './types'
import { computed } from 'vue'
import { TxIcon } from '../../icon'

interface Props extends PaginationProps {}

interface Emits {
  'update:currentPage': [page: number]
  'pageChange': [page: number]
}

const props = withDefaults(defineProps<Props>(), {
  currentPage: 1,
  pageSize: 10,
  prevIcon: 'chevron-left',
  nextIcon: 'chevron-right',
  showInfo: false,
  showFirstLast: false,
})

const emit = defineEmits<Emits>()

const totalPages = computed(() => {
  if (props.total) {
    return Math.ceil(props.total / props.pageSize)
  }
  return props.totalPages || 1
})

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const current = props.currentPage
  const total = totalPages.value

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  }
  else {
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(total)
    }
    else if (current >= total - 3) {
      pages.push(1)
      pages.push('...')
      for (let i = total - 4; i <= total; i++) {
        pages.push(i)
      }
    }
    else {
      pages.push(1)
      pages.push('...')
      for (let i = current - 1; i <= current + 1; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(total)
    }
  }

  return pages
})

function handlePageChange(page: number) {
  if (page < 1 || page > totalPages.value)
    return

  emit('update:currentPage', page)
  emit('pageChange', page)
}
</script>

<template>
  <nav class="tx-pagination" aria-label="Pagination">
    <ul class="tx-pagination__list">
      <!-- Previous button -->
      <li class="tx-pagination__item">
        <button
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--disabled': currentPage <= 1 }"
          :disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="handlePageChange(currentPage - 1)"
        >
          <TxIcon :name="prevIcon" />
        </button>
      </li>

      <!-- Page numbers -->
      <li
        v-for="page in visiblePages"
        :key="page"
        class="tx-pagination__item"
      >
        <button
          v-if="page !== '...'"
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--active': page === currentPage }"
          :aria-current="page === currentPage ? 'page' : undefined"
          @click="handlePageChange(page as number)"
        >
          {{ page }}
        </button>
        <span v-else class="tx-pagination__ellipsis">...</span>
      </li>

      <!-- Next button -->
      <li class="tx-pagination__item">
        <button
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--disabled': currentPage >= totalPages }"
          :disabled="currentPage >= totalPages"
          aria-label="Next page"
          @click="handlePageChange(currentPage + 1)"
        >
          <TxIcon :name="nextIcon" />
        </button>
      </li>
    </ul>

    <!-- Page info -->
    <div v-if="showInfo" class="tx-pagination__info">
      <slot name="info" :current-page="currentPage" :total-pages="totalPages" :total="total">
        Page {{ currentPage }} of {{ totalPages }}
        <span v-if="total">({{ total }} items)</span>
      </slot>
    </div>
  </nav>
</template>

<style scoped>
.tx-pagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.tx-pagination__list {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 4px;
}

.tx-pagination__item {
  display: flex;
}

.tx-pagination__button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--tx-pagination-border, #d1d5db);
  border-radius: 6px;
  background: var(--tx-pagination-bg, #ffffff);
  color: var(--tx-pagination-text, #374151);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tx-pagination__button:hover:not(.tx-pagination__button--disabled) {
  background: var(--tx-pagination-hover-bg, #f9fafb);
  border-color: var(--tx-pagination-hover-border, #9ca3af);
}

.tx-pagination__button--active {
  background: var(--tx-pagination-active-bg, #3b82f6);
  border-color: var(--tx-pagination-active-border, #3b82f6);
  color: var(--tx-pagination-active-text, #ffffff);
}

.tx-pagination__button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tx-pagination__ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  color: var(--tx-pagination-text, #374151);
  font-size: 14px;
}

.tx-pagination__info {
  font-size: 14px;
  color: var(--tx-pagination-info-text, #6b7280);
}
</style>
