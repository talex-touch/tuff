<script lang="ts" name="IntelligenceCapabilityInfo" setup>
import type {
  IntelligenceCapabilityProviderBinding,
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import { TxButton } from '@talex-touch/tuffex/button'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import CapabilityHeader from './CapabilityHeader.vue'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import CapabilityOverview from './CapabilityOverview.vue'
import ProviderList from './ProviderList.vue'
import TestSection from './TestSection.vue'

const props = defineProps<{
  capability: IntelligenceCapabilityConfig
  providers: IntelligenceProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
  hasPendingChanges: boolean
  isSaving: boolean
  saveState: 'idle' | 'dirty' | 'saved' | 'error'
  saveErrorDetail?: string
}>()

const emits = defineEmits<{
  toggleProvider: [providerId: string, enabled: boolean]
  updateModels: [providerId: string, value: string[]]
  updatePrompt: [prompt: string]
  test: [
    options?: {
      providerId?: string
      model?: string
      promptTemplate?: string
      promptVariables?: Record<string, unknown>
      userInput?: string
    }
  ]
  reorderProviders: [bindings: IntelligenceCapabilityProviderBinding[]]
  save: []
}>()

const { t } = useI18n()

const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDialog = ref(false)
const showPromptDrawer = ref(false)
const showTestDrawer = ref(false)
const modelDialogSource = ref<HTMLElement | null>(null)
let promptTimer: number | null = null
let syncingFromProps = false

const providerMetaMap = computed(
  () => new Map(props.providers.map((provider) => [provider.id, provider]))
)

const selectedProviderIds = computed(() => {
  return new Set(
    (props.capability.providers || [])
      .filter((binding) => binding.enabled !== false)
      .map((binding) => binding.providerId)
  )
})

const activeBindingCount = computed(() => selectedProviderIds.value.size)

const totalModelsCount = computed(() => {
  return (props.capability.providers || [])
    .filter((binding) => binding.enabled !== false)
    .reduce((sum, binding) => sum + (binding.models?.length || 0), 0)
})

const bindingMap = computed(() => {
  const map = new Map<string, CapabilityBinding>()
  props.bindings.forEach((binding) => {
    map.set(binding.providerId, binding)
  })
  return map
})

const enabledBindings = computed<CapabilityBinding[]>(() => {
  return (props.capability.providers || [])
    .filter((binding) => binding.enabled !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((binding) => ({
      ...binding,
      provider: providerMetaMap.value.get(binding.providerId)
    }))
})

const disabledProviders = computed<CapabilityBinding[]>(() => {
  const enabledIds = new Set(enabledBindings.value.map((binding) => binding.providerId))
  const disabledSet = new Set<string>()
  const leftover = (props.capability.providers || [])
    .filter((binding) => binding.enabled === false)
    .map((binding) => {
      disabledSet.add(binding.providerId)
      return {
        ...binding,
        provider: providerMetaMap.value.get(binding.providerId)
      }
    })

  const remaining = props.providers
    .filter((provider) => !enabledIds.has(provider.id) && !disabledSet.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      enabled: false,
      priority: undefined,
      provider
    }))

  return [...leftover, ...remaining]
})

const focusedProvider = computed(
  () => props.providers.find((provider) => provider.id === focusedProviderId.value) || null
)

const focusedBinding = computed(() => {
  if (!focusedProviderId.value) return null
  return bindingMap.value.get(focusedProviderId.value) ?? null
})

const canEditModels = computed(() => {
  return !!focusedProvider.value && selectedProviderIds.value.has(focusedProviderId.value)
})

const promptSummary = computed(() => {
  const trimmed = (promptValue.value || '').trim()
  if (!trimmed) {
    return t('settings.intelligence.capabilityPromptSectionDesc')
  }

  const singleLine = trimmed.replace(/\s+/g, ' ')
  return singleLine.length > 100 ? `${singleLine.slice(0, 97)}...` : singleLine
})

function getBindingModelSummary(binding: CapabilityBinding): string {
  const count = binding.models?.length ?? 0

  if (count === 0) {
    return t('settings.intelligence.capabilityBindingModelsDesc')
  }

  return t('settings.intelligence.capabilityModelCount', { count })
}

watch(
  () => props.capability.promptTemplate,
  (value) => {
    syncingFromProps = true
    promptValue.value = value || ''
    syncingFromProps = false
  }
)

function flushPrompt(): void {
  if (syncingFromProps) return
  emits('updatePrompt', promptValue.value)
}

function schedulePromptSync(): void {
  if (syncingFromProps) return
  if (promptTimer) {
    clearTimeout(promptTimer)
  }
  promptTimer = window.setTimeout(() => {
    flushPrompt()
    promptTimer = null
  }, 800)
}

watch(promptValue, () => {
  schedulePromptSync()
})

watch(
  () => props.capability.id,
  () => {
    flushPrompt()
  }
)

function handleProviderFocus(providerId: string): void {
  focusedProviderId.value = providerId
}

function emitProvidersOrder(bindings: CapabilityBinding[]): void {
  const reordered = bindings.map((binding, index) => {
    const { provider, ...rest } = binding
    return {
      ...rest,
      priority: index + 1
    }
  })
  emits('reorderProviders', reordered)
}

function handleModelTransferUpdates(models: string[]): void {
  if (!focusedProviderId.value) return
  emits('updateModels', focusedProviderId.value, models)
}

function resolveDialogSource(event?: MouseEvent): HTMLElement | null {
  return event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function openModelDialogForProvider(providerId: string, event?: MouseEvent): void {
  focusedProviderId.value = providerId
  openModelDialog(event)
}

function openModelDialog(event?: MouseEvent): void {
  if (!focusedProvider.value) return
  if (!canEditModels.value) return
  modelDialogSource.value = resolveDialogSource(event)
  showModelDialog.value = true
}

function openPromptDrawer(): void {
  showPromptDrawer.value = true
}

function openTestDrawer(): void {
  showTestDrawer.value = true
}

function handleTest(options?: {
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
  userInput?: string
}): void {
  if (props.isTesting) return
  emits('test', options)
}

const saveStatusIcon = computed(() => {
  if (props.isSaving) return 'i-carbon-renew animate-spin'
  if (props.saveState === 'saved') return 'i-carbon-checkmark'
  if (props.saveState === 'error') return 'i-carbon-warning-alt'
  if (props.hasPendingChanges) return 'i-carbon-dot-mark'
  return 'i-carbon-checkmark-outline'
})

const saveStatusText = computed(() => {
  if (props.isSaving) return t('settings.intelligence.capabilitySaveSaving')
  if (props.saveState === 'saved') return t('settings.intelligence.capabilitySaveSaved')
  if (props.saveState === 'error') {
    const detail = props.saveErrorDetail?.trim()
    return detail
      ? t('settings.intelligence.capabilitySaveErrorWithDetail', { detail })
      : t('settings.intelligence.capabilitySaveError')
  }
  if (props.hasPendingChanges) return t('settings.intelligence.capabilitySavePending')
  return t('settings.intelligence.capabilitySaveIdle')
})

function handleManualSave(): void {
  if (promptTimer) {
    clearTimeout(promptTimer)
    promptTimer = null
  }
  flushPrompt()
  emits('save')
}

watch(
  () => [props.providers, props.capability.id],
  () => {
    if (!props.providers.length) {
      focusedProviderId.value = ''
      return
    }
    if (
      focusedProviderId.value &&
      props.providers.some((provider) => provider.id === focusedProviderId.value)
    ) {
      return
    }
    const firstActive = props.capability.providers?.find(
      (binding) => binding.enabled !== false
    )?.providerId
    focusedProviderId.value = firstActive ?? props.providers[0].id
  },
  { immediate: true, deep: true }
)

onBeforeUnmount(() => {
  if (promptTimer) {
    clearTimeout(promptTimer)
  }
  flushPrompt()
})
</script>

<template>
  <TouchScroll>
    <template #header>
      <CapabilityHeader :capability="capability">
        <template #notice>
          {{ t('settings.intelligence.capabilityFooterHint') }}
        </template>
        <template #actions>
          <TxButton
            class="capability-info__test-button"
            variant="flat"
            type="primary"
            :disabled="activeBindingCount === 0"
            @click="openTestDrawer"
          >
            <i class="i-carbon-play-filled" aria-hidden="true" />
            <span>{{ t('settings.intelligence.capabilityTest') }}</span>
          </TxButton>
        </template>
      </CapabilityHeader>
    </template>

    <template #default>
      <CapabilityOverview
        :active-count="activeBindingCount"
        :total-bindings="capability.providers?.length || 0"
        :total-models="totalModelsCount"
      />

      <TuffGroupBlock
        :name="t('settings.intelligence.capabilityProviderSectionTitle')"
        :description="t('settings.intelligence.capabilityProviderSectionDesc')"
        default-icon="i-carbon-api-1"
        active-icon="i-carbon-api-1"
        :memory-name="`capability-providers-${capability.id}`"
      >
        <template #default>
          <ProviderList
            :enabled-bindings="enabledBindings"
            :disabled-bindings="disabledProviders"
            @focus="handleProviderFocus"
            @reorder="emitProvidersOrder"
          />
        </template>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('settings.intelligence.capabilityConfigTitle')"
        :description="t('settings.intelligence.capabilityConfigDesc')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings"
        :memory-name="`capability-config-${capability.id}`"
      >
        <template #default>
          <TuffBlockSlot
            v-for="binding in enabledBindings"
            :key="`model-${binding.providerId}`"
            :title="binding.provider?.name || binding.providerId"
            :description="getBindingModelSummary(binding)"
            default-icon="i-carbon-model"
            :active="!!binding.models?.length"
            @click="openModelDialogForProvider(binding.providerId, $event)"
          >
            <TxButton
              variant="flat"
              type="primary"
              @click.stop="openModelDialogForProvider(binding.providerId, $event)"
            >
              <i class="i-carbon-settings" aria-hidden="true" />
              <span>{{ t('settings.intelligence.manageModels') }}</span>
            </TxButton>
          </TuffBlockSlot>

          <TuffBlockSlot
            v-if="enabledBindings.length === 0"
            :title="t('settings.intelligence.capabilityBindingModelsTitle')"
            :description="t('settings.intelligence.capabilityBindingModelsDesc')"
            default-icon="i-carbon-model"
          />

          <TuffBlockSlot
            :title="t('settings.intelligence.capabilityPromptSectionTitle')"
            :description="promptSummary"
            default-icon="i-carbon-notebook"
            @click="openPromptDrawer"
          >
            <TxButton variant="flat" type="text" @click.stop="openPromptDrawer">
              <i class="i-carbon-edit" aria-hidden="true" />
              <span>{{ t('settings.intelligence.editPrompt') }}</span>
            </TxButton>
          </TuffBlockSlot>
        </template>
      </TuffGroupBlock>

      <div class="capability-info__save-bar" role="status">
        <div class="capability-info__save-status">
          <i :class="saveStatusIcon" aria-hidden="true" />
          <span>{{ saveStatusText }}</span>
        </div>
        <TxButton
          variant="flat"
          type="primary"
          :disabled="isSaving"
          :aria-busy="isSaving"
          @click="handleManualSave"
        >
          <i class="i-carbon-save" aria-hidden="true" />
          <span>{{ t('settings.intelligence.capabilitySaveButton') }}</span>
        </TxButton>
      </div>
    </template>
  </TouchScroll>

  <FlipDialog
    v-model="showModelDialog"
    :reference="modelDialogSource"
    :header-title="t('settings.intelligence.capabilityBindingModelsTitle')"
    :header-desc="focusedProvider?.name || focusedProviderId"
    size="xl"
    max-height="calc(86dvh - 24px)"
  >
    <CapabilityModelTransfer
      :scope-key="focusedProviderId"
      :model-value="focusedBinding?.models || []"
      :available-models="focusedProvider?.models || []"
      :disabled="!canEditModels"
      @update:model-value="handleModelTransferUpdates"
    />
  </FlipDialog>

  <TuffDrawer
    v-model:visible="showPromptDrawer"
    :title="t('settings.intelligence.capabilityPromptSectionTitle')"
  >
    <div class="capability-info__drawer">
      <p class="capability-info__drawer-description">
        {{ t('settings.intelligence.capabilityPromptSectionDesc') }}
      </p>
      <FlatMarkdown v-model="promptValue" :readonly="false" />
    </div>
  </TuffDrawer>

  <TuffDrawer
    v-model:visible="showTestDrawer"
    :title="t('settings.intelligence.capabilityTestTitle')"
  >
    <div class="capability-info__drawer">
      <p class="capability-info__drawer-description">
        {{ t('settings.intelligence.capabilityTestDesc') }}
      </p>
      <TestSection
        :capability-id="capability.id"
        :is-testing="isTesting"
        :disabled="activeBindingCount === 0"
        :test-result="testResult"
        :enabled-bindings="enabledBindings"
        @test="handleTest"
      />
    </div>
  </TuffDrawer>
</template>

<style lang="scss" scoped>
.capability-info__config-section {
  margin: 1rem 0 0.5rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--tx-border-color-lighter);
}

.config-section__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--tx-text-color-primary);
}

.config-section__description {
  font-size: 0.875rem;
  color: var(--tx-text-color-secondary);
  margin: 0;
}

:deep(.TGroupBlock-Header .TGroupBlock-Label > h3),
:deep(.TBlockSlot-TitleRow > h5) {
  font-size: 1rem;
}

.capability-info__test-button {
  min-width: 7.5rem;
}

.capability-info__drawer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.capability-info__drawer-description {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.9rem;
}

.capability-info__drawer :deep(.FlatMarkdown-Container) {
  min-height: 280px;
}

.capability-info__save-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1rem 0 0;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--tx-border-color-lighter);
  background: color-mix(in srgb, var(--tx-bg-color) 92%, transparent);
  backdrop-filter: blur(16px);
}

.capability-info__save-status {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.875rem;
  line-height: 1.45;

  span {
    overflow: hidden;
    overflow-wrap: anywhere;
  }
}
</style>
