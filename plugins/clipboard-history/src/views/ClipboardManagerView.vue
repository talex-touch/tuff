<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useClipboard } from '@talex-touch/utils/plugin/sdk/clipboard'
import ClipboardActionBar from '~/components/ClipboardActionBar.vue'
import ClipboardDetail from '~/components/ClipboardDetail.vue'
import ClipboardSidebar from '~/components/ClipboardSidebar.vue'
import {
  type ClipboardFilter,
  buildClipboardWritePayload,
  groupClipboardItems,
  resolveDetailImageSrc,
  selectNextClipboardItemId,
} from '~/utils/clipboard-items'

const clipboard = useClipboard()
const filter = ref<ClipboardFilter>('all')
const items = ref<PluginClipboardItem[]>([])
const selectedId = ref<number | null>(null)
const page = ref(1)
const pageSize = 50
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref('')
const copyPending = ref(false)
const applyPending = ref(false)
const favoritePending = ref(false)
const deletePending = ref(false)

let unsubscribeClipboard: (() => void) | null = null

const hasMore = computed(() => items.value.length < total.value)
const hasItems = computed(() => items.value.length > 0)
const sections = computed(() => groupClipboardItems(items.value))
const selectedItem = computed<PluginClipboardItem | null>(() => {
  if (selectedId.value === null) {
    return null
  }
  return items.value.find(item => item.id === selectedId.value) ?? null
})

const filterOptions: Array<{ key: ClipboardFilter; label: string }> = [
  { key: 'all', label: '全部内容' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'files', label: '文件' },
  { key: 'favorite', label: '收藏' },
]

function normalizeIncomingItems(nextItems: PluginClipboardItem[]): PluginClipboardItem[] {
  return nextItems.filter((item): item is PluginClipboardItem => typeof item.id === 'number')
}

function mergePageItems(nextItems: PluginClipboardItem[]): void {
  const incoming = normalizeIncomingItems(nextItems)
  const byId = new Map<number, PluginClipboardItem>()

  for (const item of items.value) {
    if (typeof item.id === 'number') {
      byId.set(item.id, item)
    }
  }

  for (const item of incoming) {
    byId.set(item.id as number, item)
  }

  const mergedIds = new Set(incoming.map(item => item.id as number))
  const preserved = items.value.filter((item) => {
    const id = item.id
    return typeof id === 'number' && !mergedIds.has(id)
  })

  items.value = [...preserved, ...incoming].sort((left, right) => {
    const leftTime =
      typeof left.timestamp === 'number'
        ? left.timestamp
        : new Date(left.timestamp ?? 0).getTime()
    const rightTime =
      typeof right.timestamp === 'number'
        ? right.timestamp
        : new Date(right.timestamp ?? 0).getTime()

    return rightTime - leftTime
  })
}

function syncSelection(removedId?: number | null): void {
  const nextId = selectNextClipboardItemId(items.value, selectedId.value, removedId)
  selectedId.value = Number.isFinite(nextId) ? nextId : null
}

async function loadHistory(options: { reset?: boolean } = {}): Promise<void> {
  const reset = options.reset === true
  const requestPage = reset ? 1 : page.value

  if (reset) {
    loading.value = true
  }
  else {
    if (loadingMore.value || !hasMore.value) {
      return
    }
    loadingMore.value = true
  }

  errorMessage.value = ''

  try {
    const response = await clipboard.history.getHistory({
      page: requestPage,
      pageSize,
      sortOrder: 'desc',
      type:
        filter.value === 'favorite'
          ? undefined
          : filter.value === 'all'
            ? undefined
            : filter.value,
      isFavorite: filter.value === 'favorite' ? true : undefined,
    })

    total.value = response.total

    if (reset) {
      items.value = normalizeIncomingItems(response.history)
      page.value = 2
    }
    else {
      mergePageItems(response.history)
      page.value += 1
    }

    syncSelection()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取剪贴板历史失败'
  }
  finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function handleCopy(): Promise<void> {
  if (!selectedItem.value) {
    return
  }

  const payload = buildClipboardWritePayload(
    selectedItem.value,
    resolveDetailImageSrc(selectedItem.value),
  )
  if (!payload) {
    return
  }

  copyPending.value = true
  try {
    await clipboard.write(payload)
  }
  finally {
    copyPending.value = false
  }
}

async function handleApply(): Promise<void> {
  if (!selectedItem.value) {
    return
  }

  applyPending.value = true
  errorMessage.value = ''
  try {
    await clipboard.history.applyToActiveApp({ item: selectedItem.value })
  }
  catch (error) {
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '自动粘贴失败'
  }
  finally {
    applyPending.value = false
  }
}

async function handleToggleFavorite(): Promise<void> {
  if (!selectedItem.value?.id) {
    return
  }

  favoritePending.value = true
  const targetId = selectedItem.value.id

  try {
    await clipboard.history.setFavorite({
      id: targetId,
      isFavorite: !selectedItem.value.isFavorite,
    })

    if (filter.value === 'favorite' && selectedItem.value.isFavorite) {
      items.value = items.value.filter(item => item.id !== targetId)
      total.value = Math.max(0, total.value - 1)
      syncSelection(targetId)
      return
    }

    items.value = items.value.map((item) =>
      item.id === targetId
        ? {
            ...item,
            isFavorite: !item.isFavorite,
          }
        : item,
    )
  }
  finally {
    favoritePending.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (!selectedItem.value?.id) {
    return
  }

  deletePending.value = true
  const removedId = selectedItem.value.id

  try {
    await clipboard.history.deleteItem({ id: removedId })
    items.value = items.value.filter(item => item.id !== removedId)
    total.value = Math.max(0, total.value - 1)
    syncSelection(removedId)
  }
  finally {
    deletePending.value = false
  }
}

onMounted(async () => {
  await loadHistory({ reset: true })

  unsubscribeClipboard = clipboard.history.onDidChange(async () => {
    await loadHistory({ reset: true })
  })
})

onBeforeUnmount(() => {
  unsubscribeClipboard?.()
})

watch(filter, async () => {
  page.value = 1
  await loadHistory({ reset: true })
})
</script>

<template>
  <main class="ClipboardManagerPage">
    <div class="ClipboardPageHolder manager-holder" :class="{ blurred: loading && hasItems }">
      <div v-if="hasItems" class="ClipboardPageHolder-Main">
        <aside class="holder-aside">
          <ClipboardSidebar
            :sections="sections"
            :selected-id="selectedId"
            :loading="loading"
            :loading-more="loadingMore"
            :has-more="hasMore"
            @select="selectedId = $event.id ?? null"
            @load-more="loadHistory()"
          />
        </aside>

        <section class="holder-main">
          <div v-if="errorMessage" class="error-banner inline-error">{{ errorMessage }}</div>
          <ClipboardDetail :item="selectedItem" />
        </section>
      </div>

      <section v-else class="empty-canvas">
        <div class="empty-state">
          <div class="empty-state-icon">{{ loading ? '⌛' : '📋' }}</div>
          <h2>{{ loading ? '正在读取剪贴历史' : '暂无剪贴内容' }}</h2>
          <p>{{ loading ? '稍等一下，最近的记录会很快出现在这里。' : '复制一些文本或图片后会出现在这里。' }}</p>
          <div v-if="errorMessage" class="error-banner centered-error">
            {{ errorMessage }}
          </div>
        </div>
      </section>

      <footer class="ClipboardPageHolder-Footer">
        <div class="ManagerFooterBar">
          <div class="footer-left">
            <div class="footer-controls">
              <div class="footer-inline">
                <span class="record-count">共 {{ total }} 条记录</span>
                <div class="filter-group">
                  <button
                    v-for="option in filterOptions"
                    :key="option.key"
                    class="filter-chip"
                    :class="{ active: option.key === filter }"
                    type="button"
                    @click="filter = option.key"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ClipboardActionBar
            class="footer-right"
            :item="selectedItem"
            :copy-pending="copyPending"
            :apply-pending="applyPending"
            :favorite-pending="favoritePending"
            :delete-pending="deletePending"
            @copy="handleCopy"
            @apply="handleApply"
            @toggle-favorite="handleToggleFavorite"
            @delete="handleDelete"
          />
        </div>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.ClipboardManagerPage {
  position: relative;
  height: 100%;
}

.ClipboardPageHolder {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--clipboard-text-primary);
}

.ClipboardPageHolder-Main {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(280px, 30%) minmax(0, 1fr);
  overflow: hidden;
}

.manager-holder {
  transition: filter 0.24s ease;
}

.manager-holder.blurred {
  filter: blur(10px);
  pointer-events: none;
}

.holder-aside,
.holder-main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.holder-aside {
  border-right: 1px solid var(--clipboard-border-color);
}

.empty-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
  color: var(--clipboard-text-muted);
}

.empty-state-icon {
  width: 108px;
  height: 108px;
  border-radius: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--clipboard-surface-ghost, rgba(148, 163, 184, 0.12)) 60%, transparent),
    color-mix(in srgb, var(--clipboard-surface-ghost, rgba(148, 163, 184, 0.12)) 90%, transparent)
  );
}

.empty-state h2 {
  margin: 0;
  font-size: 2rem;
  line-height: 1.15;
  color: var(--clipboard-text-secondary);
}

.empty-state p {
  margin: 0;
  font-size: 0.98rem;
  color: var(--clipboard-text-muted);
}

.ClipboardPageHolder-Footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  width: 100%;
  min-height: 54px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: transparent;
}

.ClipboardPageHolder-Footer::before {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: blur(18px) saturate(180%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--clipboard-surface-strong) 88%, transparent),
    color-mix(in srgb, var(--clipboard-surface-ghost) 92%, transparent)
  );
  pointer-events: none;
  z-index: 0;
}

.ClipboardPageHolder-Footer * {
  position: relative;
  z-index: 1;
}

.ManagerFooterBar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  flex-wrap: nowrap;
}

.footer-left {
  flex: 1 1 auto;
  min-width: 0;
}

.footer-right {
  flex: 0 0 auto;
}

.footer-controls {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.footer-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  width: 100%;
  min-width: 0;
  white-space: nowrap;
}

.error-banner {
  padding: 14px 18px;
  border-radius: 16px;
  color: color-mix(in srgb, var(--clipboard-color-danger, #ef4444) 92%, #7f1d1d);
  background: color-mix(in srgb, var(--clipboard-color-danger-soft-fallback) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--clipboard-color-danger, #ef4444) 20%, transparent);
}

.inline-error {
  margin: 14px 18px 0;
}

.centered-error {
  margin-top: 8px;
  width: min(100%, 720px);
}

.record-count {
  color: var(--clipboard-text-secondary);
  font-size: 0.92rem;
  font-weight: 600;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow: auto hidden;
}

.filter-chip {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--clipboard-border-color);
  border-radius: 999px;
  background: var(--clipboard-surface-subtle);
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.filter-chip.active {
  border-color: var(--clipboard-color-accent, #6366f1);
  color: var(--clipboard-color-accent-strong, var(--clipboard-color-accent, #6366f1));
  background: color-mix(in srgb, var(--clipboard-color-accent, #6366f1) 14%, transparent);
}

@media (max-width: 980px) {
  .ClipboardPageHolder-Main {
    grid-template-columns: 1fr;
    grid-template-rows: 320px minmax(0, 1fr);
  }

  .ManagerFooterBar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
