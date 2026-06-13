<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBox } from '@talex-touch/utils/plugin/sdk/box-sdk'
import { useClipboard } from '@talex-touch/utils/plugin/sdk/clipboard'
import ClipboardActionBar from '~/components/ClipboardActionBar.vue'
import ClipboardDetail from '~/components/ClipboardDetail.vue'
import ClipboardSidebar from '~/components/ClipboardSidebar.vue'
import type { ClipboardFilter } from '~/utils/clipboard-items'
import {
  buildClipboardWritePayload,
  groupClipboardItems,
  resolveDetailImageSrc,
  selectNextClipboardItemId,
} from '~/utils/clipboard-items'

const clipboard = useClipboard()
const box = useBox()
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
const pageRoot = ref<HTMLElement | null>(null)
const resolvedImageUrls = ref<Record<number, string>>({})
const resolvingImageIds = ref<Record<number, boolean>>({})

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
const selectedResolvedImageUrl = computed(() => {
  const id = selectedItem.value?.id
  return typeof id === 'number' ? (resolvedImageUrls.value[id] ?? null) : null
})
const resolvingSelectedImageUrl = computed(() => {
  const id = selectedItem.value?.id
  return typeof id === 'number' && resolvingImageIds.value[id] === true
})

const filterOptions: Array<{ key: ClipboardFilter; label: string }> = [
  { key: 'all', label: '全部内容' },
  { key: 'text', label: '文本' },
  { key: 'image', label: '图片' },
  { key: 'files', label: '文件' },
  { key: 'favorite', label: '收藏' },
]

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

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

function syncSelection(removedId?: number | null, removedIndex?: number | null): void {
  const nextId = selectNextClipboardItemId(items.value, selectedId.value, removedId, removedIndex)
  selectedId.value = Number.isFinite(nextId) ? nextId : null
}

function patchItemImageUrl(id: number, url: string): void {
  items.value = items.value.map((item) => {
    if (item.id !== id || item.type !== 'image') {
      return item
    }

    return {
      ...item,
      meta: {
        ...(item.meta ?? {}),
        image_original_url: url,
      },
    }
  })
}

async function resolveSelectedImageUrl(item: PluginClipboardItem | null): Promise<void> {
  if (!item || item.type !== 'image' || typeof item.id !== 'number') {
    return
  }

  if (resolvedImageUrls.value[item.id] || resolvingImageIds.value[item.id]) {
    return
  }

  resolvingImageIds.value = {
    ...resolvingImageIds.value,
    [item.id]: true,
  }

  try {
    const url = await clipboard.getHistoryImageUrl(item.id)
    if (!url) {
      return
    }

    resolvedImageUrls.value = {
      ...resolvedImageUrls.value,
      [item.id]: url,
    }
    patchItemImageUrl(item.id, url)
  }
  catch {
    // Detail still falls back to the lightweight thumbnail.
  }
  finally {
    const next = { ...resolvingImageIds.value }
    delete next[item.id]
    resolvingImageIds.value = next
  }
}

function moveSelection(delta: 1 | -1): void {
  const selectableItems = items.value.filter((item): item is PluginClipboardItem & { id: number } => typeof item.id === 'number')
  if (selectableItems.length === 0) {
    selectedId.value = null
    return
  }

  const currentIndex = selectableItems.findIndex(item => item.id === selectedId.value)
  const fallbackIndex = delta > 0 ? 0 : selectableItems.length - 1
  const nextIndex = currentIndex < 0
    ? fallbackIndex
    : Math.min(selectableItems.length - 1, Math.max(0, currentIndex + delta))

  selectedId.value = selectableItems[nextIndex]?.id ?? null
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return
  }
  if (isEditableTarget(event.target)) {
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  moveSelection(event.key === 'ArrowDown' ? 1 : -1)
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
    selectedResolvedImageUrl.value ?? resolveDetailImageSrc(selectedItem.value),
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

async function handleCopyText(value: string): Promise<void> {
  if (!value) {
    return
  }

  errorMessage.value = ''
  try {
    await clipboard.write({ text: value })
  }
  catch (error) {
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '复制文本失败'
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
      const removedIndex = items.value.findIndex(item => item.id === targetId)
      items.value = items.value.filter(item => item.id !== targetId)
      total.value = Math.max(0, total.value - 1)
      syncSelection(targetId, removedIndex)
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
  const removedIndex = items.value.findIndex(item => item.id === removedId)

  try {
    await clipboard.history.deleteItem({ id: removedId })
    items.value = items.value.filter(item => item.id !== removedId)
    total.value = Math.max(0, total.value - 1)
    syncSelection(removedId, removedIndex)
  }
  finally {
    deletePending.value = false
  }
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown, true)
  void box.expand({ forceMax: true }).catch(() => {})
  await loadHistory({ reset: true })

  unsubscribeClipboard = clipboard.history.onDidChange(async () => {
    await loadHistory({ reset: true })
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
  unsubscribeClipboard?.()
})

watch(filter, async () => {
  page.value = 1
  await loadHistory({ reset: true })
})

watch(selectedId, async (id) => {
  if (id === null) {
    return
  }

  await nextTick()
  const selectedElement = pageRoot.value?.querySelector(`[data-clipboard-id="${id}"]`)
  if (selectedElement instanceof HTMLElement && typeof selectedElement.scrollIntoView === 'function') {
    selectedElement.scrollIntoView({ block: 'nearest' })
  }
})

watch(selectedItem, (item) => {
  void resolveSelectedImageUrl(item)
}, { immediate: true })
</script>

<template>
  <main ref="pageRoot" class="ClipboardManagerPage" tabindex="-1">
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
          <div v-if="errorMessage" class="error-banner inline-error">
            {{ errorMessage }}
          </div>
          <ClipboardDetail
            :item="selectedItem"
            :resolved-image-url="selectedResolvedImageUrl"
            :resolving-image-url="resolvingSelectedImageUrl"
            @copy-text="handleCopyText"
          />
        </section>
      </div>

      <section v-else class="empty-canvas">
        <div class="empty-state">
          <div class="empty-state-icon">
            {{ loading ? '⌛' : '📋' }}
          </div>
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
  min-height: 0;
  background: var(--clipboard-surface-base);
  color: var(--clipboard-text-primary);
}

.ClipboardPageHolder {
  height: 100%;
  min-height: 0;
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
  background: var(--clipboard-surface-base);
}

.holder-aside {
  border-right: 1px solid var(--clipboard-border-color);
  background: var(--clipboard-surface-subtle);
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
    color-mix(in srgb, var(--clipboard-surface-ghost) 60%, transparent),
    color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent)
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
  flex: 0 0 auto;
  min-height: 42px;
  padding: 6px 10px;
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
  gap: 10px;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
}

.footer-left {
  flex: 1 1 auto;
  min-width: 0;
}

.footer-right {
  flex: 0 0 auto;
  min-width: 0;
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
  gap: 8px;
  flex-wrap: nowrap;
  width: 100%;
  min-width: 0;
  white-space: nowrap;
}

.error-banner {
  padding: 14px 18px;
  border-radius: 16px;
  color: var(--clipboard-color-danger);
  background: color-mix(in srgb, var(--clipboard-color-danger-soft-fallback) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--clipboard-color-danger) 20%, transparent);
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
  font-size: 0.78rem;
  font-weight: 600;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
  overflow: auto hidden;
  min-width: 0;
  scrollbar-width: none;
}

.filter-group::-webkit-scrollbar {
  display: none;
}

.filter-chip {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--clipboard-border-color);
  border-radius: 999px;
  background: var(--clipboard-surface-subtle);
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  font-size: 0.76rem;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.filter-chip.active {
  border-color: var(--clipboard-color-accent);
  color: var(--clipboard-color-accent-strong);
  background: color-mix(in srgb, var(--clipboard-color-accent) 14%, transparent);
}

@media (max-width: 640px) {
  .ClipboardPageHolder-Main {
    grid-template-columns: 1fr;
    grid-template-rows: 320px minmax(0, 1fr);
  }

  .ManagerFooterBar {
    flex-direction: column;
    align-items: stretch;
  }

  .footer-right {
    width: 100%;
  }
}
</style>
