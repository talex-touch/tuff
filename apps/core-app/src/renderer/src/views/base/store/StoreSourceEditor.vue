<script setup lang="ts">
import type {
  StoreProviderDefinition,
  StoreProviderResultMeta,
  StoreProviderType
} from '@talex-touch/utils/store'
import {
  DEFAULT_GITHUB_STORE_URL,
  DEFAULT_NPM_REGISTRY_URL,
  DEFAULT_STORE_DISCOVERY_KEYWORDS,
  DEFAULT_STORE_PROVIDERS
} from '@talex-touch/utils/store'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { TuffSwitch } from '@talex-touch/tuffex/switch'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vDraggable } from 'vue-draggable-plus'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import { storeSourcesStorage } from '~/modules/storage/store-sources'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    source?: HTMLElement | null
    advancedMode?: boolean
    providerDetails?: StoreProviderResultMeta[]
  }>(),
  {
    source: null,
    advancedMode: false,
    providerDetails: () => []
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const DEFAULT_PROVIDER_TYPE: StoreProviderType = 'tpexApi'
const BUILTIN_COMMUNITY_IDS = new Set(['github-releases', 'npm-scope'])

const { t } = useI18n()

const storageState = storeSourcesStorage.get()
const sources = computed<StoreProviderDefinition[]>(() =>
  Array.isArray(storageState.sources) ? storageState.sources : []
)

const showFormDialog = ref(false)
const formDialogSource = ref<HTMLElement | null>(null)
const editingSourceId = ref<string | null>(null)
const formError = ref('')

const isAdvancedMode = computed(() => props.advancedMode === true)
const sortableSources = computed(() => sources.value.filter((item) => !item.outdated))
const outdatedSources = computed(() => sources.value.filter((item) => item.outdated))
const visibleOutdatedSources = computed(() => (isAdvancedMode.value ? outdatedSources.value : []))
const hiddenOutdatedCount = computed(() =>
  isAdvancedMode.value ? 0 : outdatedSources.value.length
)

const visibleSourceCount = computed(
  () => sortableSources.value.length + visibleOutdatedSources.value.length
)
const enabledSourceCount = computed(
  () =>
    sortableSources.value.filter((item) => item.enabled !== false).length +
    visibleOutdatedSources.value.filter((item) => item.enabled !== false).length
)

const missingDefaultCount = computed(() => {
  const existingIds = new Set(sources.value.map((item) => item.id))
  return DEFAULT_STORE_PROVIDERS.filter((item) => !existingIds.has(item.id)).length
})

const providerMetaById = computed(() => {
  const map = new Map<string, StoreProviderResultMeta>()
  for (const detail of props.providerDetails ?? []) {
    map.set(detail.providerId, detail)
  }
  return map
})

const sortableList = ref<StoreProviderDefinition[]>([])

watch(
  sortableSources,
  (nextList) => {
    sortableList.value = [...nextList]
  },
  { immediate: true }
)

const draggableOptions = computed(() => ({
  animation: 150,
  handle: '.handle',
  ghostClass: 'ghost',
  onEnd: () => {
    commitSortableOrder(sortableList.value)
  }
}))

const providerTypeOptions = computed<{ label: string; value: StoreProviderType }[]>(() => [
  { label: t('store.sourceEditor.providerTypes.tpexApi'), value: 'tpexApi' },
  { label: t('store.sourceEditor.providerTypes.repository'), value: 'repository' },
  { label: t('store.sourceEditor.providerTypes.npmPackage'), value: 'npmPackage' },
  { label: t('store.sourceEditor.providerTypes.nexusStore'), value: 'nexusStore' }
])

interface SourcePreset {
  id: string
  labelKey: string
  icon: string
  name: string
  type: StoreProviderType
  url: string
  keyword?: string
}

const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'github-topics',
    labelKey: 'store.sourceEditor.presets.githubTopics',
    icon: 'i-carbon-logo-github',
    name: 'GitHub',
    type: 'repository',
    url: DEFAULT_GITHUB_STORE_URL,
    keyword: DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
  },
  {
    id: 'github-repo',
    labelKey: 'store.sourceEditor.presets.githubRepo',
    icon: 'i-carbon-code',
    name: 'GitHub Repo',
    type: 'repository',
    url: 'https://github.com/owner/repo'
  },
  {
    id: 'npm-official',
    labelKey: 'store.sourceEditor.presets.npmOfficial',
    icon: 'i-carbon-package',
    name: 'NPM Registry',
    type: 'npmPackage',
    url: DEFAULT_NPM_REGISTRY_URL,
    keyword: DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
  },
  {
    id: 'npm-mirror',
    labelKey: 'store.sourceEditor.presets.npmMirror',
    icon: 'i-carbon-cube',
    name: 'NPM Mirror',
    type: 'npmPackage',
    url: 'https://registry.npmmirror.com',
    keyword: DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
  },
  {
    id: 'tpex-api',
    labelKey: 'store.sourceEditor.presets.tpexApi',
    icon: 'i-carbon-cloud-app',
    name: 'Custom Nexus',
    type: 'tpexApi',
    url: ''
  }
]

const formState = reactive<{
  name: string
  url: string
  type: StoreProviderType
  keyword: string
  scope: string
}>({
  name: '',
  url: '',
  type: DEFAULT_PROVIDER_TYPE,
  keyword: '',
  scope: ''
})

const isEditing = computed(() => editingSourceId.value !== null)
const formDialogTitle = computed(() =>
  isEditing.value ? t('store.sourceEditor.editDialogTitle') : t('store.sourceEditor.addDialogTitle')
)

const activeUrlPlaceholder = computed(() => {
  switch (formState.type) {
    case 'tpexApi':
      return t('store.sourceEditor.urlPlaceholders.tpexApi')
    case 'nexusStore':
      return t('store.sourceEditor.urlPlaceholders.nexusStore')
    case 'repository':
      return t('store.sourceEditor.urlPlaceholders.repository')
    case 'npmPackage':
      return t('store.sourceEditor.urlPlaceholders.npmPackage')
    default:
      return t('store.sourceEditor.urlPlaceholder')
  }
})

const activeUrlHint = computed(() => {
  switch (formState.type) {
    case 'tpexApi':
      return t('store.sourceEditor.urlHints.tpexApi')
    case 'nexusStore':
      return t('store.sourceEditor.urlHints.nexusStore')
    case 'repository':
      return t('store.sourceEditor.urlHints.repository')
    case 'npmPackage':
      return t('store.sourceEditor.urlHints.npmPackage')
    default:
      return ''
  }
})

const showKeywordField = computed(
  () => formState.type === 'npmPackage' || formState.type === 'repository'
)

/** A source's adapter as the type picker names it; a type without a name here stays as stored. */
function providerTypeLabel(type: StoreProviderType): string {
  return providerTypeOptions.value.find((option) => option.value === type)?.label ?? type
}

function isGitHubSource(item: StoreProviderDefinition): boolean {
  if (item.type !== 'repository') return false
  if (item.config?.platform === 'github') return true
  const url = resolveSourceUrl(item)
  return /github\.com/i.test(url) || /^[\w.-]+\/[\w.-]+$/.test(url)
}

function resolveSourceIcon(item: StoreProviderDefinition): string {
  if (item.type === 'tpexApi') return 'i-carbon-cloud-app'
  if (item.type === 'npmPackage') return 'i-carbon-package'
  if (item.type === 'repository') {
    return isGitHubSource(item) ? 'i-carbon-logo-github' : 'i-carbon-code'
  }
  return 'i-carbon-store'
}

function resolveSourceIconTone(item: StoreProviderDefinition): string {
  if (item.isOfficial || item.trustLevel === 'official') return 'is-official'
  if (item.type === 'npmPackage') return 'is-npm'
  if (isGitHubSource(item)) return 'is-github'
  return 'is-default'
}

function resolveSourceUrl(item: StoreProviderDefinition): string {
  const candidates = [
    item.url,
    item.config?.registryUrl,
    item.config?.apiUrl,
    item.config?.manifestUrl,
    item.config?.apiBase
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}

function resolveSourceSubtitle(item: StoreProviderDefinition): string {
  const parts: string[] = []
  if (item.description && item.description.trim().length > 0) {
    parts.push(item.description.trim())
  }

  if (item.type === 'npmPackage') {
    const keyword =
      typeof item.config?.keyword === 'string' && item.config.keyword.trim()
        ? item.config.keyword.trim()
        : ''
    const scope =
      typeof item.config?.scope === 'string' && item.config.scope.trim()
        ? item.config.scope.trim()
        : ''
    if (keyword) parts.push(t('store.sourceEditor.keywordMeta', { keyword }))
    if (scope) parts.push(t('store.sourceEditor.scopeMeta', { scope }))
  } else if (item.type === 'repository') {
    const topic =
      typeof item.config?.topic === 'string' && item.config.topic.trim()
        ? item.config.topic.trim()
        : ''
    if (topic && item.config?.mode === 'search') {
      parts.push(t('store.sourceEditor.topicMeta', { topic }))
    }
  }

  return parts.join(' · ')
}

function isBuiltinCommunitySource(item: StoreProviderDefinition): boolean {
  return BUILTIN_COMMUNITY_IDS.has(item.id)
}

function isDeleteDisabled(item: StoreProviderDefinition): boolean {
  return sources.value.length <= 1 || item.readOnly === true
}

function generateSourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'source'}-${Date.now()}`
}

function normalizeOutdatedSourcesToBottom() {
  const list = storageState.sources
  if (!Array.isArray(list)) return
  const nonOutdated = list.filter((item) => !item.outdated)
  const outdated = list.filter((item) => item.outdated)
  const nextOrder = [...nonOutdated, ...outdated]
  const orderChanged = nextOrder.some((item, index) => item?.id !== list[index]?.id)
  if (!orderChanged) return
  list.splice(0, list.length, ...nextOrder)
}

function commitSortableOrder(orderedActive: StoreProviderDefinition[]) {
  const list = storageState.sources
  if (!Array.isArray(list)) return

  const outdated = list.filter((item) => item.outdated)
  const topPriority = Math.max(110, orderedActive.length * 10 + 10)
  orderedActive.forEach((item, index) => {
    item.priority = topPriority - index * 10
  })

  list.splice(0, list.length, ...orderedActive, ...outdated)
}

function getSourceIndexById(id: string): number {
  return sources.value.findIndex((item) => item.id === id)
}

function deleteSource(id: string) {
  const list = storageState.sources
  if (!Array.isArray(list) || list.length <= 1) return

  const targetIndex = getSourceIndexById(id)
  if (targetIndex < 0) return

  const target = list[targetIndex]
  if (!target || target.readOnly) return

  list.splice(targetIndex, 1)
}

function setSourceEnabled(id: string, enabled: boolean) {
  const targetIndex = getSourceIndexById(id)
  if (targetIndex < 0) return

  const target = storageState.sources[targetIndex]
  if (!target) return

  target.enabled = enabled
}

function handleRestoreDefaults() {
  if (typeof storeSourcesStorage.restoreDefaultSources === 'function') {
    storeSourcesStorage.restoreDefaultSources()
    return
  }

  const list = storageState.sources
  if (!Array.isArray(list)) return
  const existingIds = new Set(list.map((item) => item.id))
  for (const preset of DEFAULT_STORE_PROVIDERS) {
    if (!existingIds.has(preset.id)) {
      list.push(JSON.parse(JSON.stringify(preset)))
      existingIds.add(preset.id)
    }
  }
  normalizeOutdatedSourcesToBottom()
}

function resetFormState() {
  editingSourceId.value = null
  formState.name = ''
  formState.url = ''
  formState.type = DEFAULT_PROVIDER_TYPE
  formState.keyword = ''
  formState.scope = ''
  formError.value = ''
}

function applyPreset(preset: SourcePreset) {
  formState.type = preset.type
  formState.name = preset.name
  formState.url = preset.url
  formState.keyword = preset.keyword ?? ''
  formState.scope = ''
  formError.value = ''
}

function openCreateDialog(event?: MouseEvent) {
  resetFormState()
  formDialogSource.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  showFormDialog.value = true
}

function openEditDialog(item: StoreProviderDefinition, event?: MouseEvent) {
  if (item.readOnly) return
  editingSourceId.value = item.id
  formState.name = item.name
  formState.type = item.type
  formState.url = resolveSourceUrl(item)
  formState.keyword =
    item.type === 'npmPackage'
      ? typeof item.config?.keyword === 'string'
        ? item.config.keyword
        : ''
      : typeof item.config?.topic === 'string'
        ? item.config.topic
        : ''
  formState.scope = typeof item.config?.scope === 'string' ? item.config.scope : ''
  formError.value = ''
  formDialogSource.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  showFormDialog.value = true
}

function closeFormDialog(reset = true) {
  showFormDialog.value = false
  if (reset) {
    resetFormState()
  }
}

function isValidSourceUrl(type: StoreProviderType, url: string): boolean {
  if (type === 'repository' && /^[\w.-]+\/[\w.-]+$/.test(url)) {
    return true
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function buildSourceConfig(
  type: StoreProviderType,
  url: string,
  keyword: string,
  scope: string,
  previousConfig?: Record<string, unknown>
): Record<string, unknown> {
  const normalizedUrl = url.replace(/\/+$/, '')
  const trimmedKeyword = keyword.trim()
  const trimmedScope = scope.trim()

  if (type === 'nexusStore') {
    return {
      ...(previousConfig ?? {}),
      manifestUrl: normalizedUrl.includes('/api/store/plugins')
        ? normalizedUrl
        : `${normalizedUrl}/api/store/plugins`
    }
  }

  if (type === 'tpexApi') {
    return {
      ...(previousConfig ?? {}),
      apiUrl: normalizedUrl.endsWith('/api/store/plugins')
        ? normalizedUrl
        : `${normalizedUrl}/api/store/plugins`
    }
  }

  if (type === 'npmPackage') {
    const resolvedKeyword = trimmedKeyword || DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
    const nextConfig: Record<string, unknown> = {
      ...(previousConfig ?? {}),
      registryUrl: normalizedUrl,
      keyword: resolvedKeyword,
      keywords:
        resolvedKeyword === DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
          ? [...DEFAULT_STORE_DISCOVERY_KEYWORDS]
          : [resolvedKeyword]
    }
    if (trimmedScope) {
      nextConfig.scope = trimmedScope
    } else {
      delete nextConfig.scope
    }
    return nextConfig
  }

  // repository
  const isGitee = /gitee\.com/i.test(normalizedUrl)
  const topicMatch = normalizedUrl.match(/github\.com\/topics\/([^/?#]+)/i)
  const isGitHubRoot =
    /^https?:\/\/(www\.)?github\.com\/?$/i.test(normalizedUrl) ||
    /^https?:\/\/api\.github\.com\/?$/i.test(normalizedUrl)
  const nextConfig: Record<string, unknown> = {
    ...(previousConfig ?? {}),
    platform: isGitee ? 'gitee' : 'github',
    apiBase: isGitee ? 'https://gitee.com/api/v5' : 'https://api.github.com'
  }

  if (topicMatch || isGitHubRoot) {
    const resolvedTopic =
      trimmedKeyword ||
      (topicMatch?.[1] ? decodeURIComponent(topicMatch[1]) : DEFAULT_STORE_DISCOVERY_KEYWORDS[0])
    nextConfig.mode = 'search'
    nextConfig.topic = resolvedTopic
    nextConfig.topics =
      resolvedTopic === DEFAULT_STORE_DISCOVERY_KEYWORDS[0]
        ? [...DEFAULT_STORE_DISCOVERY_KEYWORDS]
        : [resolvedTopic]
  } else {
    delete nextConfig.mode
    if (trimmedKeyword) {
      nextConfig.topic = trimmedKeyword
      nextConfig.topics = [trimmedKeyword]
    } else {
      delete nextConfig.topic
      delete nextConfig.topics
    }
  }

  return nextConfig
}

function handleSave(): boolean {
  const trimmedName = formState.name.trim()
  const rawUrl = formState.url.trim()
  const resolvedUrl = rawUrl || (formState.type === 'npmPackage' ? DEFAULT_NPM_REGISTRY_URL : '')

  if (!trimmedName) {
    formError.value = t('store.sourceEditor.validation.nameRequired')
    return false
  }

  if (!resolvedUrl) {
    formError.value = t('store.sourceEditor.validation.urlRequired')
    return false
  }

  if (!isValidSourceUrl(formState.type, resolvedUrl)) {
    formError.value = t('store.sourceEditor.validation.urlInvalid')
    return false
  }

  const list = storageState.sources
  if (!Array.isArray(list)) return false

  if (editingSourceId.value) {
    const existing = list.find((item) => item.id === editingSourceId.value)
    if (existing && !existing.readOnly) {
      existing.name = trimmedName
      existing.type = formState.type
      existing.url = resolvedUrl
      existing.config = buildSourceConfig(
        formState.type,
        resolvedUrl,
        formState.keyword,
        formState.scope,
        existing.config
      )
    }
  } else {
    const id = generateSourceId(trimmedName)
    const config = buildSourceConfig(
      formState.type,
      resolvedUrl,
      formState.keyword,
      formState.scope
    )

    list.push({
      id,
      name: trimmedName,
      type: formState.type,
      url: resolvedUrl,
      enabled: true,
      priority: list.length ? Math.max(...list.map((item) => item.priority ?? 0)) + 1 : 100,
      trustLevel: 'unverified',
      outdated: false,
      config
    })
  }

  closeFormDialog(true)
  return true
}

normalizeOutdatedSourcesToBottom()

watch(visible, (nextVisible) => {
  if (nextVisible) return
  showFormDialog.value = false
  resetFormState()
})

watch(showFormDialog, (nextVisible) => {
  if (nextVisible) return
  resetFormState()
})

watch(
  () => sources.value.map((item) => `${item.id}:${item.outdated ? 1 : 0}`).join('|'),
  () => {
    normalizeOutdatedSourcesToBottom()
  }
)
</script>

<template>
  <FlipDialog
    v-model="visible"
    :reference="source"
    :header-title="t('store.sourceEditor.title')"
    :header-desc="t('store.sourceEditor.subtitle')"
    size="lg"
  >
    <template #header-actions>
      <div class="StoreSourceEditor-HeaderActions">
        <TxButton
          v-if="missingDefaultCount > 0"
          variant="flat"
          size="sm"
          @click="handleRestoreDefaults()"
        >
          <div class="i-carbon-reset" />
          <span>{{ t('store.sourceEditor.restoreDefaults') }}</span>
        </TxButton>
        <TxButton variant="flat" size="sm" @click="openCreateDialog($event)">
          <div class="i-carbon-add" />
          <span>{{ t('store.sourceEditor.addSource') }}</span>
        </TxButton>
      </div>
    </template>
    <template #default>
      <div class="StoreSourceEditor">
        <div class="StoreSourceEditor-Container">
          <div class="StoreSourceEditor-Summary">
            <span class="Summary-Count">
              {{
                t('store.sourceEditor.summary', {
                  enabled: enabledSourceCount,
                  total: visibleSourceCount
                })
              }}
            </span>
            <span class="Summary-Hint">
              {{ t('store.sourceEditor.summaryHint') }}
            </span>
          </div>

          <TxScroll native no-padding class="StoreSourceEditor-Scroller">
            <TransitionGroup
              v-draggable="[sortableList, draggableOptions]"
              name="source-flip"
              tag="div"
              class="StoreSourceEditor-Content"
            >
              <div
                v-for="item in sortableList"
                :key="item.id"
                :class="{ 'is-disabled': item.enabled === false }"
                class="StoreSourceEditor-Content-Item Item"
              >
                <div class="handle" :title="t('store.sourceEditor.dragToReorder')">
                  <i class="i-carbon-draggable" aria-hidden="true" />
                </div>
                <div class="GhostTitle">{{ item.name }}</div>

                <div class="Item-Icon" :class="resolveSourceIconTone(item)">
                  <i :class="resolveSourceIcon(item)" aria-hidden="true" />
                </div>

                <div class="Item-Container">
                  <div class="Item-Title">
                    <span class="Item-Name">{{ item.name }}</span>
                    <div class="Item-Badges">
                      <TxTag :label="providerTypeLabel(item.type)" size="sm" variant="plain" />
                      <TxTag
                        v-if="item.isOfficial || item.trustLevel === 'official'"
                        :label="t('store.sourceEditor.officialBadge')"
                        size="sm"
                        color="var(--tx-color-primary)"
                      />
                      <TxTag
                        v-else-if="isBuiltinCommunitySource(item)"
                        :label="t('store.sourceEditor.builtinBadge')"
                        size="sm"
                        variant="plain"
                      />
                      <TxTag
                        v-if="item.readOnly"
                        :label="t('store.sourceEditor.readonlyBadge')"
                        size="sm"
                        variant="plain"
                      />
                      <TxTag
                        v-if="
                          item.enabled !== false &&
                          providerMetaById.get(item.id) &&
                          providerMetaById.get(item.id)?.success === false
                        "
                        :label="t('store.sourceEditor.statusFailed')"
                        size="sm"
                        color="var(--tx-color-danger)"
                      />
                      <TxTag
                        v-else-if="
                          item.enabled !== false && providerMetaById.get(item.id)?.success === true
                        "
                        :label="
                          t('store.pluginCount', {
                            count: providerMetaById.get(item.id)?.itemCount ?? 0
                          })
                        "
                        size="sm"
                        color="var(--tx-color-success)"
                      />
                    </div>
                  </div>
                  <div
                    class="Item-Url"
                    :title="resolveSourceUrl(item) || t('store.sourceEditor.noUrl')"
                  >
                    {{ resolveSourceUrl(item) || t('store.sourceEditor.noUrl') }}
                  </div>
                  <div v-if="resolveSourceSubtitle(item)" class="Item-Desc">
                    {{ resolveSourceSubtitle(item) }}
                  </div>
                </div>

                <div class="Item-Actions">
                  <TuffSwitch
                    :model-value="item.enabled !== false"
                    size="small"
                    :aria-label="t('store.sourceEditor.toggleSource', { name: item.name })"
                    @update:model-value="setSourceEnabled(item.id, $event)"
                  />
                  <button
                    v-if="!item.readOnly"
                    type="button"
                    class="edit-btn"
                    :aria-label="t('store.sourceEditor.editSource', { name: item.name })"
                    :title="t('store.sourceEditor.edit')"
                    @click="openEditDialog(item, $event)"
                  >
                    <div class="i-carbon-edit" />
                  </button>
                  <button
                    type="button"
                    :class="{ disabled: isDeleteDisabled(item) }"
                    class="action-btn"
                    :disabled="isDeleteDisabled(item)"
                    :aria-label="t('store.sourceEditor.removeSource', { name: item.name })"
                    :title="
                      item.readOnly
                        ? t('store.sourceEditor.readonlyTooltip')
                        : t('store.sourceEditor.remove')
                    "
                    @click="deleteSource(item.id)"
                  >
                    <div v-if="!isDeleteDisabled(item)" class="i-carbon-close" />
                    <div v-else class="i-carbon-locked" />
                  </button>
                </div>
              </div>
            </TransitionGroup>

            <div v-if="hiddenOutdatedCount > 0" class="StoreSourceEditor-Hint">
              {{
                t('store.sourceEditor.outdatedHiddenHint', {
                  count: hiddenOutdatedCount
                })
              }}
            </div>

            <div v-if="visibleOutdatedSources.length > 0" class="StoreSourceEditor-OutdatedSection">
              <div class="StoreSourceEditor-SectionTitle">
                {{ t('store.sourceEditor.outdatedSection') }}
              </div>
              <div
                v-for="item in visibleOutdatedSources"
                :key="item.id"
                :class="{ 'is-disabled': item.enabled === false }"
                class="StoreSourceEditor-Content-Item Item is-outdated-item"
              >
                <div class="handle disabled" aria-hidden="true">
                  <i class="i-carbon-draggable" />
                </div>
                <div class="Item-Icon" :class="resolveSourceIconTone(item)">
                  <i :class="resolveSourceIcon(item)" aria-hidden="true" />
                </div>
                <div class="Item-Container">
                  <div class="Item-Title">
                    <span class="Item-Name">{{ item.name }}</span>
                    <div class="Item-Badges">
                      <TxTag :label="providerTypeLabel(item.type)" size="sm" variant="plain" />
                      <TxTag
                        v-if="item.readOnly"
                        :label="t('store.sourceEditor.readonlyBadge')"
                        size="sm"
                        variant="plain"
                      />
                      <TxTag
                        :label="t('store.sourceEditor.outdatedBadge')"
                        size="sm"
                        color="var(--tx-color-warning)"
                      />
                    </div>
                  </div>
                  <div
                    class="Item-Url"
                    :title="resolveSourceUrl(item) || t('store.sourceEditor.noUrl')"
                  >
                    {{ resolveSourceUrl(item) || t('store.sourceEditor.noUrl') }}
                  </div>
                </div>
                <div class="Item-Actions">
                  <TuffSwitch
                    :model-value="item.enabled !== false"
                    size="small"
                    :aria-label="t('store.sourceEditor.toggleSource', { name: item.name })"
                    @update:model-value="setSourceEnabled(item.id, $event)"
                  />
                  <button
                    type="button"
                    :class="{ disabled: isDeleteDisabled(item) }"
                    class="action-btn"
                    :disabled="isDeleteDisabled(item)"
                    :aria-label="t('store.sourceEditor.removeSource', { name: item.name })"
                    :title="
                      item.readOnly
                        ? t('store.sourceEditor.readonlyTooltip')
                        : t('store.sourceEditor.remove')
                    "
                    @click="deleteSource(item.id)"
                  >
                    <div v-if="!isDeleteDisabled(item)" class="i-carbon-close" />
                    <div v-else class="i-carbon-locked" />
                  </button>
                </div>
              </div>
            </div>
          </TxScroll>
        </div>
      </div>
    </template>
  </FlipDialog>

  <FlipDialog
    v-model="showFormDialog"
    :reference="formDialogSource"
    :header-title="formDialogTitle"
    size="lg"
  >
    <template #default>
      <div class="StoreSourceEditor-AddDialog">
        <div v-if="!isEditing" class="PresetSection">
          <div class="FieldLabel">{{ t('store.sourceEditor.presetsLabel') }}</div>
          <div class="PresetList">
            <button
              v-for="preset in SOURCE_PRESETS"
              :key="preset.id"
              type="button"
              class="preset-chip"
              @click="applyPreset(preset)"
            >
              <i :class="preset.icon" aria-hidden="true" />
              <span>{{ t(preset.labelKey) }}</span>
            </button>
          </div>
        </div>

        <div class="CreateRow">
          <div class="FieldGroup FieldGroup--grow">
            <label class="FieldLabel">{{ t('store.sourceEditor.nameLabel') }}</label>
            <TxInput
              v-model="formState.name"
              class="CreateNameInput"
              clearable
              :placeholder="t('store.sourceEditor.namePlaceholder')"
            />
          </div>
          <div class="FieldGroup FieldGroup--type">
            <label class="FieldLabel">{{ t('store.sourceEditor.typeLabel') }}</label>
            <TxSelect v-model="formState.type" class="CreateTypeSelect" eager>
              <TxSelectItem
                v-for="option in providerTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </TxSelectItem>
            </TxSelect>
          </div>
        </div>

        <div class="FieldGroup mt-3">
          <label class="FieldLabel">{{ t('store.sourceEditor.urlLabel') }}</label>
          <TxInput
            v-model="formState.url"
            class="CreateUrlInput"
            clearable
            :placeholder="activeUrlPlaceholder"
          />
          <p v-if="activeUrlHint" class="FieldHint">{{ activeUrlHint }}</p>
        </div>

        <div v-if="showKeywordField" class="CreateRow mt-3">
          <div class="FieldGroup FieldGroup--grow">
            <label class="FieldLabel">{{ t('store.sourceEditor.keywordLabel') }}</label>
            <TxInput
              v-model="formState.keyword"
              clearable
              :placeholder="t('store.sourceEditor.keywordPlaceholder')"
            />
          </div>
          <div v-if="formState.type === 'npmPackage'" class="FieldGroup FieldGroup--grow">
            <label class="FieldLabel">{{ t('store.sourceEditor.scopeLabel') }}</label>
            <TxInput
              v-model="formState.scope"
              clearable
              :placeholder="t('store.sourceEditor.scopePlaceholder')"
            />
          </div>
        </div>

        <p v-if="formError" class="FormError" role="alert">{{ formError }}</p>

        <div class="CreateActions">
          <TxButton variant="flat" size="sm" @click="closeFormDialog(true)">
            {{ t('store.sourceEditor.cancel') }}
          </TxButton>
          <TxButton variant="flat" size="sm" type="primary" @click="handleSave()">
            {{ isEditing ? t('store.sourceEditor.save') : t('store.sourceEditor.add') }}
          </TxButton>
        </div>
      </div>
    </template>
  </FlipDialog>
</template>

<style scoped lang="scss">
.StoreSourceEditor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.StoreSourceEditor-HeaderActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.StoreSourceEditor-Container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 10px 14px 16px;
  gap: 10px;
}

.StoreSourceEditor-Summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  padding: 0 4px;
}

.Summary-Count {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-text-color-regular);
}

.Summary-Hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StoreSourceEditor-AddDialog {
  padding: 18px;
}

.PresetSection {
  margin-bottom: 14px;
}

.PresetList {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  background-color: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);

  &:hover {
    background-color: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 1px;
  }
}

.CreateRow {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.FieldGroup {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.FieldGroup--grow {
  flex: 1;
  min-width: 0;
}

.FieldGroup--type {
  width: 200px;
  flex: 0 0 200px;
}

.FieldLabel {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-text-color-regular);
}

.FieldHint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  text-wrap: pretty;
}

.FormError {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--tx-color-danger);
}

.CreateNameInput,
.CreateUrlInput {
  width: 100%;
  min-width: 0;
}

.CreateTypeSelect {
  width: 100%;
}

.CreateActions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.StoreSourceEditor-Scroller {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.StoreSourceEditor-Scroller :deep(.tx-scroll__content) {
  padding: 0;
}

.StoreSourceEditor-Content,
.StoreSourceEditor-OutdatedSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px;
}

.StoreSourceEditor-Hint {
  margin: 8px 6px 2px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.StoreSourceEditor-SectionTitle {
  margin: 10px 4px 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--tx-text-color-secondary);
  text-transform: uppercase;
}

.source-flip-enter-active,
.source-flip-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.source-flip-enter-from,
.source-flip-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.source-flip-move {
  transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.StoreSourceEditor-Content-Item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background-color: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);

  &:hover {
    background-color: var(--tx-fill-color-light);
  }

  .GhostTitle {
    position: absolute;
    top: 50%;
    left: 50%;
    opacity: 0;
    pointer-events: none;
    font-size: 15px;
    font-weight: 600;
    color: var(--tx-text-color-primary);
    transform: translate(-50%, -50%) scale(0.96);
    transition:
      opacity 0.125s ease,
      transform 0.125s ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &.ghost {
    .handle,
    .Item-Icon,
    .Item-Container,
    .Item-Actions {
      opacity: 0 !important;
      transition: none !important;
    }

    .GhostTitle {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }

    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
    background-color: var(--tx-fill-color);
  }

  &.is-disabled {
    background-color: var(--tx-fill-color-extra-light);

    .Item-Icon,
    .Item-Container {
      opacity: 0.68;
    }
  }

  .handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 32px;
    border-radius: 6px;
    cursor: grab;
    color: var(--tx-text-color-placeholder);
    font-size: 16px;

    &:hover {
      color: var(--tx-text-color-secondary);
      background-color: var(--tx-fill-color);
    }

    &:active {
      cursor: grabbing;
    }

    &.disabled {
      cursor: default;
      opacity: 0.35;

      &:hover {
        color: var(--tx-text-color-placeholder);
        background-color: transparent;
      }
    }
  }

  .Item-Icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 18px;
    background-color: var(--tx-fill-color);
    color: var(--tx-text-color-regular);

    &.is-official {
      background-color: var(--tx-color-primary-light-9);
      color: var(--tx-color-primary);
    }

    &.is-github {
      background-color: var(--tx-fill-color-dark);
      color: var(--tx-text-color-primary);
    }

    &.is-npm {
      background-color: var(--tx-color-danger-light-9);
      color: var(--tx-color-danger);
    }
  }

  .Item-Container {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;

    .Item-Title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      line-height: 1.35;
    }

    .Item-Name {
      font-size: 14px;
      font-weight: 600;
      color: var(--tx-text-color-primary);
    }

    .Item-Badges {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }

    .Item-Url {
      font-size: 12px;
      color: var(--tx-text-color-regular);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .Item-Desc {
      font-size: 12px;
      color: var(--tx-text-color-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .Item-Actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .edit-btn,
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    font: inherit;
    font-size: 14px;
    border-radius: 7px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: 1px;
    }
  }

  .edit-btn {
    background-color: var(--tx-fill-color);
    color: var(--tx-text-color-regular);

    &:hover {
      background-color: var(--tx-fill-color-dark);
      color: var(--tx-text-color-primary);
    }
  }

  .action-btn {
    background-color: var(--tx-color-danger-light-9);
    color: color-mix(in srgb, var(--tx-color-danger) 65%, var(--tx-text-color-primary));

    &:hover {
      background-color: color-mix(in srgb, var(--tx-color-danger) 20%, var(--tx-bg-color));
      color: var(--tx-color-danger);
    }

    &.disabled {
      cursor: not-allowed;
      background-color: var(--tx-fill-color);
      color: var(--tx-text-color-secondary);

      &:hover {
        background-color: var(--tx-fill-color);
        color: var(--tx-text-color-secondary);
      }
    }
  }

  &.is-outdated-item {
    opacity: 0.88;
  }
}

.CreateTypeSelect :deep(.tx-input) {
  min-height: 32px;
}
</style>
