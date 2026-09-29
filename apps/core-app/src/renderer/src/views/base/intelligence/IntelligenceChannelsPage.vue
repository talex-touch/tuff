<script lang="ts" name="IntelligenceChannelsPage" setup>
import type { IntelligenceProviderConfig, TestResult } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxIconPicker, type IconPickerShape } from '@talex-touch/tuffex/icon-picker'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { isOnDeviceAsrProvider } from '@talex-touch/utils/intelligence/voice-asr'
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
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { useKeyboardNavigation } from '~/composables/useKeyboardNavigation'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { isNexusManagedProvider } from '~/modules/intelligence/nexus-provider'
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
  isLocalCliProvider,
  type ProviderChannelKind
} from '~/modules/intelligence/provider-channel-type'
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
  () =>
    !!selectedProvider.value &&
    !isNexusManagedProvider(selectedProvider.value) &&
    !isLocalCliProvider(selectedProvider.value)
)

const detectedDisabledClis = computed(() => {
  return providers.value.filter((p) => isLocalCliProvider(p) && !p.enabled)
})

function handleEnableAllClis(): void {
  const count = detectedDisabledClis.value.length
  for (const cli of detectedDisabledClis.value) {
    updateProvider(cli.id, { enabled: true })
  }
  toast.success(t('settings.intelligence.clisBatchEnabledToast', { count }))
}

/**
 * The channels this page manages.
 *
 * The on-device dictation channel is program-owned — seeded and bound by main from the installed
 * speech models, with no endpoint and no credential to edit — so it is not a channel anyone
 * configures and it never reaches this list. Everything that addresses the list (rendering, the
 * empty state, keyboard navigation, what to select after a delete) reads this array, never the raw
 * one, or the list and its navigation would disagree about which rows exist.
 */
const visibleProviders = computed(() =>
  providers.value.filter((provider) => !isOnDeviceAsrProvider(provider))
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
  if (
    !selectedProvider.value ||
    isNexusManagedProvider(selectedProvider.value) ||
    isLocalCliProvider(selectedProvider.value)
  )
    return
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

  const currentIndex = visibleProviders.value.findIndex((p) => p.id === deletedId)
  await aiClient.deleteProviderConfig({ providerId: deletedId })
  removeProvider(deletedId)

  // Smoothly select next provider after deletion
  const remainingProviders = visibleProviders.value
  if (remainingProviders.length > 0) {
    // Try to select the provider at the same index, or the last one if index is out of bounds
    const newIndex = Math.min(Math.max(currentIndex, 0), remainingProviders.length - 1)
    selectedProviderId.value = remainingProviders[newIndex].id
  } else {
    selectedProviderId.value = null
  }

  // Clear test result when switching
  testResult.value = null
}

function navigateToNextProvider(): void {
  const currentIndex = visibleProviders.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex < visibleProviders.value.length - 1) {
    selectedProviderId.value = visibleProviders.value[currentIndex + 1].id
    testResult.value = null
  }
}

function navigateToPreviousProvider(): void {
  const currentIndex = visibleProviders.value.findIndex((p) => p.id === selectedProviderId.value)
  if (currentIndex > 0) {
    selectedProviderId.value = visibleProviders.value[currentIndex - 1].id
    testResult.value = null
  }
}

useKeyboardNavigation({
  onNavigateDown: navigateToNextProvider,
  onNavigateUp: navigateToPreviousProvider
})
</script>

<template>
  <SettingsPage
    v-model:search="searchQuery"
    layout="split"
    :aria-label="t('settingsIntelligenceHub.channels')"
    :search-placeholder="t('intelligence.search.placeholder')"
    :clear-label="t('intelligence.search.clear')"
    :main-aria-live="selectedProvider ? 'polite' : 'off'"
  >
    <template #aside>
      <div class="h-full w-full flex flex-col overflow-hidden">
        <div
          v-if="detectedDisabledClis.length > 0"
          class="cli-guide-banner mb-3 p-3 rounded-lg border border-[var(--tx-color-primary-light)] bg-[var(--tx-color-primary-soft)] text-xs flex flex-col gap-2 shrink-0"
        >
          <div class="flex items-center gap-1.5 font-semibold text-[var(--tx-color-primary)]">
            <i class="i-carbon-terminal" aria-hidden="true" />
            <span>{{ t('settings.intelligence.cliDetectedTitle') }}</span>
          </div>
          <p class="text-[var(--tx-text-color-secondary)] leading-relaxed">
            {{ t('settings.intelligence.cliDetectedDesc') }}
          </p>
          <div class="flex justify-end pt-1">
            <TxButton
              size="sm"
              variant="flat"
              type="primary"
              native-type="button"
              @click="handleEnableAllClis"
            >
              <span>{{ t('settings.intelligence.enableCliAction') }}</span>
            </TxButton>
          </div>
        </div>
        <IntelligenceList
          class="flex-1 min-h-0 w-full"
          aria-label="AI Provider List"
          :providers="visibleProviders"
          :selected-id="selectedProviderId"
          :search-query="searchQuery"
          @select="handleSelectProvider"
        />
      </div>
    </template>

    <template #aside-footer>
      <div class="space-y-2">
        <!--
          Rendered above the action it asks for. The list's own empty text describes the current
          filter; this one is about the channel set the user has to change.
        -->
        <p
          v-if="visibleProviders.length === 0"
          class="text-sm text-[var(--tx-text-color-secondary)]"
        >
          {{ t('settings.intelligence.emptyProviders') }}
        </p>
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

    <template #detail>
      <div :key="selectedProvider ? selectedProvider.id : 'empty'" class="h-full overflow-hidden">
        <IntelligenceInfo
          v-if="selectedProvider"
          :provider="selectedProvider"
          :test-result="testResult"
          :is-testing="isTesting"
          @update="handleUpdateProvider"
          @test="handleTestProvider"
          @delete="handleDeleteProvider"
          @duplicate="handleDuplicateProvider"
          @edit-basic="handleOpenBasicEditor"
        />
        <IntelligenceEmptyState v-else />
      </div>
    </template>

    <template #overlay>
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
    </template>
  </SettingsPage>
</template>
