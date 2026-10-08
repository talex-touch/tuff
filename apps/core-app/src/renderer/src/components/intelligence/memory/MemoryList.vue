<script lang="ts" setup>
import type { MemoryItem } from '@talex-touch/tuff-intelligence'
import type { MemoryScopeEffect } from './memory-scope'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRowSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMemoryLabels } from './memory-labels'
import { memoryScopeEffect } from './memory-scope'

/**
 * The aside's memory rows: summary, type · scope, a badge on disabled memories and a marker on
 * any memory whose scope keeps it out of replies (or inside its source session only).
 *
 * The rows form a listbox with one tab stop. Arrow keys, Home and End move the selection and the
 * focus together. They are handled on the list itself, not on `document`: the page is cached by
 * KeepAlive, and a document listener would keep answering arrow keys after the user has left it.
 */
const props = withDefaults(
  defineProps<{
    memories: MemoryItem[]
    selectedId?: string | null
    /** The first page has not arrived yet. Drives the skeleton; later reloads keep the rows. */
    pending?: boolean
    /** The last load failed. Shown only when there are no rows to keep showing instead. */
    failed?: boolean
    /** A reload is in flight; the pager waits for it. */
    busy?: boolean
    page?: number
    hasPrevious?: boolean
    hasNext?: boolean
    emptyText: string
  }>(),
  {
    selectedId: null,
    pending: false,
    failed: false,
    busy: false,
    page: 1,
    hasPrevious: false,
    hasNext: false
  }
)

const emit = defineEmits<{
  select: [id: string]
  previous: []
  next: []
  retry: []
}>()

const { t } = useI18n()
const { typeLabel, scopeLabel, effectLabel } = useMemoryLabels()

/** Enough placeholder rows to fill the aside at its usual height. */
const SKELETON_ROWS = 6

/**
 * A fast first load shows no skeleton at all, and one that does appear stays long enough to be
 * read as one. While the load is pending but the skeleton is still held back, the list renders
 * nothing rather than flashing the empty text.
 */
const showSkeleton = useDeferredLoading(() => props.pending)

const listRef = ref<HTMLElement | null>(null)

/** The one row reachable with Tab: the selection when this page shows it, else the first row. */
const tabStopId = computed(() => {
  const { memories, selectedId } = props
  if (selectedId && memories.some((memory) => memory.id === selectedId)) return selectedId
  return memories[0]?.id ?? null
})

function effectOf(memory: MemoryItem): MemoryScopeEffect {
  return memoryScopeEffect(memory)
}

function focusRow(id: string): void {
  const rows = listRef.value?.querySelectorAll<HTMLElement>('[data-memory-id]') ?? []
  for (const row of rows) {
    if (row.dataset.memoryId === id) {
      row.focus()
      return
    }
  }
}

function handleKeydown(event: KeyboardEvent): void {
  const { memories } = props
  if (memories.length === 0) return
  const fromId = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-memory-id]')
    ?.dataset.memoryId
  const from = memories.findIndex((memory) => memory.id === fromId)
  let to: number
  switch (event.key) {
    case 'ArrowDown':
      to = from < 0 ? 0 : Math.min(from + 1, memories.length - 1)
      break
    case 'ArrowUp':
      to = from < 0 ? 0 : Math.max(from - 1, 0)
      break
    case 'Home':
      to = 0
      break
    case 'End':
      to = memories.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  if (to === from) return
  const id = memories[to]!.id
  emit('select', id)
  void nextTick(() => focusRow(id))
}
</script>

<template>
  <div class="memory-list">
    <div
      v-if="showSkeleton"
      class="memory-list__rows"
      aria-hidden="true"
      data-testid="memory-list-skeleton"
    >
      <div v-for="index in SKELETON_ROWS" :key="index" class="memory-list__row is-skeleton">
        <TxRowSkeleton description />
      </div>
    </div>

    <template v-else-if="!pending">
      <div
        v-if="memories.length"
        ref="listRef"
        class="memory-list__rows"
        role="listbox"
        :aria-label="t('intelligence.memoryReview.listLabel')"
        data-testid="memory-review-saved-list"
        @keydown="handleKeydown"
      >
        <button
          v-for="memory in memories"
          :key="memory.id"
          type="button"
          role="option"
          class="memory-list__row"
          :class="{ 'is-selected': memory.id === selectedId, 'is-disabled': !memory.enabled }"
          :aria-selected="memory.id === selectedId"
          :tabindex="memory.id === tabStopId ? 0 : -1"
          :data-memory-id="memory.id"
          :data-testid="`memory-row-${memory.id}`"
          @click="emit('select', memory.id)"
        >
          <span class="memory-list__line">
            <span class="memory-list__title">{{ memory.summary }}</span>
            <span v-if="!memory.enabled" class="memory-list__chip">
              {{ t('intelligence.memoryReview.disabled') }}
            </span>
          </span>
          <span class="memory-list__line memory-list__meta">
            <span class="memory-list__meta-text">
              {{ typeLabel(memory.type) }} · {{ scopeLabel(memory.scope) }}
            </span>
            <span
              v-if="effectOf(memory) !== 'effective'"
              class="memory-list__chip"
              :class="`is-${effectOf(memory)}`"
              data-testid="memory-row-effect"
            >
              {{ effectLabel(effectOf(memory)) }}
            </span>
          </span>
        </button>
      </div>

      <div v-else-if="failed" class="memory-list__message is-error" role="alert">
        <span>{{ t('intelligence.memoryReview.loadFailed') }}</span>
        <TxButton variant="flat" size="sm" data-testid="memory-list-retry" @click="emit('retry')">
          {{ t('common.retry') }}
        </TxButton>
      </div>

      <p v-else class="memory-list__message" role="status">
        {{ emptyText }}
      </p>

      <nav
        v-if="hasPrevious || hasNext"
        class="memory-list__pager"
        :aria-label="t('intelligence.memoryReview.pagination')"
      >
        <TxButton
          variant="flat"
          size="sm"
          :disabled="!hasPrevious || busy"
          data-testid="memory-review-page-previous"
          @click="emit('previous')"
        >
          {{ t('intelligence.memoryReview.previous') }}
        </TxButton>
        <span>{{ t('intelligence.memoryReview.page', { page }) }}</span>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="!hasNext || busy"
          data-testid="memory-review-page-next"
          @click="emit('next')"
        >
          {{ t('intelligence.memoryReview.next') }}
        </TxButton>
      </nav>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.memory-list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3);
}

.memory-list__rows {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1);
}

/*
 * Two fixed lines: the summary and the type · scope line never wrap, so every row is the same
 * height and the skeleton below can match it exactly.
 */
.memory-list__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }

  &.is-selected {
    border-color: var(--shell-primary-border);
    background: var(--shell-primary-soft);
  }

  &.is-disabled .memory-list__title {
    color: var(--shell-text-secondary);
  }

  /*
   * The placeholder shares the row's box (padding, border) and gets the row's two line boxes:
   * `TxRowSkeleton` sizes its bars inside lines of the given height, so the title line is the
   * summary's 13px × 1.5 and the description line the meta's 12px × 1.5.
   */
  &.is-skeleton {
    cursor: default;

    --tx-skeleton-row-padding-block: 0;
    --tx-skeleton-row-padding-inline: 0;
    --tx-skeleton-row-text-gap: 2px;
    --tx-skeleton-row-title-line: calc(var(--shell-fs-body) * 1.5);
    --tx-skeleton-row-desc-line: calc(var(--shell-fs-sm) * 1.5);

    &:hover {
      background: transparent;
    }
  }
}

.memory-list__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.memory-list__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  text-overflow: ellipsis;
}

.memory-list__meta {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.memory-list__meta-text {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Sits inside a text line, so it must not be taller than one: 16px against 18px / 19.5px lines. */
.memory-list__chip {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-info-soft);
  color: var(--shell-info);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  line-height: 16px;

  &.is-inactive {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }
}

.memory-list__message {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-2);
  margin: 0;
  padding: var(--shell-space-3);
  border: 1px dashed var(--shell-border);
  border-radius: var(--shell-radius-md);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);

  &.is-error {
    border-color: var(--shell-danger-border);
    color: var(--shell-danger);
  }
}

.memory-list__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}
</style>
