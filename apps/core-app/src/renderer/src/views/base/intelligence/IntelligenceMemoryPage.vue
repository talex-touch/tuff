<script lang="ts" name="IntelligenceMemoryPage" setup>
import type { MemoryItem, MemoryListStatus } from '@talex-touch/tuff-intelligence'
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import type { TxFlatRadioValue } from '@talex-touch/tuffex/flat-radio'
import type { TxSelectModelValue } from '@talex-touch/tuffex/select'
import type { MemoryScope, MemoryType } from '~/components/intelligence/memory/memory-scope'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import MemoryDetail from '~/components/intelligence/memory/MemoryDetail.vue'
import MemoryEditor from '~/components/intelligence/memory/MemoryEditor.vue'
import MemoryList from '~/components/intelligence/memory/MemoryList.vue'
import { useMemoryLabels } from '~/components/intelligence/memory/memory-labels'
import { MEMORY_SCOPES, MEMORY_TYPES } from '~/components/intelligence/memory/memory-scope'
import SettingsPage from '~/components/settings/SettingsPage.vue'

/**
 * Settings › Intelligence › Memory: the memories replies may draw on, as master/detail.
 *
 * The aside lists one server-side page at a time — search, type, scope and status are all
 * answered by `contextListMemories`, never filtered here. The detail shows the selected memory,
 * the editor, or an empty state. This page owns the list and the selection; the editor only
 * reports what it saved.
 */
const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
const DELETE_REASON = 'user-memory-review-delete'

type EditorState = { mode: 'create' } | { mode: 'edit'; memory: MemoryItem }

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const { typeLabel, scopeLabel } = useMemoryLabels()

const memories = ref<MemoryItem[]>([])
const hasMore = ref(false)
const offset = ref(0)
const searchQuery = ref('')
const filterType = ref<MemoryType | ''>('')
const filterScope = ref<MemoryScope | ''>('')
const filterStatus = ref<MemoryListStatus>('all')

/** Set once the first load settles either way; only the first load shows the skeleton. */
const hasLoaded = ref(false)
const loading = ref(false)
const loadFailed = ref(false)

const selectedId = ref<string | null>(null)
/**
 * What the last save produced. The new memory is the most recently updated one, so it heads the
 * first page — unless the current filters leave it out, and then the detail still shows it.
 */
const savedMemory = ref<MemoryItem | null>(null)
const editor = ref<EditorState | null>(null)
const togglingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const pendingDelete = ref<MemoryItem | null>(null)

const selectedMemory = computed<MemoryItem | null>(() => {
  const id = selectedId.value
  if (!id) return null
  return (
    memories.value.find((memory) => memory.id === id) ??
    (savedMemory.value?.id === id ? savedMemory.value : null)
  )
})

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1)

const filtered = computed(
  () =>
    Boolean(searchQuery.value.trim()) ||
    Boolean(filterType.value) ||
    Boolean(filterScope.value) ||
    filterStatus.value !== 'all'
)

/** One key per pane content, so the detail's out-in transition runs exactly on a real switch. */
const detailKey = computed(() => {
  if (editor.value) {
    return editor.value.mode === 'edit' ? `edit:${editor.value.memory.id}` : 'create'
  }
  return selectedMemory.value ? `detail:${selectedMemory.value.id}` : 'empty'
})

let loadSequence = 0

/**
 * Loads the current page under the current search and filters. Only the latest call writes its
 * result, so a slow reply to an older query can never overwrite a newer one. Resolves `true`
 * when this call's result is the one on screen.
 */
async function loadMemories(): Promise<boolean> {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const result = await aiClient.contextListMemories({
      query: searchQuery.value.trim() || undefined,
      type: filterType.value || undefined,
      scope: filterScope.value || undefined,
      status: filterStatus.value,
      offset: offset.value,
      limit: PAGE_SIZE
    })
    if (sequence !== loadSequence) return false
    memories.value = result.memories
    hasMore.value = result.hasMore ?? false
    loadFailed.value = false
    return true
  } catch {
    if (sequence !== loadSequence) return false
    loadFailed.value = true
    toast.error(t('intelligence.memoryReview.loadFailed'))
    return false
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
      hasLoaded.value = true
    }
  }
}

function reloadFromFirstPage(): void {
  offset.value = 0
  void loadMemories()
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

// The aside's search field reports every keystroke; the server sees the query once typing pauses.
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    reloadFromFirstPage()
  }, SEARCH_DEBOUNCE_MS)
})

watch([filterType, filterScope, filterStatus], reloadFromFirstPage)

const STATUS_FILTERS: readonly MemoryListStatus[] = ['all', 'enabled', 'disabled']

// The TuffEx controls report any `string | number`; only a known value reaches the filters, and
// re-picking the current one changes nothing, so it does not reload.
function setFilterType(value: TxSelectModelValue): void {
  filterType.value = MEMORY_TYPES.find((type) => type === value) ?? ''
}

function setFilterScope(value: TxSelectModelValue): void {
  filterScope.value = MEMORY_SCOPES.find((scope) => scope === value) ?? ''
}

function setFilterStatus(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  filterStatus.value = STATUS_FILTERS.find((status) => status === value) ?? 'all'
}

function showPreviousPage(): void {
  if (offset.value === 0 || loading.value) return
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
  void loadMemories()
}

function showNextPage(): void {
  if (!hasMore.value || loading.value) return
  offset.value += PAGE_SIZE
  void loadMemories()
}

function selectMemory(id: string): void {
  selectedId.value = id
  editor.value = null
}

function startCreate(): void {
  editor.value = { mode: 'create' }
}

function startEdit(): void {
  if (selectedMemory.value) editor.value = { mode: 'edit', memory: selectedMemory.value }
}

function closeEditor(): void {
  editor.value = null
}

/** A replace returns a new id (the original is tombstoned), so the selection follows it. */
async function handleSaved(memory: MemoryItem): Promise<void> {
  savedMemory.value = memory
  selectedId.value = memory.id
  editor.value = null
  offset.value = 0
  await loadMemories()
}

/**
 * The memory changed under the open editor. Reload; its new `updatedAt` puts it at the head of
 * the first page. If it is still there, keep it selected and rebase the draft onto the reloaded
 * copy; if it was replaced or deleted meanwhile, close the editor on whatever replaced it.
 */
async function handleConflict(): Promise<void> {
  const current = editor.value
  if (current?.mode !== 'edit') return
  const id = current.memory.id
  offset.value = 0
  if (!(await loadMemories())) return
  const reloaded = memories.value.find((memory) => memory.id === id)
  if (reloaded) {
    selectedId.value = id
    editor.value = { mode: 'edit', memory: reloaded }
    return
  }
  editor.value = null
  selectedId.value = memories.value.find((memory) => memory.replacesMemoryId === id)?.id ?? null
}

/** Updates the row in place: enabling bumps `updatedAt`, but the list keeps its order. */
async function toggleSelected(): Promise<void> {
  const memory = selectedMemory.value
  if (!memory || togglingId.value) return
  togglingId.value = memory.id
  try {
    const enabled = !memory.enabled
    const result = await aiClient.contextSetMemoryEnabled({ memoryId: memory.id, enabled })
    const patch = (item: MemoryItem): MemoryItem =>
      item.id === memory.id ? { ...item, enabled, updatedAt: result.updatedAt } : item
    memories.value = memories.value.map(patch)
    if (savedMemory.value) savedMemory.value = patch(savedMemory.value)
    toast.success(
      enabled
        ? t('intelligence.memoryReview.enableSuccess')
        : t('intelligence.memoryReview.disableSuccess')
    )
  } catch {
    toast.error(t('intelligence.memoryReview.toggleFailed'))
  } finally {
    togglingId.value = null
  }
}

function requestDeleteSelected(): void {
  if (selectedMemory.value && !deletingId.value) pendingDelete.value = selectedMemory.value
}

function closeDeleteDialog(): void {
  pendingDelete.value = null
}

/**
 * Tombstones the memory, then selects the row that moved into its place (or the new last row).
 * Returns `true` either way: the dialog closes, and a failure is reported by toast.
 */
async function confirmDelete(): Promise<boolean> {
  const memory = pendingDelete.value
  if (!memory || deletingId.value) return true
  deletingId.value = memory.id
  try {
    await aiClient.contextDeleteMemory({ memoryId: memory.id, reason: DELETE_REASON })
    const index = memories.value.findIndex((item) => item.id === memory.id)
    const remaining = memories.value.filter((item) => item.id !== memory.id)
    memories.value = remaining
    if (savedMemory.value?.id === memory.id) savedMemory.value = null
    if (selectedId.value === memory.id) {
      selectedId.value =
        remaining.length > 0
          ? remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!.id
          : null
    }
    toast.success(t('intelligence.memoryReview.deleteSuccess'))
  } catch {
    toast.error(t('intelligence.memoryReview.deleteFailed'))
  } finally {
    deletingId.value = null
  }
  return true
}

const deleteDialogButtons = computed<DialogButton[]>(() => [
  { content: t('common.cancel'), type: 'info', onClick: () => true },
  { content: t('intelligence.memoryReview.delete'), type: 'error', onClick: confirmDelete }
])

/**
 * KeepAlive caches this page, so a mount happens once. Every later visit reloads in place: the
 * rows stay on screen (no skeleton) and the selection survives if its memory is still listed.
 * The first activation arrives together with the mount, whose load is already running.
 */
let activatedOnce = false

onMounted(() => {
  void loadMemories()
})

onActivated(() => {
  if (!activatedOnce) {
    activatedOnce = true
    return
  }
  void loadMemories()
})

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
})
</script>

<template>
  <SettingsPage
    v-model:search="searchQuery"
    layout="split"
    :aria-label="t('intelligence.memoryReview.title')"
    search-id="memory-search"
    :search-placeholder="t('intelligence.memoryReview.searchPlaceholder')"
    :clear-label="t('intelligence.search.clear')"
    main-aria-live="off"
  >
    <template #filter>
      <!--
        Two rows: the 304px aside fits the two selects side by side, and the three status labels
        only on a row of their own without truncation.
      -->
      <div
        class="memory-page__filters"
        role="group"
        :aria-label="t('intelligence.memoryReview.filtersLabel')"
      >
        <div class="memory-page__filter-row">
          <label class="memory-page__filter">
            <span class="sr-only">{{ t('intelligence.memoryReview.typeLabel') }}</span>
            <TxSelect
              :model-value="filterType"
              class="memory-page__select"
              :dropdown-max-height="260"
              data-testid="memory-review-filter-type"
              @update:model-value="setFilterType"
            >
              <TxSelectItem value="" :label="t('intelligence.memoryReview.allTypes')" />
              <TxSelectItem
                v-for="type in MEMORY_TYPES"
                :key="type"
                :value="type"
                :label="typeLabel(type)"
              />
            </TxSelect>
          </label>
          <label class="memory-page__filter">
            <span class="sr-only">{{ t('intelligence.memoryReview.scopeLabel') }}</span>
            <TxSelect
              :model-value="filterScope"
              class="memory-page__select"
              :dropdown-max-height="260"
              data-testid="memory-review-filter-scope"
              @update:model-value="setFilterScope"
            >
              <TxSelectItem value="" :label="t('intelligence.memoryReview.allScopes')" />
              <TxSelectItem
                v-for="scope in MEMORY_SCOPES"
                :key="scope"
                :value="scope"
                :label="scopeLabel(scope)"
              />
            </TxSelect>
          </label>
        </div>
        <TxFlatRadio
          :model-value="filterStatus"
          size="sm"
          class="memory-page__status"
          :aria-label="t('intelligence.memoryReview.memoryStatus')"
          data-testid="memory-review-filter-status"
          @update:model-value="setFilterStatus"
        >
          <TxFlatRadioItem value="all" :label="t('intelligence.memoryReview.allStatuses')" />
          <TxFlatRadioItem value="enabled" :label="t('intelligence.memoryReview.enabled')" />
          <TxFlatRadioItem value="disabled" :label="t('intelligence.memoryReview.disabled')" />
        </TxFlatRadio>
      </div>
    </template>

    <template #aside>
      <MemoryList
        :memories="memories"
        :selected-id="editor?.mode === 'create' ? null : selectedId"
        :pending="!hasLoaded"
        :failed="loadFailed"
        :busy="loading"
        :page="page"
        :has-previous="offset > 0"
        :has-next="hasMore"
        :empty-text="
          filtered
            ? t('intelligence.memoryReview.noMatches')
            : t('intelligence.memoryReview.savedEmpty')
        "
        @select="selectMemory"
        @previous="showPreviousPage"
        @next="showNextPage"
        @retry="loadMemories"
      />
    </template>

    <template #aside-footer>
      <TxButton
        variant="flat"
        type="primary"
        class="w-full"
        data-testid="memory-new"
        @click="startCreate"
      >
        <i class="i-carbon-add" aria-hidden="true" />
        <span>{{ t('intelligence.memoryReview.newMemory') }}</span>
      </TxButton>
    </template>

    <template #detail>
      <div :key="detailKey" class="memory-page__detail">
        <MemoryEditor
          v-if="editor"
          :memory="editor.mode === 'edit' ? editor.memory : null"
          @saved="handleSaved"
          @conflict="handleConflict"
          @cancel="closeEditor"
        />
        <MemoryDetail
          v-else-if="selectedMemory"
          :memory="selectedMemory"
          :toggling="togglingId === selectedMemory.id"
          :deleting="deletingId === selectedMemory.id"
          @edit="startEdit"
          @toggle="toggleSelected"
          @delete="requestDeleteSelected"
        />
        <TxEmptyState
          v-else
          class="memory-page__empty"
          variant="no-selection"
          size="large"
          role="status"
          :title="t('intelligence.memoryReview.selectTitle')"
          :description="t('intelligence.memoryReview.selectDescription')"
          :primary-action="{
            label: t('intelligence.memoryReview.newMemory'),
            type: 'primary',
            icon: 'i-carbon-add'
          }"
          data-testid="memory-empty-selection"
          @primary="startCreate"
        />
      </div>
    </template>

    <template #overlay>
      <TxBottomDialog
        v-if="pendingDelete"
        :title="t('intelligence.memoryReview.deleteConfirmTitle')"
        :message="t('intelligence.memoryReview.deleteConfirmMessage')"
        :btns="deleteDialogButtons"
        :close="closeDeleteDialog"
      />
    </template>
  </SettingsPage>
</template>

<style lang="scss" scoped>
.memory-page__filters {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  width: 100%;
  margin-bottom: var(--shell-space-2);
}

.memory-page__filter-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-2);
}

.memory-page__filter {
  display: block;
  min-width: 0;
}

/* TxSelect is a compact 240px by default; here each one takes its half of the row. */
.memory-page__select {
  width: 100%;
}

.memory-page__status {
  width: 100%;

  :deep(.tx-flat-radio-item) {
    flex: 1 1 0;
    min-width: 0;
  }
}

.memory-page__detail {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.memory-page__empty {
  width: 100%;
  height: 100%;
  justify-content: center;
  -webkit-app-region: drag;

  :deep(button) {
    -webkit-app-region: no-drag;
  }
}
</style>
