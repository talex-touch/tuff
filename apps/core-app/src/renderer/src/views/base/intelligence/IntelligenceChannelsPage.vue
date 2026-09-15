<script lang="ts" name="IntelligenceChannelsPage" setup>
import type {
  IntelligenceProviderConfig,
  IntelligenceProviderSyncPayload,
  IntelligenceProviderSyncRecord,
  TestResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxIconPicker, type IconPickerShape } from '@talex-touch/tuffex/icon-picker'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { snapshotIntelligenceProviderConfig } from '~/modules/intelligence/provider-config-snapshot'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import IntelligenceEmptyState from '~/components/intelligence/layout/IntelligenceEmptyState.vue'
import IntelligenceInfo from '~/components/intelligence/layout/IntelligenceInfo.vue'
import IntelligenceList from '~/components/intelligence/layout/IntelligenceList.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID
} from '~/modules/intelligence/nexus-provider'
import {
  PROVIDER_ICON_METADATA_KEY,
  PROVIDER_ICON_SHAPE_METADATA_KEY,
  providerIconIdentifier
} from '~/modules/intelligence/provider-icon-override'
import {
  getProviderChannelType,
  getRuntimeProviderType,
  PROVIDER_CHANNEL_TYPE_OPTIONS,
  ProviderChannelType,
  type ProviderChannelKind
} from '~/modules/intelligence/provider-channel-type'
import { getRuntimeNexusBaseUrl } from '~/modules/nexus/runtime-base'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import { createRendererLogger } from '~/utils/renderer-log'

const channelsLog = createRendererLogger('IntelligenceChannelsPage')
const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const transport = useTuffTransport()

/**
 * The native file chooser the icon picker uses. Without it the picker falls
 * back to a browser `<input type="file">`, which yields a data URL — a whole
 * PNG inlined into the provider record, persisted on every save.
 */
const openFileEvent = defineRawEvent<
  {
    title?: string
    buttonLabel?: string
    properties?: string[]
    filters?: { name: string; extensions: string[] }[]
  },
  { filePaths?: string[] }
>('dialog:open-file')

const {
  providers,
  selectedProviderId,
  selectedProvider,
  addProvider,
  updateProvider,
  removeProvider
} = useIntelligenceManager()

const testResult = ref<TestResult | null>(null)
const isTesting = ref(false)
const searchQuery = ref('')
const isSyncingFromNexus = ref(false)
const syncError = ref('')
const syncMessage = ref('')
const basicEditorVisible = ref(false)
const basicDraft = ref<{
  id: string
  name: string
  channelType: ProviderChannelKind
  icon: string
  iconShape: IconPickerShape
}>({
  id: '',
  name: '',
  channelType: ProviderChannelType.COMPATIBLE,
  icon: '',
  iconShape: 'rounded'
})

const canEditSelectedProvider = computed(
  () => !!selectedProvider.value && !isNexusManagedProvider(selectedProvider.value)
)

/**
 * TxIconPicker ships English defaults, so every string it draws has to be
 * handed over for the panel to follow the app's language.
 */
const providerIconLabels = computed(() => ({
  emoji: t('settings.intelligence.providerIconLabels.emoji'),
  icon: t('settings.intelligence.providerIconLabels.icon'),
  brand: t('settings.intelligence.providerIconLabels.brand'),
  file: t('settings.intelligence.providerIconLabels.file'),
  search: t('settings.intelligence.providerIconLabels.search'),
  empty: t('settings.intelligence.providerIconLabels.empty'),
  clear: t('settings.intelligence.providerIconLabels.clear'),
  chooseFile: t('settings.intelligence.providerIconLabels.chooseFile'),
  shape: t('settings.intelligence.providerIconLabels.shape'),
  shapeCircle: t('settings.intelligence.providerIconLabels.shapeCircle'),
  shapeRounded: t('settings.intelligence.providerIconLabels.shapeRounded'),
  shapeSquare: t('settings.intelligence.providerIconLabels.shapeSquare')
}))

function normalizeProviderType(type: string): IntelligenceProviderType {
  switch (type) {
    case IntelligenceProviderType.OPENAI:
    case IntelligenceProviderType.ANTHROPIC:
    case IntelligenceProviderType.DEEPSEEK:
    case IntelligenceProviderType.SILICONFLOW:
    case IntelligenceProviderType.LOCAL:
      return type
    default:
      return IntelligenceProviderType.CUSTOM
  }
}

function toNexusFallbackProvider(): IntelligenceProviderConfig {
  const baseUrl = `${getRuntimeNexusBaseUrl().replace(/\/+$/, '')}/v1`
  return {
    id: TUFF_NEXUS_PROVIDER_ID,
    type: IntelligenceProviderType.CUSTOM,
    name: 'Tuff Nexus',
    enabled: true,
    priority: 1,
    baseUrl,
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {},
    metadata: {
      origin: 'tuff-nexus',
      source: 'core-fallback',
      syncedFromNexus: true
    }
  }
}

function mergeProviderFromNexus(record: IntelligenceProviderSyncRecord): void {
  const normalizedType = normalizeProviderType(record.type)
  const nexusPreferred = isNexusManagedProvider(record)
  const resolvedProviderId = nexusPreferred ? TUFF_NEXUS_PROVIDER_ID : record.id
  const existing = providers.value.find((item) => item.id === resolvedProviderId)
  const hasCredential =
    normalizedType === IntelligenceProviderType.LOCAL ||
    nexusPreferred ||
    Boolean(existing?.hasCredential)

  const nextProvider: IntelligenceProviderConfig = {
    id: resolvedProviderId,
    type: normalizedType,
    name: record.name || record.id,
    enabled: record.enabled && hasCredential,
    hasCredential: existing?.hasCredential,
    authRef: existing?.authRef,
    baseUrl: record.baseUrl || undefined,
    models: Array.isArray(record.models) ? record.models : [],
    defaultModel: record.defaultModel || undefined,
    instructions: record.instructions || undefined,
    timeout: typeof record.timeout === 'number' ? record.timeout : 30000,
    priority: nexusPreferred ? 1 : typeof record.priority === 'number' ? record.priority : 3,
    rateLimit: record.rateLimit || {},
    capabilities: Array.isArray(record.capabilities) ? record.capabilities : [],
    metadata: {
      ...(record.metadata || {}),
      source: 'nexus-dashboard',
      syncedFromNexus: true,
      hasApiKey: record.hasApiKey,
      nexusPreferred,
      syncedAt: Date.now()
    }
  }

  if (nexusPreferred) {
    nextProvider.enabled = true
    nextProvider.priority = 1
    nextProvider.metadata = {
      ...(nextProvider.metadata || {}),
      origin: 'tuff-nexus'
    }
  }

  if (existing) {
    updateProvider(nextProvider.id, nextProvider)
    return
  }

  addProvider(nextProvider)
}

function ensureNexusPreferredProvider(): void {
  const existing = providers.value.find((item) => item.id === TUFF_NEXUS_PROVIDER_ID)
  if (!existing) {
    addProvider(toNexusFallbackProvider())
    return
  }
  updateProvider(TUFF_NEXUS_PROVIDER_ID, {
    enabled: true,
    priority: 1,
    metadata: {
      ...(existing.metadata || {}),
      origin: 'tuff-nexus',
      syncedFromNexus: true,
      syncedAt: Date.now()
    }
  })
}

async function syncProvidersFromNexus(): Promise<void> {
  if (isSyncingFromNexus.value) return
  isSyncingFromNexus.value = true
  syncError.value = ''
  syncMessage.value = ''

  try {
    const response = await fetchNexusWithAuth(
      '/api/dashboard/intelligence/providers/sync',
      {
        method: 'GET',
        headers: { Accept: 'application/json' }
      },
      'intelligence:sync-providers'
    )

    if (!response) {
      throw new Error(t('settings.intelligence.syncFromNexusAuthRequired'))
    }

    if (!response.ok) {
      throw new Error(`${t('settings.intelligence.syncFromNexusFailed')} (HTTP ${response.status})`)
    }

    const payload = await response.json<IntelligenceProviderSyncPayload>()
    const incomingProviders = Array.isArray(payload.providers) ? payload.providers : []
    for (const provider of incomingProviders) {
      mergeProviderFromNexus(provider)
    }
    ensureNexusPreferredProvider()
    if (!selectedProviderId.value) {
      selectedProviderId.value = TUFF_NEXUS_PROVIDER_ID
    }

    syncMessage.value = t('settings.intelligence.syncFromNexusSuccess', {
      count: incomingProviders.length
    })
  } catch (error) {
    syncError.value =
      error instanceof Error ? error.message : t('settings.intelligence.syncFromNexusFailed')
  } finally {
    isSyncingFromNexus.value = false
  }
}

function createProviderCopy(provider: IntelligenceProviderConfig): IntelligenceProviderConfig {
  const id = `custom-${Date.now()}`
  const {
    apiKey: _apiKey,
    authRef: _authRef,
    hasCredential: _hasCredential,
    ...copyableProvider
  } = provider
  return {
    ...copyableProvider,
    id,
    name: `${provider.name} Copy`,
    enabled: false,
    metadata: {
      ...(provider.metadata || {}),
      copiedFrom: provider.id,
      copiedAt: Date.now()
    }
  }
}

function handleDuplicateProvider(): void {
  if (!selectedProvider.value || isNexusManagedProvider(selectedProvider.value)) return
  const copied = createProviderCopy(selectedProvider.value)
  addProvider(copied)
  selectedProviderId.value = copied.id
  testResult.value = null
}

function openBasicEditor(provider: IntelligenceProviderConfig): void {
  const shape = provider.metadata?.[PROVIDER_ICON_SHAPE_METADATA_KEY]
  basicDraft.value = {
    id: provider.id,
    name: provider.name,
    channelType: getProviderChannelType(provider),
    icon: providerIconIdentifier(provider),
    // Anything but the three known shapes — a hand-edited config, an older
    // schema — falls back rather than reaching the picker as an unknown value
    // that matches no shape button and leaves the row with nothing selected.
    iconShape: shape === 'circle' || shape === 'square' ? shape : 'rounded'
  }
  basicEditorVisible.value = true
}

function handleOpenBasicEditor(): void {
  if (!selectedProvider.value || !canEditSelectedProvider.value) return
  openBasicEditor(selectedProvider.value)
}

function handleSaveBasicEditor(): void {
  if (!selectedProvider.value || basicDraft.value.id !== selectedProvider.value.id) return
  updateProvider(selectedProvider.value.id, {
    name: basicDraft.value.name.trim() || selectedProvider.value.name,
    type: getRuntimeProviderType(basicDraft.value.channelType),
    metadata: {
      ...(selectedProvider.value.metadata || {}),
      channelType: basicDraft.value.channelType,
      [PROVIDER_ICON_METADATA_KEY]: basicDraft.value.icon,
      [PROVIDER_ICON_SHAPE_METADATA_KEY]: basicDraft.value.iconShape
    }
  })
  basicEditorVisible.value = false
}

/**
 * Opens the native picker for a provider icon image.
 *
 * Returns `null` on cancel *and* on failure: TxIconPicker only commits a
 * non-null path, and the toast is raised here, where the i18n key lives.
 */
async function chooseProviderIconFile(): Promise<string | null> {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('settings.intelligence.providerIcon'),
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'] }]
    })
    return result?.filePaths?.[0] ?? null
  } catch (error) {
    channelsLog.error('Failed to choose a provider icon file', error)
    toast.error(t('settings.intelligence.providerIconFileFailed'))
    return null
  }
}

function handleAddProvider(): void {
  const nextIndex = providers.value.length + 1
  const id = `custom-${Date.now()}`
  const provider: IntelligenceProviderConfig = {
    id,
    type: IntelligenceProviderType.CUSTOM,
    name: `${t('settings.intelligence.providers')} ${nextIndex}`,
    enabled: false,
    priority: 3,
    models: [],
    timeout: 30000,
    rateLimit: {},
    metadata: { channelType: ProviderChannelType.COMPATIBLE }
  }
  addProvider(provider)
  selectedProviderId.value = id
  openBasicEditor(provider)
}

function handleSelectProvider(id: string): void {
  selectedProviderId.value = id
  testResult.value = null
}

function handleUpdateProvider(updatedProvider: IntelligenceProviderConfig): void {
  updateProvider(updatedProvider.id, updatedProvider)
}

async function handleTestProvider(): Promise<void> {
  if (!selectedProvider.value || isTesting.value) return
  isTesting.value = true
  testResult.value = null
  try {
    // The provider comes from Vue reactive state. Detach it before the strict SDK DTO boundary,
    // which intentionally rejects Proxy objects and accessor-backed records.
    const providerSnapshot = snapshotIntelligenceProviderConfig(selectedProvider.value)
    const response = (await aiClient.testProvider(providerSnapshot)) as TestResult
    testResult.value = response
  } catch (error) {
    testResult.value = {
      success: false,
      message:
        error instanceof Error ? error.message : t('settings.intelligence.connectionTestFailed'),
      timestamp: Date.now()
    }
  } finally {
    isTesting.value = false
  }
}

async function handleDeleteProvider(): Promise<void> {
  if (!selectedProvider.value) return
  const deletedId = selectedProvider.value.id

  const currentIndex = providers.value.findIndex((p) => p.id === deletedId)
  await aiClient.deleteProviderConfig({ providerId: deletedId })
  removeProvider(deletedId)

  // Smoothly select next provider after deletion
  const remainingProviders = providers.value
  if (remainingProviders.length > 0) {
    // Try to select the provider at the same index, or the last one if index is out of bounds
    const newIndex = Math.min(currentIndex, remainingProviders.length - 1)
    selectedProviderId.value = remainingProviders[newIndex].id
  } else {
    selectedProviderId.value = null
  }

  // Clear test result when switching
  testResult.value = null
}

function navigateToNextProvider(): void {
  const currentIndex = providers.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex < providers.value.length - 1) {
    selectedProviderId.value = providers.value[currentIndex + 1].id
    testResult.value = null
  }
}

function navigateToPreviousProvider(): void {
  const currentIndex = providers.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex > 0) {
    selectedProviderId.value = providers.value[currentIndex - 1].id
    testResult.value = null
  }
}

useKeyboardNavigation({
  onNavigateDown: navigateToNextProvider,
  onNavigateUp: navigateToPreviousProvider
})
</script>

<template>
  <SettingsPage edge-blur="none" fill flush integrated-drag-region>
    <div class="flex h-full flex-col" role="main" aria-label="AI Intelligence Channels">
      <TuffAsideTemplate
        v-model="searchQuery"
        class="flex-1"
        :search-placeholder="t('intelligence.search.placeholder')"
        :clear-label="t('intelligence.search.clear')"
        :main-aria-live="selectedProvider ? 'polite' : 'off'"
        :main-edge-blur="false"
        window-drag-region
      >
        <template #default>
          <IntelligenceList
            class="h-full w-full"
            aria-label="AI Provider List"
            :providers="providers"
            :selected-id="selectedProviderId"
            :search-query="searchQuery"
            @select="handleSelectProvider"
          />
        </template>

        <template #footer>
          <div class="space-y-2">
            <TxButton
              variant="flat"
              class="w-full"
              native-type="button"
              :aria-label="t('settings.intelligence.addChannel')"
              @click="handleAddProvider"
            >
              <i class="i-carbon-add" aria-hidden="true" />
              <span>{{ t('settings.intelligence.addChannel') }}</span>
            </TxButton>
          </div>
        </template>

        <template #main>
          <div
            :key="selectedProvider ? selectedProvider.id : 'empty'"
            class="h-full overflow-hidden"
          >
            <IntelligenceInfo
              v-if="selectedProvider"
              :provider="selectedProvider"
              :test-result="testResult"
              :is-testing="isTesting"
              :is-syncing-from-nexus="isSyncingFromNexus"
              :sync-message="syncMessage"
              :sync-error="syncError"
              @update="handleUpdateProvider"
              @test="handleTestProvider"
              @delete="handleDeleteProvider"
              @duplicate="handleDuplicateProvider"
              @edit-basic="handleOpenBasicEditor"
              @sync-nexus="syncProvidersFromNexus"
            />
            <IntelligenceEmptyState v-else />
          </div>
        </template>
      </TuffAsideTemplate>

      <p v-if="providers.length === 0" class="text-sm text-[var(--tx-text-color-secondary)]">
        {{ t('settings.intelligence.emptyProviders') }}
      </p>

      <TxDrawer
        v-model:visible="basicEditorVisible"
        :title="t('settings.intelligence.editProviderBasic')"
      >
        <div class="p-4 space-y-3">
          <TuffBlockSlot
            :title="t('settings.intelligence.providerIcon')"
            :description="t('settings.intelligence.providerIconHint')"
            default-icon="i-carbon-image"
            active-icon="i-carbon-image"
          >
            <TxIconPicker
              v-model="basicDraft.icon"
              v-model:shape="basicDraft.iconShape"
              :labels="providerIconLabels"
              :file-chooser="chooseProviderIconFile"
            />
          </TuffBlockSlot>
          <TuffBlockInput
            v-model="basicDraft.name"
            :title="t('settings.intelligence.providerName')"
            :description="t('settings.intelligence.providerNameHint')"
            :placeholder="t('settings.intelligence.providerNamePlaceholder')"
            default-icon="i-carbon-text-font"
            active-icon="i-carbon-text-font"
          />
          <TuffBlockSelect
            v-model="basicDraft.channelType"
            :title="t('settings.intelligence.providerType')"
            :description="t('settings.intelligence.providerTypeHint')"
            default-icon="i-carbon-api-1"
            active-icon="i-carbon-api-1"
          >
            <TxSelectItem v-for="type in PROVIDER_CHANNEL_TYPE_OPTIONS" :key="type" :value="type">
              {{ t(`settings.intelligence.providerTypeOptions.${type}`) }}
            </TxSelectItem>
          </TuffBlockSelect>
          <div class="flex justify-end gap-2 pt-2">
            <TxButton variant="flat" @click="basicEditorVisible = false">
              {{ t('common.cancel') }}
            </TxButton>
            <TxButton type="primary" variant="flat" @click="handleSaveBasicEditor">
              {{ t('common.confirm') }}
            </TxButton>
          </div>
        </div>
      </TxDrawer>
    </div>
  </SettingsPage>
</template>
