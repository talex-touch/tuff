<script lang="ts" name="IntelligenceCapabilityDetails" setup>
import type {
  IntelligenceCapabilityConfig,
  IntelligenceCapabilityProviderBinding,
  IntelligenceProviderConfig,
} from '@talex-touch/tuff-intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import CapabilityTestDialog from './CapabilityTestDialog.vue'
import CapabilityTestResultView from './CapabilityTestResult.vue'
import ProviderList from './ProviderList.vue'

const props = defineProps<{
  capability: IntelligenceCapabilityConfig
  providers: IntelligenceProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
}>()

const emits = defineEmits<{
  toggleProvider: [providerId: string, enabled: boolean]
  updateModels: [providerId: string, value: string[]]
  updatePrompt: [prompt: string]
  test: [params?: { providerId?: string, userInput?: string }]
  reorderProviders: [bindings: IntelligenceCapabilityProviderBinding[]]
}>()

const { t } = useI18n()
const intelligence = useIntelligenceSdk()
const capabilityDetailsLog = createRendererLogger('IntelligenceCapabilityDetails')
const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDialog = ref(false)
const showPromptDrawer = ref(false)
const showTestDialog = ref(false)
const modelDialogSource = ref<HTMLElement | null>(null)
const testMeta = ref({ requiresUserInput: false, inputHint: '' })
const testEligibleProviderIds = ref<Set<string> | null>(null)
let promptTimer: number | null = null
let syncingFromProps = false

const providerMetaMap = computed(
  () => new Map(props.providers.map(provider => [provider.id, provider])),
)

const selectedProviderIds = computed(() => {
  return new Set(
    (props.capability.providers || [])
      .filter(binding => binding.enabled !== false)
      .map(binding => binding.providerId),
  )
})

const activeBindingCount = computed(() => selectedProviderIds.value.size)

const bindingMap = computed(() => {
  const map = new Map<string, CapabilityBinding>()
  props.bindings.forEach((binding) => {
    map.set(binding.providerId, binding)
  })
  return map
})

const enabledBindings = computed<CapabilityBinding[]>(() => {
  return (props.capability.providers || [])
    .filter(binding => binding.enabled !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map(binding => ({
      ...binding,
      provider: providerMetaMap.value.get(binding.providerId),
    }))
})

const disabledProviders = computed<CapabilityBinding[]>(() => {
  const enabledIds = new Set(enabledBindings.value.map(binding => binding.providerId))
  const disabledSet = new Set<string>()
  const leftover = (props.capability.providers || [])
    .filter(binding => binding.enabled === false)
    .map((binding) => {
      disabledSet.add(binding.providerId)
      return {
        ...binding,
        provider: providerMetaMap.value.get(binding.providerId),
      }
    })

  const remaining = props.providers
    .filter(provider => !enabledIds.has(provider.id) && !disabledSet.has(provider.id))
    .map(provider => ({
      providerId: provider.id,
      enabled: false,
      priority: undefined,
      provider,
    }))

  return [...leftover, ...remaining]
})

const focusedProvider = computed(
  () => props.providers.find(provider => provider.id === focusedProviderId.value) || null,
)

const focusedBinding = computed(() => {
  if (!focusedProviderId.value)
    return null
  return bindingMap.value.get(focusedProviderId.value) ?? null
})

const canEditModels = computed(() => {
  return !!focusedProvider.value && selectedProviderIds.value.has(focusedProviderId.value)
})

function getBindingModelSummary(binding: CapabilityBinding): string {
  const count = binding.models?.length ?? 0

  if (count === 0) {
    return t('settings.intelligence.capabilityBindingModelsDesc')
  }

  return t('settings.intelligence.capabilityModelCount', { count })
}

const promptSummary = computed(() => {
  const trimmed = (promptValue.value || '').trim()
  if (!trimmed) {
    return t('settings.intelligence.capabilityPromptSectionDesc')
  }

  const singleLine = trimmed.replace(/\s+/g, ' ')
  return singleLine.length > 100 ? `${singleLine.slice(0, 97)}...` : singleLine
})

const testSummary = computed(() => {
  if (!props.testResult)
    return ''
  const pieces: string[] = []
  if (props.testResult.provider)
    pieces.push(props.testResult.provider)
  if (props.testResult.model)
    pieces.push(props.testResult.model)
  if (props.testResult.latency)
    pieces.push(`${props.testResult.latency}ms`)
  if (props.testResult.tokensPerSecond)
    pieces.push(`${props.testResult.tokensPerSecond}/s`)
  return pieces.join(' · ')
})

const enabledProvidersForTest = computed(() => {
  const eligibleProviderIds = testEligibleProviderIds.value
  return props.providers.filter(
    provider =>
      selectedProviderIds.value.has(provider.id)
      && provider.enabled
      && (eligibleProviderIds === null || eligibleProviderIds.has(provider.id)),
  )
})

watch(
  () => props.capability.promptTemplate,
  (value) => {
    syncingFromProps = true
    promptValue.value = value || ''
    syncingFromProps = false
  },
)

function flushPrompt(): void {
  if (syncingFromProps)
    return
  emits('updatePrompt', promptValue.value)
}

function schedulePromptSync(): void {
  if (syncingFromProps)
    return
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
  },
)

function handleProviderFocus(providerId: string): void {
  focusedProviderId.value = providerId
}

function emitProvidersOrder(bindings: CapabilityBinding[]): void {
  const reordered = bindings.map((binding, index) => {
    const { provider: _provider, ...rest } = binding
    return {
      ...rest,
      priority: index + 1,
    }
  })
  emits('reorderProviders', reordered)
}

function handleModelTransferUpdates(models: string[]): void {
  if (!focusedProviderId.value)
    return
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
  if (!canEditModels.value)
    return
  modelDialogSource.value = resolveDialogSource(event)
  showModelDialog.value = true
}

function openPromptDrawer(): void {
  showPromptDrawer.value = true
}

async function handleTest(): Promise<void> {
  if (props.isTesting)
    return

  try {
    const [meta, providerOptions] = await Promise.all([
      intelligence.getCapabilityTestMeta({ capabilityId: props.capability.id }),
      intelligence.getProviderModelOptions({ capabilityId: props.capability.id }),
    ])
    testMeta.value = meta
    testEligibleProviderIds.value = new Set(
      providerOptions.filter(provider => provider.available).map(provider => provider.providerId),
    )
    showTestDialog.value = true
  }
  catch (error) {
    capabilityDetailsLog.error('Failed to prepare capability test:', error)
    testMeta.value = { requiresUserInput: false, inputHint: '' }
    testEligibleProviderIds.value = new Set()
    showTestDialog.value = true
  }
}

function handleTestWithParams(providerId: string, userInput?: string): void {
  showTestDialog.value = false
  emits('test', { providerId, userInput })
}

watch(
  () => [props.providers, props.capability.id],
  () => {
    if (!props.providers.length) {
      focusedProviderId.value = ''
      return
    }
    if (
      focusedProviderId.value
      && props.providers.some(provider => provider.id === focusedProviderId.value)
    ) {
      return
    }
    const firstActive = props.capability.providers?.find(
      binding => binding.enabled !== false,
    )?.providerId
    focusedProviderId.value = firstActive ?? props.providers[0].id
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  if (promptTimer) {
    clearTimeout(promptTimer)
  }
  flushPrompt()
})
</script>

<template>
  <TxScroll class="capability-details-touch h-full flex flex-col">
    <template #header>
      <div class="capability-details-header">
        <div>
          <p class="capability-details__eyebrow">
            {{ capability.id }}
          </p>
          <h1>{{ capability.label || capability.id }}</h1>
          <p class="capability-details__description">
            {{ capability.description }}
          </p>
          <div class="capability-details__badges">
            <span class="capability-details__badge">
              <i class="i-carbon-flow-logs" aria-hidden="true" />
              {{
                t('settings.intelligence.capabilityProvidersStat', { count: activeBindingCount })
              }}
            </span>
            <span class="capability-details__badge capability-details__badge--muted">
              <i class="i-carbon-catalog" aria-hidden="true" />
              {{
                t('settings.intelligence.capabilityBindingsStat', {
                  count: capability.providers?.length || 0,
                })
              }}
            </span>
          </div>
        </div>
        <TxButton
          class="test-button"
          variant="flat"
          type="primary"
          :disabled="isTesting"
          :aria-busy="isTesting"
          @click="handleTest"
        >
          <i
            :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'"
            aria-hidden="true"
          />
          <span>{{
            isTesting
              ? t('settings.intelligence.testing')
              : t('settings.intelligence.capabilityTest')
          }}</span>
        </TxButton>
      </div>
    </template>

    <div class="capability-details-body">
      <TuffGroupBlock
        :name="t('settings.intelligence.capabilityProviderSectionTitle')"
        :description="t('settings.intelligence.capabilityProviderSectionDesc')"
        default-icon="i-carbon-api-1"
        active-icon="i-carbon-api-1"
        :memory-name="`capability-actions-${capability.id}`"
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

      <div class="capability-details__secondary">
        <TuffBlockSlot
          v-for="binding in enabledBindings"
          :key="`model-${binding.providerId}`"
          :title="binding.provider?.name || binding.providerId"
          :description="getBindingModelSummary(binding)"
          default-icon="i-carbon-model"
          active-icon="i-carbon-model"
          :active="!!binding.models?.length"
          guidance
        >
          <template #default>
            <div class="capability-details__slot-row">
              <p class="capability-details__slot-summary">
                {{ getBindingModelSummary(binding) }}
              </p>
              <TxButton
                variant="flat"
                type="primary"
                @click="openModelDialogForProvider(binding.providerId, $event)"
              >
                <i class="i-carbon-settings" aria-hidden="true" />
                <span>{{ t('settings.intelligence.manageModels') }}</span>
              </TxButton>
            </div>
          </template>
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="enabledBindings.length === 0"
          :title="t('settings.intelligence.capabilityBindingModelsTitle')"
          :description="t('settings.intelligence.capabilityBindingModelsDesc')"
          default-icon="i-carbon-model"
          active-icon="i-carbon-model"
          guidance
        />

        <TuffBlockSlot
          :title="t('settings.intelligence.capabilityPromptSectionTitle')"
          :description="t('settings.intelligence.capabilityPromptSectionDesc')"
          default-icon="i-carbon-notebook"
          active-icon="i-carbon-notebook"
          guidance
        >
          <template #default>
            <div class="capability-details__slot-row">
              <p class="capability-details__slot-summary">
                {{ promptSummary }}
              </p>
              <TxButton variant="flat" type="text" @click="openPromptDrawer">
                <i class="i-carbon-edit" aria-hidden="true" />
                <span>{{ t('settings.intelligence.editPrompt') }}</span>
              </TxButton>
            </div>
          </template>
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="testResult"
          :title="t('settings.intelligence.latestTestResult')"
          :description="testSummary"
          default-icon="i-carbon-result"
          active-icon="i-carbon-result"
          :active="true"
        >
          <CapabilityTestResultView :result="testResult" />
        </TuffBlockSlot>
      </div>
    </div>
  </TxScroll>

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
    <div class="capability-details__drawer">
      <p class="capability-details__drawer-description">
        {{ t('settings.intelligence.capabilityPromptSectionDesc') }}
      </p>
      <FlatMarkdown v-model="promptValue" :readonly="false" />
    </div>
  </TuffDrawer>

  <CapabilityTestDialog
    v-model="showTestDialog"
    :capability-id="capability.id"
    :enabled-providers="enabledProvidersForTest"
    :is-testing="isTesting"
    :test-meta="testMeta"
    @test="handleTestWithParams"
  />
</template>

<style lang="scss" scoped>
.capability-details-touch {
  width: 100%;
  height: 100%;
}

.capability-details-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--tx-bg-color);
  border-radius: 1.25rem;
  border: 1px solid var(--tx-border-color-lighter);
}

.capability-details__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.capability-details__description {
  margin: 0.25rem 0;
  color: var(--tx-text-color-secondary);
  max-width: 42rem;
}

.capability-details__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.capability-details__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #4c1d95;
  font-size: 0.8rem;

  &--muted {
    background: var(--tx-fill-color-light);
    color: var(--tx-text-color-secondary);
  }
}

.capability-details-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  flex: 1;
}

.capability-details__secondary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.capability-details__slot-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.capability-details__slot-summary {
  flex: 1;
  margin: 0;
  font-size: 0.95rem;
  color: var(--tx-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-details__drawer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.capability-details__drawer-description {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.9rem;
}

.capability-details__drawer :deep(.FlatMarkdown-Container) {
  min-height: 280px;
}
</style>
