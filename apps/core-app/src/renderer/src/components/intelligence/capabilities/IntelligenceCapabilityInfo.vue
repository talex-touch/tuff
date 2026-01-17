<script lang="ts" name="IntelligenceCapabilityInfo" setup>
import type {
  AiCapabilityProviderBinding,
  AISDKCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/utils/types/intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
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
  capability: AISDKCapabilityConfig
  providers: IntelligenceProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
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
      promptVariables?: Record<string, any>
      userInput?: string
    }
  ]
  reorderProviders: [bindings: AiCapabilityProviderBinding[]]
}>()

const { t } = useI18n()

const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDrawer = ref(false)
const showPromptDrawer = ref(false)
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

const modelSummary = computed(() => {
  if (!focusedProvider.value) {
    return t('settings.intelligence.selectProviderHint')
  }

  if (!selectedProviderIds.value.has(focusedProvider.value.id)) {
    const hint = t('settings.intelligence.capabilityBindingModelsEnableHint')
    return hint === 'settings.intelligence.capabilityBindingModelsEnableHint'
      ? '开启渠道后再配置模型'
      : hint
  }

  const count = focusedBinding.value?.models?.length ?? 0
  if (count === 0) {
    return t('settings.intelligence.capabilityBindingModelsDesc')
  }

  return t('settings.intelligence.capabilityBindingsStat', { count })
})

const promptSummary = computed(() => {
  const trimmed = (promptValue.value || '').trim()
  if (!trimmed) {
    return t('settings.intelligence.capabilityPromptSectionDesc')
  }

  const singleLine = trimmed.replace(/\s+/g, ' ')
  return singleLine.length > 100 ? `${singleLine.slice(0, 97)}...` : singleLine
})

const modelTransferDescription = computed(() => {
  if (!focusedProvider.value) {
    return t('settings.intelligence.capabilityBindingModelsDesc')
  }
  if (!selectedProviderIds.value.has(focusedProvider.value.id)) {
    const hint = t('settings.intelligence.capabilityBindingModelsEnableHint')
    return hint === 'settings.intelligence.capabilityBindingModelsEnableHint'
      ? '开启渠道后再配置模型'
      : hint
  }
  return t('settings.intelligence.capabilityBindingModelsDesc')
})

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

function handleProviderToggle(providerId: string, enabled: boolean): void {
  emits('toggleProvider', providerId, enabled)
  if (enabled) {
    focusedProviderId.value = providerId
  }
}

function handleProviderCardClick(providerId: string): void {
  const currentlyEnabled = selectedProviderIds.value.has(providerId)
  handleProviderToggle(providerId, !currentlyEnabled)
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

function openModelDrawer(): void {
  if (!canEditModels.value) return
  showModelDrawer.value = true
}

function openPromptDrawer(): void {
  showPromptDrawer.value = true
}

function handleTest(options?: {
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, any>
  userInput?: string
}): void {
  if (props.isTesting) return
  emits('test', options)
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
      <CapabilityHeader :capability="capability" />
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
            :focused-provider-id="focusedProviderId"
            @select="handleProviderCardClick"
            @reorder="emitProvidersOrder"
          />
        </template>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="focusedProvider?.name || t('settings.intelligence.capabilityBindingModelsTitle')"
        :description="modelTransferDescription"
        default-icon="i-carbon-model"
        active-icon="i-carbon-model"
        :memory-name="`capability-models-${capability.id}`"
      >
        <template #default>
          <TuffBlockSlot
            :title="modelSummary"
            default-icon="i-carbon-model"
            @click="openModelDrawer"
          >
            <FlatButton primary :disabled="!canEditModels">
              <i class="i-carbon-settings" aria-hidden="true" />
              <span>{{ t('settings.intelligence.manageModels') }}</span>
            </FlatButton>
          </TuffBlockSlot>
        </template>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('settings.intelligence.capabilityPromptSectionTitle')"
        :description="t('settings.intelligence.capabilityPromptSectionDesc')"
        default-icon="i-carbon-notebook"
        active-icon="i-carbon-notebook"
        :memory-name="`capability-prompt-${capability.id}`"
      >
        <template #default>
          <TuffBlockSlot
            :title="promptSummary"
            default-icon="i-carbon-notebook"
            @click="openPromptDrawer"
          >
            <FlatButton text>
              <i class="i-carbon-edit" aria-hidden="true" />
              <span>{{ t('settings.intelligence.editPrompt') }}</span>
            </FlatButton>
          </TuffBlockSlot>
        </template>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('settings.intelligence.capabilityTestTitle')"
        :description="t('settings.intelligence.capabilityTestDesc')"
        default-icon="i-carbon-flash"
        active-icon="i-carbon-flash"
        :memory-name="`capability-test-${capability.id}`"
      >
        <template #default>
          <TestSection
            :capability-id="capability.id"
            :is-testing="isTesting"
            :disabled="activeBindingCount === 0"
            :test-result="testResult"
            :enabled-bindings="enabledBindings"
            @test="handleTest"
          />
        </template>
      </TuffGroupBlock>

      <div class="capability-info__footer">
        <span class="capability-info__footer-text">
          {{ t('settings.intelligence.capabilityFooterHint') }}
        </span>
      </div>
    </template>
  </TouchScroll>

  <TuffDrawer
    v-model:visible="showModelDrawer"
    :title="t('settings.intelligence.capabilityBindingModelsTitle')"
  >
    <CapabilityModelTransfer
      :model-value="focusedBinding?.models || []"
      :available-models="focusedProvider?.models || []"
      :disabled="!canEditModels"
      @update:model-value="handleModelTransferUpdates"
    />
  </TuffDrawer>

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
</template>

<style lang="scss" scoped>
.capability-info__config-section {
  margin: 1rem 0 0.5rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--el-border-color-lighter);
}

.config-section__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

.config-section__description {
  font-size: 0.875rem;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.capability-info__drawer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.capability-info__drawer-description {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.capability-info__drawer :deep(.FlatMarkdown-Container) {
  min-height: 280px;
}

.capability-info__footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  text-align: center;
}

.capability-info__footer-text {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}
</style>
