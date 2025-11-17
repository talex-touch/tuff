<template>
  <div class="prompt-page h-full flex flex-col" role="main" aria-label="Intelligence Prompt Manager">
    <tuff-aside-template
      v-model="searchQuery"
      class="prompt-shell flex-1"
      :search-id="'prompt-search'"
      :search-label="t('settings.intelligence.promptSearchLabel')"
      :search-placeholder="t('settings.intelligence.promptSearchPlaceholder')"
      :clear-label="t('common.close')"
    >
      <template #aside-header>
        <div class="prompt-sidebar__summary">
          <p class="prompt-sidebar__eyebrow">
            {{ t('settings.intelligence.promptStatsLabel', promptStats) }}
          </p>
          <button class="aisdk-btn primary mt-3 w-full" type="button" @click="handleCreatePrompt">
            <i class="i-carbon-add" aria-hidden="true" />
            <span>{{ t('settings.intelligence.landing.prompts.newPromptButton') }}</span>
          </button>
        </div>
      </template>

      <template #filter>
        <div class="prompt-filters" role="tablist">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            class="prompt-filter"
            type="button"
            role="tab"
            :class="{ 'is-active': filterMode === option.value }"
            @click="filterMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="prompt-list__hint text-xs text-[var(--el-text-color-secondary)]">
          {{ t('settings.intelligence.landing.prompts.statsDesc', { words: totalWordsApprox }) }}
        </p>
      </template>

      <template #default>
        <tuff-aside-list
          v-model:selected-id="selectedPromptId"
          :items="promptListItems"
          :empty-text="t('settings.intelligence.promptListEmpty')"
          @select="handleSelectPrompt"
        />
      </template>

      <template #main>
        <div class="prompt-main-panel flex-1 overflow-hidden">
          <header class="prompt-main-header">
            <div>
              <p class="prompt-main-eyebrow">{{ t('flatNavBar.intelligence') }}</p>
              <h1>{{ t('settings.intelligence.promptPageTitle') }}</h1>
              <p class="prompt-main-desc">{{ t('settings.intelligence.promptPageDesc') }}</p>
            </div>
            <div class="prompt-main-actions">
              <button class="aisdk-btn ghost" type="button" @click="handleOpenDocs">
                <i class="i-carbon-link" aria-hidden="true" />
                <span>{{ t('settings.intelligence.docsButton') }}</span>
              </button>
              <button class="aisdk-btn ghost" type="button" @click="handleOpenFolder">
                <i class="i-carbon-folder-open" aria-hidden="true" />
                <span>{{ t('settings.intelligence.landing.prompts.folderButton') }}</span>
              </button>
              <button class="aisdk-btn ghost" type="button" @click="triggerImport">
                <i class="i-carbon-download" aria-hidden="true" />
                <span>{{ t('settings.intelligence.promptImportButton') }}</span>
              </button>
              <button class="aisdk-btn ghost" type="button" @click="handleExportPrompts">
                <i class="i-carbon-upload" aria-hidden="true" />
                <span>{{ t('settings.intelligence.promptExportButton') }}</span>
              </button>
            </div>
          </header>

          <section class="prompt-details flex-1 overflow-hidden">
            <Transition name="fade-slide" mode="out-in">
              <div
                v-if="selectedPrompt"
                :key="selectedPrompt.id"
                class="prompt-detail h-full overflow-y-auto p-6"
                :aria-live="isBuiltinSelected ? 'polite' : 'off'"
              >
                <header class="prompt-detail__header">
                  <div>
                    <p class="text-xs uppercase tracking-wide text-[var(--el-text-color-secondary)]">
                      {{ selectedPrompt.builtin ? t('settings.intelligence.builtin') : t('settings.intelligence.custom') }}
                    </p>
                    <h2 class="prompt-detail__title">{{ promptDraft.name }}</h2>
                    <p class="prompt-detail__desc">
                      {{ promptDraft.description || t('settings.intelligence.promptMetaDescription') }}
                    </p>
                  </div>
                  <div class="prompt-detail__meta text-sm text-[var(--el-text-color-secondary)]">
                    <p>
                      {{ t('settings.intelligence.promptMetaUpdated') }}:
                      {{ formatTimestamp(selectedPrompt.updatedAt) }}
                    </p>
                    <p>
                      {{ t('settings.intelligence.promptMetaCreated') }}:
                      {{ formatTimestamp(selectedPrompt.createdAt) }}
                    </p>
                  </div>
                </header>

                <div
                  v-if="selectedPrompt.builtin"
                  class="prompt-readonly-hint"
                  role="status"
                >
                  <i class="i-carbon-information" aria-hidden="true" />
                  <span>{{ t('settings.intelligence.promptReadonlyHint') }}</span>
                </div>

                <div class="prompt-form">
                  <label class="prompt-label" for="prompt-name">
                    {{ t('settings.intelligence.promptNameLabel') }}
                  </label>
                  <input
                    id="prompt-name"
                    v-model="promptDraft.name"
                    class="prompt-input"
                    type="text"
                    :placeholder="t('settings.intelligence.promptNamePlaceholder')"
                    :disabled="isBuiltinSelected"
                  />

                  <label class="prompt-label" for="prompt-category">
                    {{ t('settings.intelligence.promptMetaCategory') }}
                  </label>
                  <input
                    id="prompt-category"
                    v-model="promptDraft.category"
                    class="prompt-input"
                    type="text"
                    :placeholder="t('settings.intelligence.promptCategoryPlaceholder')"
                    :disabled="isBuiltinSelected"
                  />

                  <label class="prompt-label" for="prompt-description">
                    {{ t('settings.intelligence.promptDescriptionLabel') }}
                  </label>
                  <textarea
                    id="prompt-description"
                    v-model="promptDraft.description"
                    class="prompt-textarea"
                    rows="2"
                    :placeholder="t('settings.intelligence.promptDescriptionPlaceholder')"
                    :disabled="isBuiltinSelected"
                  />

              <label class="prompt-label" for="prompt-content">
                {{ t('settings.intelligence.promptContentLabel') }}
              </label>
              <div class="prompt-markdown">
                <FlatMarkdown
                  v-model="promptDraft.content"
                  :readonly="isBuiltinSelected"
                />
              </div>
            </div>

            <div class="prompt-actions">
              <div class="prompt-actions__primary">
                <button class="aisdk-btn ghost" type="button" @click="handleDuplicatePrompt">
                  <i class="i-carbon-copy" aria-hidden="true" />
                  <span>{{ t('settings.intelligence.promptDuplicateButton') }}</span>
                    </button>
                    <button class="aisdk-btn ghost" type="button" @click="handleCopyContent">
                      <i class="i-carbon-document" aria-hidden="true" />
                      <span>{{ t('settings.intelligence.promptCopyButton') }}</span>
                    </button>
                  </div>
                  <div class="prompt-actions__secondary">
                    <button
                      class="aisdk-btn danger"
                      type="button"
                      :disabled="!isCustomEditable"
                      @click="handleDeletePrompt"
                    >
                      <i class="i-carbon-trash-can" aria-hidden="true" />
                      <span>{{ t('settings.intelligence.promptDeleteButton') }}</span>
                    </button>
                    <button
                      class="aisdk-btn primary"
                      type="button"
                      :disabled="!isCustomEditable || !isDirty"
                      @click="handleSavePrompt"
                    >
                      <i class="i-carbon-checkmark" aria-hidden="true" />
                  <span>{{ t('settings.intelligence.promptSaveButton') }}</span>
                </button>
              </div>
              <div v-if="isCustomEditable" class="prompt-actions__status" :data-status="autoSaveStatus">
                <i
                  v-if="autoSaveStatus === 'pending' || autoSaveStatus === 'saving'"
                  class="i-carbon-renew animate-spin text-[var(--el-text-color-secondary)]"
                />
                <i
                  v-else-if="autoSaveStatus === 'saved'"
                  class="i-carbon-checkmark text-[var(--el-color-success)]"
                />
                <span>{{ autoSaveStatusText }}</span>
              </div>
            </div>
              </div>
              <div v-else class="prompt-empty-state" role="status">
                <i class="i-carbon-idea text-4xl text-[var(--el-border-color)]" aria-hidden="true" />
                <p class="prompt-empty-state__title">
                  {{ t('settings.intelligence.promptEmptyStateTitle') }}
                </p>
                <p class="prompt-empty-state__desc">
                  {{ t('settings.intelligence.promptEmptyStateDesc') }}
                </p>
                <button class="aisdk-btn primary" type="button" @click="handleCreatePrompt">
                  <i class="i-carbon-add" aria-hidden="true" />
                  <span>{{ t('settings.intelligence.landing.prompts.newPromptButton') }}</span>
                </button>
              </div>
            </Transition>
          </section>
        </div>
      </template>
    </tuff-aside-template>

    <input
      ref="importInputRef"
      class="sr-only"
      type="file"
      accept="application/json"
      @change="handleImport"
    />
  </div>
</template>

<script lang="ts" name="IntelligencePromptsPage" setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffAsideList from '~/components/tuff/template/TuffAsideList.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { getPromptManager, type PromptTemplate } from '~/modules/hooks/usePromptManager'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'

type FilterMode = 'all' | 'builtin' | 'custom'

const { t } = useI18n()
const promptManager = getPromptManager()

const searchQuery = ref('')
const filterMode = ref<FilterMode>('all')
const selectedPromptId = ref<string | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)
const promptDraft = reactive({
  name: '',
  category: '',
  description: '',
  content: ''
})
const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved'>('idle')
let isApplyingDraft = false
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const filterOptions = computed(() => [
  { value: 'all', label: t('settings.intelligence.promptFilterAll') },
  { value: 'builtin', label: t('settings.intelligence.builtin') },
  { value: 'custom', label: t('settings.intelligence.custom') }
])

const orderedPrompts = computed<PromptTemplate[]>(() => {
  const builtin = promptManager.prompts.builtin ?? []
  const custom = promptManager.prompts.custom ?? []
  return [...builtin, ...custom].sort((a, b) => a.name.localeCompare(b.name))
})

const visiblePrompts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return orderedPrompts.value.filter((prompt) => {
    const matchesFilter =
      filterMode.value === 'all'
        ? true
        : filterMode.value === 'builtin'
          ? prompt.builtin
          : !prompt.builtin

    if (!matchesFilter) return false
    if (!query) return true
    return (
      prompt.name.toLowerCase().includes(query) ||
      (prompt.description && prompt.description.toLowerCase().includes(query)) ||
      prompt.content.toLowerCase().includes(query)
    )
  })
})

const promptListItems = computed(() =>
  visiblePrompts.value.map((prompt) => ({
    id: prompt.id,
    title: prompt.name,
    description: prompt.description || t('settings.intelligence.promptMetaDescription'),
    badgeLabel: prompt.builtin ? t('settings.intelligence.builtin') : t('settings.intelligence.custom'),
    badgeVariant: prompt.builtin ? 'info' : 'success'
  }))
)

watch(
  visiblePrompts,
  (list) => {
    if (list.length === 0) {
      selectedPromptId.value = null
      return
    }
    if (!selectedPromptId.value || !list.some((prompt) => prompt.id === selectedPromptId.value)) {
      selectedPromptId.value = list[0].id
    }
  },
  { immediate: true }
)

const selectedPrompt = computed<PromptTemplate | null>(() => {
  if (!selectedPromptId.value) return null
  return orderedPrompts.value.find((prompt) => prompt.id === selectedPromptId.value) ?? null
})

const isBuiltinSelected = computed(() => !!selectedPrompt.value?.builtin)
const isCustomEditable = computed(() => !!selectedPrompt.value && !selectedPrompt.value.builtin)

watch(
  selectedPrompt,
  (prompt) => {
    isApplyingDraft = true
    if (!prompt) {
      promptDraft.name = ''
      promptDraft.category = ''
      promptDraft.description = ''
      promptDraft.content = ''
      autoSaveStatus.value = 'idle'
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
      }
      isApplyingDraft = false
      return
    }
    promptDraft.name = prompt.name
    promptDraft.category = prompt.category ?? ''
    promptDraft.description = prompt.description ?? ''
    promptDraft.content = prompt.content
    autoSaveStatus.value = 'idle'
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    isApplyingDraft = false
  },
  { immediate: true }
)

const isDirty = computed(() => {
  if (!selectedPrompt.value || !isCustomEditable.value) return false
  return (
    selectedPrompt.value.name !== promptDraft.name ||
    (selectedPrompt.value.category ?? '') !== promptDraft.category ||
    (selectedPrompt.value.description ?? '') !== promptDraft.description ||
    selectedPrompt.value.content !== promptDraft.content
  )
})

const promptStats = computed(() => ({
  total: orderedPrompts.value.length,
  builtin: promptManager.prompts.builtin.length,
  custom: promptManager.prompts.custom.length
}))

const totalWordsApprox = computed(() =>
  orderedPrompts.value.reduce((sum, prompt) => {
    const words = prompt.content
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
    return sum + words
  }, 0)
)

const autoSaveStatusText = computed(() => {
  switch (autoSaveStatus.value) {
    case 'pending':
      return '待保存...'
    case 'saving':
      return '保存中...'
    case 'saved':
      return '已保存'
    default:
      return '自动保存已启用'
  }
})

function flushPendingPromptChanges(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  if (!selectedPrompt.value || !isCustomEditable.value) {
    autoSaveStatus.value = 'idle'
    return
  }
  if (!isDirty.value) {
    autoSaveStatus.value = 'idle'
    return
  }
  autoSaveStatus.value = 'saving'
  const ok = persistPrompt(false)
  autoSaveStatus.value = ok ? 'saved' : 'idle'
  if (ok) {
    window.setTimeout(() => {
      if (autoSaveStatus.value === 'saved') autoSaveStatus.value = 'idle'
    }, 1200)
  }
}

function handleSelectPrompt(id: string): void {
  flushPendingPromptChanges()
  selectedPromptId.value = id
}

function handleOpenDocs(): void {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}

async function handleOpenFolder(): Promise<void> {
  try {
    await touchChannel.send('app:open-prompts-folder')
    toast.success(t('settings.intelligence.landing.prompts.folderOpenSuccess'))
  } catch (error) {
    console.error('[PromptManager] Failed to open folder', error)
    toast.error(t('settings.intelligence.landing.prompts.folderOpenFailed'))
  }
}

function handleCreatePrompt(): void {
  flushPendingPromptChanges()
  const name = t('settings.intelligence.promptNewDefaultName', { index: promptStats.value.custom + 1 })
  const newId = promptManager.addCustomPrompt({
    name,
    category: 'custom',
    description: t('settings.intelligence.promptDescriptionPlaceholder'),
    content: ''
  })
  filterMode.value = 'custom'
  searchQuery.value = ''
  selectedPromptId.value = newId
  toast.success(t('settings.intelligence.promptCreateSuccess'))
}

function handleDuplicatePrompt(): void {
  if (!selectedPrompt.value) return
  flushPendingPromptChanges()
  const suffix = t('settings.intelligence.promptDuplicateSuffix')
  const name = `${selectedPrompt.value.name} ${suffix}`.trim()
  const newId = promptManager.addCustomPrompt({
    name,
    category: selectedPrompt.value.category ?? '',
    description: selectedPrompt.value.description ?? '',
    content: selectedPrompt.value.content
  })
  filterMode.value = 'custom'
  selectedPromptId.value = newId
  toast.success(t('settings.intelligence.promptDuplicateSuccess'))
}

function persistPrompt(showSuccessToast: boolean, showErrorToast: boolean = true): boolean {
  if (!selectedPrompt.value || !isCustomEditable.value) return false
  const ok = promptManager.updateCustomPrompt(selectedPrompt.value.id, {
    name: promptDraft.name,
    category: promptDraft.category,
    description: promptDraft.description,
    content: promptDraft.content
  })
  if (ok) {
    if (showSuccessToast) toast.success(t('settings.intelligence.promptSaveSuccess'))
  } else if (showErrorToast) {
    toast.error(t('settings.intelligence.promptSaveFailed'))
  }
  return ok
}

function handleSavePrompt(): void {
  persistPrompt(true)
}

function scheduleAutoSave(): void {
  if (!selectedPrompt.value || !isCustomEditable.value || isApplyingDraft) return
  autoSaveStatus.value = 'pending'
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    runAutoSave()
  }, 900)
}

function runAutoSave(): void {
  if (!selectedPrompt.value || !isCustomEditable.value) {
    autoSaveStatus.value = 'idle'
    return
  }
  if (!isDirty.value) {
    autoSaveStatus.value = 'idle'
    return
  }
  autoSaveStatus.value = 'saving'
  const ok = persistPrompt(false)
  autoSaveStatus.value = ok ? 'saved' : 'idle'
  if (ok) {
    window.setTimeout(() => {
      if (autoSaveStatus.value === 'saved') {
        autoSaveStatus.value = 'idle'
      }
    }, 1500)
  }
}

watch(
  () => ({ ...promptDraft }),
  () => {
    if (isApplyingDraft || !isCustomEditable.value) return
    scheduleAutoSave()
  },
  { deep: true }
)

function handleDeletePrompt(): void {
  if (!selectedPrompt.value || !isCustomEditable.value) return
  flushPendingPromptChanges()
  if (!window.confirm(t('settings.intelligence.promptDeleteConfirm'))) return
  const deletedId = selectedPrompt.value.id
  const deleted = promptManager.deleteCustomPrompt(deletedId)
  if (!deleted) {
    toast.error(t('settings.intelligence.promptDeleteFailed'))
    return
  }
  toast.success(t('settings.intelligence.promptDeleteSuccess'))
  const next = visiblePrompts.value.find((prompt) => prompt.id !== deletedId)
  selectedPromptId.value = next?.id ?? orderedPrompts.value[0]?.id ?? null
}

async function handleCopyContent(): Promise<void> {
  if (!selectedPrompt.value) return
  try {
    await navigator.clipboard.writeText(selectedPrompt.value.content)
    toast.success(t('settings.intelligence.promptCopySuccess'))
  } catch (error) {
    console.error('[PromptManager] Failed to copy prompt', error)
  }
}

function triggerImport(): void {
  importInputRef.value?.click()
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const imported = promptManager.importPrompts(payload)
    toast.success(t('settings.intelligence.promptImportSuccess', { count: imported }))
  } catch (error) {
    console.error('[PromptManager] Failed to import prompts', error)
    toast.error(t('settings.intelligence.promptImportFailed'))
  } finally {
    input.value = ''
  }
}

function handleExportPrompts(): void {
  const data = promptManager.exportCustomPrompts()
  if (data.length === 0) {
    toast.error(t('settings.intelligence.promptExportEmpty'))
    return
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tuff-prompts.json'
  link.click()
  URL.revokeObjectURL(url)
  toast.success(t('settings.intelligence.promptExportSuccess', { count: data.length }))
}

function formatTimestamp(value?: number): string {
  if (!value) return t('settings.intelligence.promptTimestampUnknown')
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value)
}

onBeforeUnmount(() => {
  flushPendingPromptChanges()
})
</script>

<style lang="scss" scoped>
@import './intelligence-shared.scss';

.prompt-shell {
  min-height: 0;
}

.prompt-sidebar__summary {
  padding: 1rem;
  border-radius: 1rem;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
}

.prompt-sidebar__eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
}

.prompt-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.prompt-filter {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  &.is-active {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: rgba(var(--el-color-primary-rgb), 0.08);
  }
}

.prompt-list__hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
}

.prompt-main-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
}

.prompt-main-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 1rem;
}

.prompt-main-eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
}

.prompt-main-desc {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
}

.prompt-main-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  .aisdk-btn {
    gap: 0.35rem;
  }
}

.prompt-details {
  background: var(--el-bg-color);
}

.prompt-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.prompt-detail__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.prompt-detail__title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.prompt-detail__desc {
  font-size: 0.95rem;
  color: var(--el-text-color-secondary);
}

.prompt-detail__meta {
  text-align: right;
}

.prompt-readonly-hint {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0.75rem;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  margin-bottom: 1.5rem;
}

.prompt-form {
  display: grid;
  gap: 0.5rem;
}

.prompt-markdown {
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  overflow: hidden;
  min-height: 260px;

  :deep(.FlatMarkdown-Container) {
    border: none;
    height: 100%;

    .el-scrollbar {
      height: 260px;
    }
  }
}

.prompt-input,
.prompt-textarea {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  padding: 0.6rem 0.8rem;
  background: var(--el-bg-color);
  font: inherit;
  color: var(--el-text-color-primary);
  resize: none;

  &:disabled {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-placeholder);
  }
}

.prompt-textarea--large {
  min-height: 220px;
  resize: vertical;
}

.prompt-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;

  .aisdk-btn {
    gap: 0.35rem;
  }
}

.prompt-actions__status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

.prompt-empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--el-text-color-secondary);
  text-align: center;

  &__title {
    font-size: 1rem;
    font-weight: 600;
  }

  &__desc {
    font-size: 0.9rem;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
