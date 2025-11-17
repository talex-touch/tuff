<template>
  <div class="prompt-page h-full flex flex-col" role="main" aria-label="Intelligence Prompt Manager">
    <header class="aisdk-hero">
      <div>
        <p class="aisdk-hero__eyebrow">{{ t('flatNavBar.aisdk') }}</p>
        <h1>{{ t('settings.aisdk.promptPageTitle') }}</h1>
        <p class="aisdk-hero__desc">{{ t('settings.aisdk.promptPageDesc') }}</p>
      </div>
      <div class="aisdk-hero__actions">
        <button class="aisdk-btn ghost" type="button" @click="handleOpenDocs">
          <i class="i-carbon-link" aria-hidden="true" />
          <span>{{ t('settings.aisdk.docsButton') }}</span>
        </button>
        <button class="aisdk-btn ghost" type="button" @click="handleOpenFolder">
          <i class="i-carbon-folder-open" aria-hidden="true" />
          <span>{{ t('settings.aisdk.landing.prompts.folderButton') }}</span>
        </button>
        <button class="aisdk-btn ghost" type="button" @click="triggerImport">
          <i class="i-carbon-download" aria-hidden="true" />
          <span>{{ t('settings.aisdk.promptImportButton') }}</span>
        </button>
        <button class="aisdk-btn ghost" type="button" @click="handleExportPrompts">
          <i class="i-carbon-upload" aria-hidden="true" />
          <span>{{ t('settings.aisdk.promptExportButton') }}</span>
        </button>
      </div>
    </header>

    <div
      class="prompt-layout flex-1 overflow-hidden border border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)]"
    >
      <aside
        class="prompt-sidebar flex h-full w-80 flex-shrink-0 flex-col gap-4 border-r border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color)] p-4"
        aria-label="Prompt list sidebar"
      >
        <div>
          <p class="text-xs uppercase tracking-wide text-[var(--el-text-color-secondary)]">
            {{ t('settings.aisdk.promptStatsLabel', promptStats) }}
          </p>
          <button class="aisdk-btn primary mt-3 w-full" type="button" @click="handleCreatePrompt">
            <i class="i-carbon-add" aria-hidden="true" />
            <span>{{ t('settings.aisdk.landing.prompts.newPromptButton') }}</span>
          </button>
        </div>

        <div class="prompt-field">
          <label class="prompt-label" for="prompt-search">
            {{ t('settings.aisdk.promptSearchLabel') }}
          </label>
          <div class="prompt-search">
            <i class="i-carbon-search" aria-hidden="true" />
            <input
              id="prompt-search"
              v-model="searchQuery"
              class="prompt-search__input"
              type="search"
              :placeholder="t('settings.aisdk.promptSearchPlaceholder')"
              autocomplete="off"
            />
            <button
              v-if="searchQuery"
              class="prompt-search__clear"
              type="button"
              @click="searchQuery = ''"
              :aria-label="t('common.close')"
            >
              <i class="i-carbon-close" aria-hidden="true" />
            </button>
          </div>
        </div>

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
          {{ t('settings.aisdk.landing.prompts.statsDesc', { words: totalWordsApprox }) }}
        </p>

        <ul class="prompt-list" role="listbox">
          <li v-for="prompt in visiblePrompts" :key="prompt.id">
            <button
              class="prompt-item"
              type="button"
              :class="{ 'is-active': prompt.id === selectedPromptId }"
              role="option"
              @click="handleSelectPrompt(prompt.id)"
            >
              <div class="prompt-item__content">
                <p class="prompt-item__title">{{ prompt.name }}</p>
                <p class="prompt-item__desc">
                  {{ prompt.description || t('settings.aisdk.promptMetaDescription') }}
                </p>
              </div>
              <span
                class="prompt-item__badge"
                :class="prompt.builtin ? 'is-builtin' : 'is-custom'"
              >
                {{ prompt.builtin ? t('settings.aisdk.builtin') : t('settings.aisdk.custom') }}
              </span>
            </button>
          </li>
        </ul>
        <p
          v-if="!visiblePrompts.length"
          class="rounded-lg border border-dashed border-[var(--el-border-color-lighter)] p-4 text-center text-sm text-[var(--el-text-color-secondary)]"
        >
          {{ t('settings.aisdk.promptListEmpty') }}
        </p>
      </aside>

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
                  {{ selectedPrompt.builtin ? t('settings.aisdk.builtin') : t('settings.aisdk.custom') }}
                </p>
                <h2 class="prompt-detail__title">{{ promptDraft.name }}</h2>
                <p class="prompt-detail__desc">
                  {{ promptDraft.description || t('settings.aisdk.promptMetaDescription') }}
                </p>
              </div>
              <div class="prompt-detail__meta text-sm text-[var(--el-text-color-secondary)]">
                <p>
                  {{ t('settings.aisdk.promptMetaUpdated') }}:
                  {{ formatTimestamp(selectedPrompt.updatedAt) }}
                </p>
                <p>
                  {{ t('settings.aisdk.promptMetaCreated') }}:
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
              <span>{{ t('settings.aisdk.promptReadonlyHint') }}</span>
            </div>

            <div class="prompt-form">
              <label class="prompt-label" for="prompt-name">
                {{ t('settings.aisdk.promptNameLabel') }}
              </label>
              <input
                id="prompt-name"
                v-model="promptDraft.name"
                class="prompt-input"
                type="text"
                :placeholder="t('settings.aisdk.promptNamePlaceholder')"
                :disabled="isBuiltinSelected"
              />

              <label class="prompt-label" for="prompt-category">
                {{ t('settings.aisdk.promptMetaCategory') }}
              </label>
              <input
                id="prompt-category"
                v-model="promptDraft.category"
                class="prompt-input"
                type="text"
                :placeholder="t('settings.aisdk.promptCategoryPlaceholder')"
                :disabled="isBuiltinSelected"
              />

              <label class="prompt-label" for="prompt-description">
                {{ t('settings.aisdk.promptDescriptionLabel') }}
              </label>
              <textarea
                id="prompt-description"
                v-model="promptDraft.description"
                class="prompt-textarea"
                rows="2"
                :placeholder="t('settings.aisdk.promptDescriptionPlaceholder')"
                :disabled="isBuiltinSelected"
              />

              <label class="prompt-label" for="prompt-content">
                {{ t('settings.aisdk.promptContentLabel') }}
              </label>
              <textarea
                id="prompt-content"
                v-model="promptDraft.content"
                class="prompt-textarea prompt-textarea--large"
                :placeholder="t('settings.aisdk.promptContentPlaceholder')"
                :disabled="isBuiltinSelected"
              />
            </div>

            <div class="prompt-actions">
              <div class="prompt-actions__primary">
                <button class="aisdk-btn ghost" type="button" @click="handleDuplicatePrompt">
                  <i class="i-carbon-copy" aria-hidden="true" />
                  <span>{{ t('settings.aisdk.promptDuplicateButton') }}</span>
                </button>
                <button class="aisdk-btn ghost" type="button" @click="handleCopyContent">
                  <i class="i-carbon-document" aria-hidden="true" />
                  <span>{{ t('settings.aisdk.promptCopyButton') }}</span>
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
                  <span>{{ t('settings.aisdk.promptDeleteButton') }}</span>
                </button>
                <button
                  class="aisdk-btn primary"
                  type="button"
                  :disabled="!isCustomEditable || !isDirty"
                  @click="handleSavePrompt"
                >
                  <i class="i-carbon-checkmark" aria-hidden="true" />
                  <span>{{ t('settings.aisdk.promptSaveButton') }}</span>
                </button>
              </div>
            </div>
          </div>
          <div v-else class="prompt-empty-state" role="status">
            <i class="i-carbon-idea text-4xl text-[var(--el-border-color)]" aria-hidden="true" />
            <p class="prompt-empty-state__title">
              {{ t('settings.aisdk.promptEmptyStateTitle') }}
            </p>
            <p class="prompt-empty-state__desc">
              {{ t('settings.aisdk.promptEmptyStateDesc') }}
            </p>
            <button class="aisdk-btn primary" type="button" @click="handleCreatePrompt">
              <i class="i-carbon-add" aria-hidden="true" />
              <span>{{ t('settings.aisdk.landing.prompts.newPromptButton') }}</span>
            </button>
          </div>
        </Transition>
      </section>
    </div>

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
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { touchChannel } from '~/modules/channel/channel-core'
import { getPromptManager, type PromptTemplate } from '~/modules/hooks/usePromptManager'

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

const filterOptions = computed(() => [
  { value: 'all', label: t('settings.aisdk.promptFilterAll') },
  { value: 'builtin', label: t('settings.aisdk.builtin') },
  { value: 'custom', label: t('settings.aisdk.custom') }
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
    if (!prompt) {
      promptDraft.name = ''
      promptDraft.category = ''
      promptDraft.description = ''
      promptDraft.content = ''
      return
    }
    promptDraft.name = prompt.name
    promptDraft.category = prompt.category ?? ''
    promptDraft.description = prompt.description ?? ''
    promptDraft.content = prompt.content
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

function handleSelectPrompt(id: string): void {
  selectedPromptId.value = id
}

function handleOpenDocs(): void {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}

async function handleOpenFolder(): Promise<void> {
  try {
    await touchChannel.send('app:open-prompts-folder')
    toast.success(t('settings.aisdk.landing.prompts.folderOpenSuccess'))
  } catch (error) {
    console.error('[PromptManager] Failed to open folder', error)
    toast.error(t('settings.aisdk.landing.prompts.folderOpenFailed'))
  }
}

function handleCreatePrompt(): void {
  const name = t('settings.aisdk.promptNewDefaultName', { index: promptStats.value.custom + 1 })
  const newId = promptManager.addCustomPrompt({
    name,
    category: 'custom',
    description: t('settings.aisdk.promptDescriptionPlaceholder'),
    content: ''
  })
  filterMode.value = 'custom'
  searchQuery.value = ''
  selectedPromptId.value = newId
  toast.success(t('settings.aisdk.promptCreateSuccess'))
}

function handleDuplicatePrompt(): void {
  if (!selectedPrompt.value) return
  const suffix = t('settings.aisdk.promptDuplicateSuffix')
  const name = `${selectedPrompt.value.name} ${suffix}`.trim()
  const newId = promptManager.addCustomPrompt({
    name,
    category: selectedPrompt.value.category ?? '',
    description: selectedPrompt.value.description ?? '',
    content: selectedPrompt.value.content
  })
  filterMode.value = 'custom'
  selectedPromptId.value = newId
  toast.success(t('settings.aisdk.promptDuplicateSuccess'))
}

function handleSavePrompt(): void {
  if (!selectedPrompt.value || !isCustomEditable.value) return
  const ok = promptManager.updateCustomPrompt(selectedPrompt.value.id, {
    name: promptDraft.name,
    category: promptDraft.category,
    description: promptDraft.description,
    content: promptDraft.content
  })
  if (ok) {
    toast.success(t('settings.aisdk.promptSaveSuccess'))
  } else {
    toast.error(t('settings.aisdk.promptSaveFailed'))
  }
}

function handleDeletePrompt(): void {
  if (!selectedPrompt.value || !isCustomEditable.value) return
  if (!window.confirm(t('settings.aisdk.promptDeleteConfirm'))) return
  const deletedId = selectedPrompt.value.id
  const deleted = promptManager.deleteCustomPrompt(deletedId)
  if (!deleted) {
    toast.error(t('settings.aisdk.promptDeleteFailed'))
    return
  }
  toast.success(t('settings.aisdk.promptDeleteSuccess'))
  const next = visiblePrompts.value.find((prompt) => prompt.id !== deletedId)
  selectedPromptId.value = next?.id ?? orderedPrompts.value[0]?.id ?? null
}

async function handleCopyContent(): Promise<void> {
  if (!selectedPrompt.value) return
  try {
    await navigator.clipboard.writeText(selectedPrompt.value.content)
    toast.success(t('settings.aisdk.promptCopySuccess'))
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
    toast.success(t('settings.aisdk.promptImportSuccess', { count: imported }))
  } catch (error) {
    console.error('[PromptManager] Failed to import prompts', error)
    toast.error(t('settings.aisdk.promptImportFailed'))
  } finally {
    input.value = ''
  }
}

function handleExportPrompts(): void {
  const data = promptManager.exportCustomPrompts()
  if (data.length === 0) {
    toast.error(t('settings.aisdk.promptExportEmpty'))
    return
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tuff-prompts.json'
  link.click()
  URL.revokeObjectURL(url)
  toast.success(t('settings.aisdk.promptExportSuccess', { count: data.length }))
}

function formatTimestamp(value?: number): string {
  if (!value) return t('settings.aisdk.promptTimestampUnknown')
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value)
}
</script>

<style lang="scss" scoped>
@import './intelligence-shared.scss';

.prompt-sidebar {
  .prompt-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .prompt-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
}

.prompt-search {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  padding: 0 0.75rem;
  background: var(--el-fill-color-light);

  i {
    color: var(--el-text-color-placeholder);
  }

  &__input {
    flex: 1;
    border: none;
    background: transparent;
    padding: 0.5rem;
    font-size: 0.9rem;
    color: var(--el-text-color-primary);
    outline: none;
  }

  &__clear {
    border: none;
    background: transparent;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    padding: 0.25rem;
  }
}

.prompt-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.prompt-filter {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  padding: 0.35rem 0.25rem;
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

.prompt-list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;

  li + li {
    margin-top: 0.5rem;
  }
}

.prompt-item {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  padding: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  background: var(--el-bg-color);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease;

  &.is-active {
    border-color: var(--el-color-primary);
    background: rgba(var(--el-color-primary-rgb), 0.06);
  }

  &__title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__desc {
    font-size: 0.8rem;
    color: var(--el-text-color-secondary);
  }

  &__badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;

    &.is-builtin {
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
    }

    &.is-custom {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
  }
}

.prompt-details {
  background: var(--el-bg-color);
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
