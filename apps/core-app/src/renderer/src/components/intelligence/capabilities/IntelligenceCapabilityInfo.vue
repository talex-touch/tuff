<script lang="ts" name="IntelligenceCapabilityInfo" setup>
import type {
  IntelligenceCapabilityProviderBinding,
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import { TxButton } from '@talex-touch/tuffex/button'
import {
  getVoiceCapabilityRecommendedModels,
  isOnDeviceAsrBinding
} from '@talex-touch/utils/intelligence/voice-asr'
import { useI18n } from 'vue-i18n'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import CapabilityHeader from './CapabilityHeader.vue'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import CapabilityOverview from './CapabilityOverview.vue'
import ProviderList from './ProviderList.vue'
import TestSection from './TestSection.vue'

/**
 * One built-in skill's editor: its channels, the models each channel tries, its prompt, and a test.
 *
 * It shows what it is given and reports every edit; where an edit goes is the owner's decision. The
 * skills page keeps edits in a draft until the user saves, so the test — which runs against the
 * saved configuration — is held back while there is anything unsaved (`testBlockedReason`).
 */
const props = defineProps<{
  capability: IntelligenceCapabilityConfig
  providers: IntelligenceProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
  /** Why the test cannot run now, said beside the disabled test button. */
  testBlockedReason?: string
}>()

const emits = defineEmits<{
  toggleProvider: [providerId: string, enabled: boolean]
  updateModels: [providerId: string, value: string[]]
  updatePrompt: [capabilityId: string, prompt: string]
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
}>()

const { t } = useI18n()

/**
 * The prompt draft and the capability it belongs to. `savedPrompt` is what the store holds for
 * `draftOwner`: only a draft that differs from it is an edit, and only an edit is ever written.
 *
 * Writing on every unmount is what let a stale page corrupt prompts on 2026-09-15. The settings page
 * is KeepAlive-cached, and Vue's HMR does not replace a deactivated cached instance, so after this
 * editor started emitting `(capabilityId, prompt)` the cached page still took the first argument as
 * the prompt — and each plain click between capabilities wrote the outgoing capability's id into
 * the next one's prompt.
 */
let draftOwner = props.capability.id
let savedPrompt = props.capability.promptTemplate || ''
const promptValue = ref(savedPrompt)
const focusedProviderId = ref<string>('')
const showModelDrawer = ref(false)
const showPromptDrawer = ref(false)
const showTestDrawer = ref(false)
const testHintId = useId()
let promptTimer: number | null = null

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
const isBindingOnlyTest = computed(() => props.capability.id === 'audio.asr')
const testDescription = computed(() =>
  isBindingOnlyTest.value
    ? t('settings.intelligence.capabilityAsrBindingTestDesc')
    : t('settings.skillsPage.testDesc')
)

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

/**
 * The bindings this editor shows: everything bound except the program-owned on-device channel, which
 * main seeds and binds from the installed speech models and which offers nothing to configure.
 *
 * `enabledBindings` stays complete on purpose. It is the array a reorder writes back, so filtering it
 * there would unbind the installed models from dictation the first time the user touched any other
 * channel; only the lists the user reads, tests, and edits lose the entry.
 */
const shownBindings = computed<CapabilityBinding[]>(() =>
  enabledBindings.value.filter((binding) => !isOnDeviceAsrBinding(binding))
)

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

const focusedProviderModels = computed(() => {
  const provider = focusedProvider.value
  if (!provider) return []
  const recommendations = getVoiceCapabilityRecommendedModels(props.capability.id, {
    ...(provider.metadata ?? {}),
    baseUrl: provider.baseUrl
  })
  if (recommendations.length > 0) return recommendations
  return (provider.models ?? []).map((binding) => binding.id)
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

/** What the open model drawer is editing, shown under its provider name. */
const focusedModelSummary = computed(() =>
  focusedBinding.value
    ? getBindingModelSummary(focusedBinding.value)
    : t('settings.intelligence.capabilityBindingModelsDesc')
)

function cancelPromptSync(): void {
  if (promptTimer === null) return
  clearTimeout(promptTimer)
  promptTimer = null
}

/**
 * Writes the pending edit, if there is one, under the capability it was typed for. The last edit is
 * flushed from `onBeforeUnmount`, which runs after the page has already switched selection, so the
 * owner travels with the draft rather than being read from whatever is selected now.
 */
function flushPrompt(): void {
  cancelPromptSync()
  if (promptValue.value === savedPrompt) return
  savedPrompt = promptValue.value
  emits('updatePrompt', draftOwner, savedPrompt)
}

watch(promptValue, (value) => {
  cancelPromptSync()
  if (value === savedPrompt) return
  promptTimer = window.setTimeout(flushPrompt, 800)
})

/**
 * Store → editor. A value arriving from the store is the saved prompt, not an edit, so it is never
 * written back. A different capability (the editor reused rather than re-mounted) first flushes the
 * outgoing draft under its own id.
 */
watch(
  [() => props.capability.id, () => props.capability.promptTemplate || ''],
  ([capabilityId, template]) => {
    if (capabilityId !== draftOwner) {
      flushPrompt()
      draftOwner = capabilityId
    }
    savedPrompt = template
    promptValue.value = template
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

function openModelDrawerForProvider(providerId: string): void {
  focusedProviderId.value = providerId
  if (!focusedProvider.value) return
  if (!canEditModels.value) return
  showModelDrawer.value = true
}

function openPromptDrawer(): void {
  showPromptDrawer.value = true
}

/**
 * A prompt still being typed is an edit the owner has not heard of yet, so it is handed over first;
 * if that leaves the owner with unsaved changes, the test stays closed and the button says why.
 */
async function openTestDrawer(): Promise<void> {
  flushPrompt()
  await nextTick()
  if (props.testBlockedReason) return
  showTestDrawer.value = true
}

function handleTest(options?: {
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, unknown>
  userInput?: string
}): void {
  if (props.isTesting || props.testBlockedReason) return
  emits('test', options)
}

/** A nested drawer is open: an Escape meant for it is not a request to close the owner's. */
function hasOpenDrawer(): boolean {
  return showModelDrawer.value || showPromptDrawer.value || showTestDrawer.value
}

defineExpose({ flushPrompt, hasOpenDrawer })

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
  flushPrompt()
})
</script>

<template>
  <div class="capability-info">
    <CapabilityHeader :capability="capability">
      <template #actions>
        <div class="capability-info__header-actions">
          <TxButton
            class="capability-info__test-button"
            variant="flat"
            type="primary"
            :disabled="shownBindings.length === 0 || Boolean(testBlockedReason)"
            :aria-describedby="testBlockedReason ? testHintId : undefined"
            @click="openTestDrawer"
          >
            <i class="i-carbon-play-filled" aria-hidden="true" />
            <span>{{ t('settings.intelligence.capabilityTest') }}</span>
          </TxButton>
          <p v-if="testBlockedReason" :id="testHintId" class="capability-info__test-hint">
            {{ testBlockedReason }}
          </p>
        </div>
      </template>
    </CapabilityHeader>

    <div class="capability-info__body">
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
            :capability-id="capability.id"
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
            v-for="binding in shownBindings"
            :key="`model-${binding.providerId}`"
            :title="binding.provider?.name || binding.providerId"
            :description="getBindingModelSummary(binding)"
            default-icon="i-carbon-model"
            :active="!!binding.models?.length"
            @click="openModelDrawerForProvider(binding.providerId)"
          >
            <TxButton
              variant="flat"
              type="primary"
              @click.stop="openModelDrawerForProvider(binding.providerId)"
            >
              <i class="i-carbon-settings" aria-hidden="true" />
              <span>{{ t('settings.intelligence.manageModels') }}</span>
            </TxButton>
          </TuffBlockSlot>

          <TuffBlockSlot
            v-if="shownBindings.length === 0"
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
    </div>
  </div>

  <TxDrawer
    v-model:visible="showModelDrawer"
    :title="t('settings.intelligence.capabilityBindingModelsTitle')"
  >
    <div class="capability-info__drawer">
      <p class="capability-info__drawer-description">
        {{ focusedProvider?.name || focusedProviderId }} · {{ focusedModelSummary }}
      </p>
      <CapabilityModelTransfer
        :scope-key="focusedProviderId"
        :model-value="focusedBinding?.models || []"
        :available-models="focusedProviderModels"
        :disabled="!canEditModels"
        @update:model-value="handleModelTransferUpdates"
      />
    </div>
  </TxDrawer>

  <TxDrawer
    v-model:visible="showPromptDrawer"
    :title="t('settings.intelligence.capabilityPromptSectionTitle')"
  >
    <div class="capability-info__drawer">
      <p class="capability-info__drawer-description">
        {{ t('settings.intelligence.capabilityPromptSectionDesc') }}
      </p>
      <FlatMarkdown v-model="promptValue" :readonly="false" />
    </div>
  </TxDrawer>

  <TxDrawer v-model:visible="showTestDrawer" :title="t('settings.skillsPage.testTitle')">
    <div class="capability-info__drawer">
      <p class="capability-info__drawer-description">
        {{ testDescription }}
      </p>
      <TestSection
        :capability-id="capability.id"
        :is-testing="isTesting"
        :disabled="shownBindings.length === 0"
        :test-result="testResult"
        :enabled-bindings="shownBindings"
        :binding-only="isBindingOnlyTest"
        @test="handleTest"
      />
    </div>
  </TxDrawer>
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

.capability-info__header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.375rem;
  max-width: 100%;
}

.capability-info__test-hint {
  max-width: 14rem;
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
  line-height: 1.4;
  text-align: right;
}

.capability-info__body {
  padding-top: 0.75rem;
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
</style>
