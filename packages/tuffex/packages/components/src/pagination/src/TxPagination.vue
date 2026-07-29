<script setup lang="ts">
import type { PaginationProps } from './types'
import { computed, watch } from 'vue'
import { TxIcon } from '../../icon'

interface Props extends PaginationProps {}

interface Emits {
  'update:currentPage': [page: number]
  'pageChange': [page: number]
}

const props = withDefaults(defineProps<Props>(), {
  currentPage: 1,
  pageSize: 10,
  prevIcon: 'i-carbon-chevron-left',
  nextIcon: 'i-carbon-chevron-right',
  showInfo: false,
  showFirstLast: false,
  ariaLabel: 'Pagination',
  firstLabel: 'First page',
  prevLabel: 'Previous page',
  nextLabel: 'Next page',
  lastLabel: 'Last page',
})

const emit = defineEmits<Emits>()

const totalPages = computed(() => {
  if (props.total) {
    return Math.ceil(props.total / props.pageSize)
  }
  return props.totalPages || 1
})

// `currentPage` can arrive outside [1, totalPages] — e.g. the row count shrank after a
// filter change. Every display / disabled / navigation read goes through this clamp so
// the controls never show an enabled button that navigates nowhere or a page with no
// active item.
const safePage = computed(() => Math.min(Math.max(props.currentPage, 1), totalPages.value))

// Self-correct the parent's v-model when the incoming page is out of range instead of
// leaving it pointing at a page that no longer exists (and relying on callers to reset).
watch([() => props.currentPage, totalPages], () => {
  if (props.currentPage !== safePage.value) {
    emit('update:currentPage', safePage.value)
  }
}, { immediate: true })

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
  <nav class="tx-pagination" :aria-label="ariaLabel">
    <ul class="tx-pagination__list">
      <!-- First button -->
      <li v-if="showFirstLast" class="tx-pagination__item">
        <button
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--disabled': safePage <= 1 }"
          type="button"
          :disabled="safePage <= 1"
          :aria-label="firstLabel"
          @click="handlePageChange(1)"
        >
          &laquo;
        </button>
      </li>

      <!-- Previous button -->
      <li class="tx-pagination__item">
        <button
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--disabled': safePage <= 1 }"
          type="button"
          :disabled="safePage <= 1"
          :aria-label="prevLabel"
          @click="handlePageChange(safePage - 1)"
        >
          <TxIcon :name="prevIcon" />
        </button>
      </li>

      <!-- Page numbers -->
      <li
        v-for="(page, index) in visiblePages"
        :key="`${page}-${index}`"
        class="tx-pagination__item"
      >
        <button
          v-if="page !== '...'"
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--active': page === safePage }"
          type="button"
          :aria-current="page === safePage ? 'page' : undefined"
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
          :class="{ 'tx-pagination__button--disabled': safePage >= totalPages }"
          type="button"
          :disabled="safePage >= totalPages"
          :aria-label="nextLabel"
          @click="handlePageChange(safePage + 1)"
        >
          <TxIcon :name="nextIcon" />
        </button>
      </li>

      <!-- Last button -->
      <li v-if="showFirstLast" class="tx-pagination__item">
        <button
          class="tx-pagination__button"
          :class="{ 'tx-pagination__button--disabled': safePage >= totalPages }"
          type="button"
          :disabled="safePage >= totalPages"
          :aria-label="lastLabel"
          @click="handlePageChange(totalPages)"
        >
          &raquo;
        </button>
      </li>
    </ul>

    <!-- Page info -->
    <div v-if="showInfo" class="tx-pagination__info">
      <slot name="info" :current-page="safePage" :total-pages="totalPages" :total="total">
        Page {{ safePage }} of {{ totalPages }}
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
  gap: 8px;
}

.tx-pagination__list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 6px;
}

.tx-pagination__item {
  display: flex;
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tx-pagination__item::marker {
  content: '';
}

.tx-pagination__button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--tx-pagination-border, var(--tx-border-color-lighter, #dcdfe6));
  border-radius: var(--tx-pagination-radius, 8px);
  background: var(--tx-pagination-bg, var(--tx-fill-color-blank, #ffffff));
  color: var(--tx-pagination-text, var(--tx-text-color-regular, #606266));
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color var(--tx-transition-duration-fast, 0.2s),
    border-color var(--tx-transition-duration-fast, 0.2s),
    color var(--tx-transition-duration-fast, 0.2s),
    box-shadow var(--tx-transition-duration-fast, 0.2s);
}

.tx-pagination__button:hover:not(.tx-pagination__button--disabled) {
  background: var(--tx-pagination-hover-bg, color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, var(--tx-fill-color-blank, #ffffff)));
  border-color: var(--tx-pagination-hover-border, color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, var(--tx-border-color-lighter, #dcdfe6)));
  color: var(--tx-pagination-hover-text, var(--tx-color-primary, #409eff));
}

.tx-pagination__button:focus-visible {
  outline: none;
  border-color: var(--tx-pagination-focus-border, var(--tx-color-primary, #409eff));
  box-shadow: var(--tx-focus-ring-shadow, 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent));
}

.tx-pagination__button--active {
  background: var(--tx-pagination-active-bg, var(--tx-color-primary, #409eff));
  border-color: var(--tx-pagination-active-border, var(--tx-color-primary, #409eff));
  color: var(--tx-pagination-active-text, #ffffff);
  font-weight: 600;
}

.tx-pagination__button--disabled {
  color: var(--tx-pagination-disabled-text, var(--tx-text-color-disabled, #c0c4cc));
  background: var(--tx-pagination-disabled-bg, color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent));
  border-color: var(--tx-pagination-disabled-border, var(--tx-border-color-extra-light, #f2f6fc));
  opacity: 1;
  cursor: not-allowed;
}

.tx-pagination__ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  color: var(--tx-pagination-info-text, var(--tx-text-color-secondary, #909399));
  font-size: 14px;
}

.tx-pagination__info {
  font-size: 13px;
  color: var(--tx-pagination-info-text, var(--tx-text-color-secondary, #909399));
}
</style>
