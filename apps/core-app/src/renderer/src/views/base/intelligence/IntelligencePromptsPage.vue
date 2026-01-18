<script lang="ts" name="IntelligencePromptsPage" setup>
import type { AISDKCapabilityConfig } from '@talex-touch/utils/types/intelligence'
import type { CapabilityTestResult as UiCapabilityTestResult } from '~/components/intelligence/capabilities/types'
import type { PromptTemplate } from '~/modules/intelligence/prompt-types'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import CapabilityTestInput from '~/components/intelligence/capabilities/CapabilityTestInput.vue'
import CapabilityTestResult from '~/components/intelligence/capabilities/CapabilityTestResult.vue'
import TuffAsideList from '~/components/tuff/template/TuffAsideList.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { getPromptManager } from '~/modules/hooks/usePromptManager'

type FilterMode = 'all' | 'builtin' | 'custom'

const { t } = useI18n()
const promptManager = getPromptManager()
const transport = useTuffTransport()
const openPromptsFolderEvent = defineRawEvent<void, void>('app:open-prompts-folder')
const aiClient = createIntelligenceClient(transport)

const { providers, capabilities } = useIntelligenceManager()

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
let autoSaveTimer: number | null = null

const testCapabilityId = ref<string>('text.chat')
const promptTestResult = ref<UiCapabilityTestResult | null>(null)
const promptTesting = ref(false)

const capabilityList = computed<AISDKCapabilityConfig[]>(() =>
  Object.values(capabilities.value || {}).sort((a, b) => a.id.localeCompare(b.id))
)

watch(
  capabilityList,
  (list) => {
    if (!list.length) return
    if (!list.some((cap) => cap.id === testCapabilityId.value)) {
      testCapabilityId.value = list[0].id
    }
  },
  { immediate: true }
)

const providerMap = computed(
  () => new Map(providers.value.map((provider) => [provider.id, provider]))
)

const testEnabledBindings = computed(() => {
  const capability = (capabilities.value || {})[testCapabilityId.value]
  if (!capability?.providers) return []
  return capability.providers
    .filter((binding) => binding.enabled !== false)
    .map((binding) => ({
      ...binding,
      provider: providerMap.value.get(binding.providerId)
    }))
})

async function handlePromptTest(options: {
  providerId: string
  model?: string
  promptVariables?: Record<string, any>
  userInput?: string
  promptTemplate?: string
}): Promise<void> {
  if (promptTesting.value) return
  promptTesting.value = true
  promptTestResult.value = null

  try {
    const response = await aiClient.testCapability({
      capabilityId: testCapabilityId.value,
      providerId: options.providerId,
      userInput: options.userInput,
      model: options.model,
      promptTemplate: promptDraft.content,
      promptVariables: options.promptVariables
    })

    promptTestResult.value = {
      ...(response as any),
      timestamp: Date.now()
    }
  } catch (error) {
    promptTestResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '能力测试失败',
      timestamp: Date.now()
    }
  } finally {
    promptTesting.value = false
  }
}

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
    badgeLabel: prompt.builtin
      ? t('settings.intelligence.builtin')
      : t('settings.intelligence.custom'),
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
    const words = prompt.content.trim().split(/\s+/).filter(Boolean).length
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
    await transport.send(openPromptsFolderEvent)
    toast.success(t('settings.intelligence.landing.prompts.folderOpenSuccess'))
  } catch (error) {
    console.error('[PromptManager] Failed to open folder', error)
    toast.error(t('settings.intelligence.landing.prompts.folderOpenFailed'))
  }
}

function handleCreatePrompt(): void {
  flushPendingPromptChanges()
  const name = t('settings.intelligence.promptNewDefaultName', {
    index: promptStats.value.custom + 1
  })
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

// function formatTimestamp(value?: number): string {
//   if (!value)
//     return t('settings.intelligence.promptTimestampUnknown')
//   return new Intl.DateTimeFormat(undefined, {
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit',
//     hour: '2-digit',
//     minute: '2-digit',
//   }).format(value)
// }

onBeforeUnmount(() => {
  flushPendingPromptChanges()
})
</script>

<template>
  <div
    class="prompt-page h-full flex flex-col"
    role="main"
    aria-label="Intelligence Prompt Manager"
  >
    <TuffAsideTemplate
      v-model="searchQuery"
      class="prompt-shell flex-1"
      search-id="prompt-search"
      :search-placeholder="t('settings.intelligence.promptSearchPlaceholder')"
      :clear-label="t('common.close')"
    >
      <template #default>
        <div>
          <div class="prompt-filters" role="tablist">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              class="prompt-filter"
              type="button"
              role="tab"
              :class="{ 'is-active': filterMode === option.value }"
              @click="filterMode = option.value as FilterMode"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <TuffAsideList
          v-model:selected-id="selectedPromptId"
          :items="promptListItems"
          :empty-text="t('settings.intelligence.promptListEmpty')"
          @select="(id) => handleSelectPrompt(id as string)"
        />
      </template>

      <template #footer>
        <div>
          <p class="prompt-footer-stats">
            {{ t('settings.intelligence.promptStatsLabel', promptStats) }}
          </p>
          <p v-if="false" class="prompt-footer-hint">
            {{ t('settings.intelligence.landing.prompts.statsDesc', { words: totalWordsApprox }) }}
          </p>
          <FlatButton class="primary mt-2" type="button" @click="handleCreatePrompt">
            <i class="i-carbon-add" aria-hidden="true" />
            <span>{{ t('settings.intelligence.landing.prompts.newPromptButton') }}</span>
          </FlatButton>
        </div>
      </template>

      <template #main>
        <TouchScroll v-if="selectedPrompt" :key="selectedPrompt.id" class="h-full">
          <template #header>
            <div class="prompt-main-header">
              <div>
                <p class="prompt-main-eyebrow">
                  {{ t('flatNavBar.intelligence') }}
                </p>
                <h1>{{ t('settings.intelligence.promptPageTitle') }}</h1>
                <p class="prompt-main-desc">
                  {{ t('settings.intelligence.promptPageDesc') }}
                </p>
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
            </div>
          </template>

          <div v-if="selectedPrompt.builtin" class="prompt-readonly-hint mx-4 mb-4" role="status">
            <i class="i-carbon-information" aria-hidden="true" />
            <span>{{ t('settings.intelligence.promptReadonlyHint') }}</span>
          </div>

          <TuffGroupBlock
            :name="t('settings.intelligence.promptMetaTitle')"
            :description="t('settings.intelligence.promptMetaDesc')"
            default-icon="i-carbon-information"
            active-icon="i-carbon-information"
            memory-name="prompt-meta-info"
            :default-expand="true"
          >
            <TuffBlockSlot
              :title="t('settings.intelligence.promptNameLabel')"
              :description="promptDraft.name || t('settings.intelligence.promptNamePlaceholder')"
              default-icon="i-carbon-text-font"
              active-icon="i-carbon-text-font"
            >
              <input
                v-model="promptDraft.name"
                class="prompt-inline-input"
                type="text"
                :placeholder="t('settings.intelligence.promptNamePlaceholder')"
                :disabled="isBuiltinSelected"
              />
            </TuffBlockSlot>

            <TuffBlockSlot
              :title="t('settings.intelligence.promptMetaCategory')"
              :description="
                promptDraft.category || t('settings.intelligence.promptCategoryPlaceholder')
              "
              default-icon="i-carbon-tag"
              active-icon="i-carbon-tag"
            >
              <input
                v-model="promptDraft.category"
                class="prompt-inline-input"
                type="text"
                :placeholder="t('settings.intelligence.promptCategoryPlaceholder')"
                :disabled="isBuiltinSelected"
              />
            </TuffBlockSlot>

            <TuffBlockSlot
              :title="t('settings.intelligence.promptDescriptionLabel')"
              :description="
                promptDraft.description || t('settings.intelligence.promptDescriptionPlaceholder')
              "
              default-icon="i-carbon-document"
              active-icon="i-carbon-document"
            >
              <textarea
                v-model="promptDraft.description"
                class="prompt-inline-textarea"
                rows="2"
                :placeholder="t('settings.intelligence.promptDescriptionPlaceholder')"
                :disabled="isBuiltinSelected"
              />
            </TuffBlockSlot>
          </TuffGroupBlock>

          <TuffGroupBlock
            :name="t('settings.intelligence.promptContentLabel')"
            :description="t('settings.intelligence.promptContentDesc')"
            default-icon="i-carbon-code"
            active-icon="i-carbon-code"
            memory-name="prompt-content"
            :default-expand="true"
          >
            <div class="prompt-markdown-wrapper">
              <FlatMarkdown v-model="promptDraft.content" :readonly="isBuiltinSelected" />
            </div>
          </TuffGroupBlock>

          <TuffGroupBlock
            :name="t('settings.intelligence.capabilityTestTitle')"
            :description="t('settings.intelligence.capabilityTestDesc')"
            default-icon="i-carbon-flash"
            active-icon="i-carbon-flash"
            memory-name="prompt-test"
            :default-expand="false"
          >
            <div class="prompt-test__body">
              <TuffBlockSlot
                :title="t('settings.intelligence.capabilitySelectTitle')"
                :description="testCapabilityId"
                default-icon="i-carbon-function-math"
                active-icon="i-carbon-function-math"
              >
                <select v-model="testCapabilityId" class="prompt-inline-input">
                  <option v-for="cap in capabilityList" :key="cap.id" :value="cap.id">
                    {{ cap.id }}
                  </option>
                </select>
              </TuffBlockSlot>

              <CapabilityTestInput
                :capability-id="testCapabilityId"
                :is-testing="promptTesting"
                :disabled="testEnabledBindings.length === 0"
                :enabled-bindings="testEnabledBindings"
                :prompt-template="promptDraft.content"
                :show-prompt-selector="false"
                @test="handlePromptTest"
              />

              <CapabilityTestResult v-if="promptTestResult" :result="promptTestResult" />
            </div>
          </TuffGroupBlock>

          <TuffGroupBlock
            :name="t('settings.intelligence.promptActionsTitle')"
            :description="t('settings.intelligence.promptActionsDesc')"
            default-icon="i-carbon-settings"
            active-icon="i-carbon-settings"
            memory-name="prompt-actions"
            :default-expand="true"
          >
            <TuffBlockSlot
              :title="t('settings.intelligence.promptDuplicateButton')"
              :description="t('settings.intelligence.promptDuplicateDesc')"
              default-icon="i-carbon-copy"
              active-icon="i-carbon-copy"
              @click="handleDuplicatePrompt"
            >
              <button class="aisdk-btn ghost" type="button" @click="handleDuplicatePrompt">
                <i class="i-carbon-copy" aria-hidden="true" />
                <span>{{ t('settings.intelligence.promptDuplicateButton') }}</span>
              </button>
            </TuffBlockSlot>

            <TuffBlockSlot
              :title="t('settings.intelligence.promptCopyButton')"
              :description="t('settings.intelligence.promptCopyDesc')"
              default-icon="i-carbon-document"
              active-icon="i-carbon-document"
              @click="handleCopyContent"
            >
              <button class="aisdk-btn ghost" type="button" @click="handleCopyContent">
                <i class="i-carbon-document" aria-hidden="true" />
                <span>{{ t('settings.intelligence.promptCopyButton') }}</span>
              </button>
            </TuffBlockSlot>

            <TuffBlockSlot
              :title="t('settings.intelligence.promptDeleteButton')"
              :description="t('settings.intelligence.promptDeleteDesc')"
              default-icon="i-carbon-trash-can"
              active-icon="i-carbon-trash-can"
              :disabled="!isCustomEditable"
              @click="handleDeletePrompt"
            >
              <button
                class="aisdk-btn danger"
                type="button"
                :disabled="!isCustomEditable"
                @click="handleDeletePrompt"
              >
                <i class="i-carbon-trash-can" aria-hidden="true" />
                <span>{{ t('settings.intelligence.promptDeleteButton') }}</span>
              </button>
            </TuffBlockSlot>

            <TuffBlockSlot
              :title="t('settings.intelligence.promptSaveButton')"
              :description="autoSaveStatusText"
              default-icon="i-carbon-checkmark"
              active-icon="i-carbon-checkmark"
              :disabled="!isCustomEditable || !isDirty"
              @click="handleSavePrompt"
            >
              <div class="flex items-center gap-2">
                <div
                  v-if="isCustomEditable"
                  class="prompt-actions__status"
                  :data-status="autoSaveStatus"
                >
                  <i
                    v-if="autoSaveStatus === 'pending' || autoSaveStatus === 'saving'"
                    class="i-carbon-renew animate-spin text-[var(--el-text-color-secondary)]"
                  />
                  <i
                    v-else-if="autoSaveStatus === 'saved'"
                    class="i-carbon-checkmark text-[var(--el-color-success)]"
                  />
                </div>
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
            </TuffBlockSlot>
          </TuffGroupBlock>
        </TouchScroll>

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
      </template>
    </TuffAsideTemplate>

    <input
      ref="importInputRef"
      class="sr-only"
      type="file"
      accept="application/json"
      @change="handleImport"
    />
  </div>
</template>

<style lang="scss" scoped>
.prompt-shell {
  min-height: 0;
}

.prompt-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.prompt-filter {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  padding: 0.125rem 0.4rem;
  font-size: 0.65rem;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;

  &.is-active {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: rgba(var(--el-color-primary-rgb), 0.08);
  }
}

.prompt-footer-stats {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
}

.prompt-footer-hint {
  font-size: 0.7rem;
  color: var(--el-text-color-secondary);
  opacity: 0.7;
}

.prompt-main-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 1.5rem;
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

.prompt-test__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
}

.prompt-inline-input,
.prompt-inline-textarea {
  width: 200px;
  max-width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--el-bg-color);
  font-size: 0.85rem;
  color: var(--el-text-color-primary);
  resize: none;

  &:disabled {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-placeholder);
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
    border-color: var(--el-color-primary);
  }
}

.prompt-inline-textarea {
  min-height: 60px;
}

.prompt-markdown-wrapper {
  padding: 0;
  margin: 0;

  :deep(.FlatMarkdown-Container) {
    border: none;
    border-radius: 0;
    min-height: 300px;
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
  padding: 2rem;

  &__title {
    font-size: 1rem;
    font-weight: 600;
  }

  &__desc {
    font-size: 0.9rem;
  }
}

.prompt-list-empty {
  padding: 2rem 1rem;
  text-align: center;
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
