<template>
  <TouchScroll class="capability-info h-full">
    <template #header>
      <header class="capability-info__header">
        <div class="capability-info__header-content">
          <p class="capability-info__id">{{ capability.id }}</p>
          <h1 class="capability-info__title">{{ capability.label || capability.id }}</h1>
          <p class="capability-info__description">{{ capability.description }}</p>
        </div>
      </header>
    </template>

    <template #default>
      <div class="capability-info__body">
        <!-- 能力概览信息 -->
        <div class="capability-info__overview">
          <div class="overview-card">
            <div class="overview-card__item">
              <i class="i-carbon-flow-logs overview-card__icon" />
              <div class="overview-card__content">
                <span class="overview-card__label">{{
                  t('settings.intelligence.activeProviders')
                }}</span>
                <span class="overview-card__value">{{ activeBindingCount }}</span>
              </div>
            </div>
            <div class="overview-card__item">
              <i class="i-carbon-catalog overview-card__icon" />
              <div class="overview-card__content">
                <span class="overview-card__label">{{
                  t('settings.intelligence.totalBindings')
                }}</span>
                <span class="overview-card__value">{{ capability.providers?.length || 0 }}</span>
              </div>
            </div>
            <div class="overview-card__item">
              <i class="i-carbon-model overview-card__icon" />
              <div class="overview-card__content">
                <span class="overview-card__label">{{
                  t('settings.intelligence.configuredModels')
                }}</span>
                <span class="overview-card__value">{{ totalModelsCount }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 配置参数区域 -->
        <div class="capability-info__config-section">
          <h2 class="config-section__title">
            {{ t('settings.intelligence.capabilityConfigTitle') }}
          </h2>
          <p class="config-section__description">
            {{ t('settings.intelligence.capabilityConfigDesc') }}
          </p>
        </div>

        <!-- 渠道配置 -->
        <TuffGroupBlock
          :name="t('settings.intelligence.capabilityProviderSectionTitle')"
          :description="t('settings.intelligence.capabilityProviderSectionDesc')"
          default-icon="i-carbon-api-1"
          active-icon="i-carbon-api-1"
          :memory-name="`capability-providers-${capability.id}`"
        >
          <template #default>
            <div class="config-param">
              <div class="config-param__section">
                <p class="config-param__label">
                  {{ t('settings.intelligence.capabilityActionsLabel') }}
                </p>
                <p class="config-param__hint">
                  {{ t('settings.intelligence.capabilityActionsHint') }}
                </p>
              </div>
              <div class="config-param__list">
                <div v-if="sortableEnabledBindings.length === 0" class="config-param__empty">
                  <p>{{ t('settings.intelligence.capabilityActionsEmpty') }}</p>
                </div>
                <draggable
                  v-else
                  v-model="sortableEnabledBindings"
                  item-key="providerId"
                  class="config-param__draggable"
                  :handle="'.provider-item__grab'"
                  @end="emitProvidersOrder"
                >
                  <template #item="{ element }">
                    <button
                      type="button"
                      class="provider-item"
                      :class="{ 'is-selected': focusedProviderId === element.providerId }"
                      @click="handleProviderCardClick(element.providerId)"
                    >
                      <i class="i-carbon-drag-horizontal provider-item__grab" aria-hidden="true" />
                      <div class="provider-item__content">
                        <span class="provider-item__name">{{
                          element.provider?.name || element.providerId
                        }}</span>
                        <span class="provider-item__meta">
                          {{ element.provider?.type || element.providerId }}
                          <span v-if="element.models?.length" class="provider-item__badge">
                            {{ element.models.length }} {{ t('settings.intelligence.models') }}
                          </span>
                        </span>
                      </div>
                      <i class="i-carbon-checkmark provider-item__check" aria-hidden="true" />
                    </button>
                  </template>
                </draggable>
              </div>

              <div v-if="disabledProviders.length" class="config-param__section">
                <p class="config-param__label">
                  {{ t('settings.intelligence.capabilityDisabledLabel') }}
                </p>
              </div>
              <div v-if="disabledProviders.length" class="config-param__disabled-list">
                <button
                  v-for="entry in disabledProviders"
                  :key="entry.providerId"
                  class="provider-item provider-item--disabled"
                  type="button"
                  @click="handleProviderCardClick(entry.providerId)"
                >
                  <div class="provider-item__content">
                    <span class="provider-item__name">{{
                      entry.provider?.name || entry.providerId
                    }}</span>
                    <span class="provider-item__meta">{{
                      entry.provider?.type || entry.providerId
                    }}</span>
                  </div>
                  <span class="provider-item__status">{{
                    t('settings.intelligence.disabled')
                  }}</span>
                </button>
              </div>
            </div>
          </template>
        </TuffGroupBlock>

        <!-- 模型配置 -->
        <TuffGroupBlock
          :name="focusedProvider?.name || t('settings.intelligence.capabilityBindingModelsTitle')"
          :description="modelTransferDescription"
          default-icon="i-carbon-model"
          active-icon="i-carbon-model"
          :memory-name="`capability-models-${capability.id}`"
        >
          <template #default>
            <div class="config-param__row">
              <p class="config-param__summary">{{ modelSummary }}</p>
              <FlatButton primary :disabled="!canEditModels" @click="openModelDrawer">
                <i class="i-carbon-settings" aria-hidden="true" />
                <span>{{ t('settings.intelligence.manageModels') }}</span>
              </FlatButton>
            </div>
          </template>
        </TuffGroupBlock>

        <!-- 提示词配置 -->
        <TuffGroupBlock
          :name="t('settings.intelligence.capabilityPromptSectionTitle')"
          :description="t('settings.intelligence.capabilityPromptSectionDesc')"
          default-icon="i-carbon-notebook"
          active-icon="i-carbon-notebook"
          :memory-name="`capability-prompt-${capability.id}`"
        >
          <template #default>
            <div class="config-param__row">
              <p class="config-param__summary">{{ promptSummary }}</p>
              <FlatButton text @click="openPromptDrawer">
                <i class="i-carbon-edit" aria-hidden="true" />
                <span>{{ t('settings.intelligence.editPrompt') }}</span>
              </FlatButton>
            </div>
          </template>
        </TuffGroupBlock>

        <!-- 测试能力 -->
        <TuffGroupBlock
          :name="t('settings.intelligence.capabilityTestTitle')"
          :description="t('settings.intelligence.capabilityTestDesc')"
          default-icon="i-carbon-flash"
          active-icon="i-carbon-flash"
          :memory-name="`capability-test-${capability.id}`"
        >
          <template #default>
            <div class="test-config">
              <!-- 测试配置信息 -->
              <div class="test-config__info">
                <div class="test-config__item">
                  <span class="test-config__label">{{
                    t('settings.intelligence.testProvider')
                  }}</span>
                  <span class="test-config__value">{{ testProviderName }}</span>
                </div>
                <div class="test-config__item">
                  <span class="test-config__label">{{ t('settings.intelligence.testModel') }}</span>
                  <span class="test-config__value">{{ testModelName }}</span>
                </div>
              </div>

              <!-- 测试按钮 -->
              <div class="test-config__actions">
                <FlatButton
                  primary
                  block
                  :disabled="isTesting || activeBindingCount === 0"
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
                      : t('settings.intelligence.runTest')
                  }}</span>
                </FlatButton>
              </div>

              <!-- 测试结果 -->
              <div
                v-if="testResult"
                class="test-result"
                :class="testResult.success ? 'test-result--success' : 'test-result--fail'"
              >
                <div class="test-result__header">
                  <i
                    :class="
                      testResult.success ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'
                    "
                  />
                  <p class="test-result__title">
                    {{
                      testResult.success
                        ? t('settings.intelligence.testSuccess')
                        : t('settings.intelligence.testFailed')
                    }}
                  </p>
                </div>
                <p class="test-result__message">{{ testResult.message }}</p>
                <div v-if="testSummary" class="test-result__meta">{{ testSummary }}</div>
                <p v-if="testResult.textPreview" class="test-result__preview">
                  {{ testResult.textPreview }}
                </p>
              </div>
            </div>
          </template>
        </TuffGroupBlock>
      </div>
    </template>

    <template #footer>
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

<script lang="ts" name="IntelligenceCapabilityInfo" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable as draggable } from 'vue-draggable-plus'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import type {
  AISDKCapabilityConfig,
  AiProviderConfig,
  AiCapabilityProviderBinding
} from '@talex-touch/utils/types/intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'

const props = defineProps<{
  capability: AISDKCapabilityConfig
  providers: AiProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
}>()

const emits = defineEmits<{
  toggleProvider: [providerId: string, enabled: boolean]
  updateModels: [providerId: string, value: string[]]
  updatePrompt: [prompt: string]
  test: []
  reorderProviders: [bindings: AiCapabilityProviderBinding[]]
}>()

const { t } = useI18n()

// 调试信息
console.log('[IntelligenceCapabilityInfo] Mounted with capability:', props.capability)
console.log('[IntelligenceCapabilityInfo] Providers:', props.providers)
console.log('[IntelligenceCapabilityInfo] Bindings:', props.bindings)

const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDrawer = ref(false)
const showPromptDrawer = ref(false)
let promptTimer: ReturnType<typeof setTimeout> | null = null
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

const sortableEnabledBindings = ref<CapabilityBinding[]>([])

watch(
  enabledBindings,
  (list) => {
    sortableEnabledBindings.value = list
  },
  { immediate: true, deep: true }
)

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

const testSummary = computed(() => {
  if (!props.testResult) return ''
  const pieces: string[] = []
  if (props.testResult.provider) pieces.push(props.testResult.provider)
  if (props.testResult.model) pieces.push(props.testResult.model)
  if (props.testResult.latency) pieces.push(`${props.testResult.latency}ms`)
  return pieces.join(' · ')
})

const testProviderName = computed(() => {
  const firstBinding = enabledBindings.value[0]
  if (!firstBinding) return t('settings.intelligence.noProvider')
  return firstBinding.provider?.name || firstBinding.providerId
})

const testModelName = computed(() => {
  const firstBinding = enabledBindings.value[0]
  if (!firstBinding || !firstBinding.models?.length) return t('settings.intelligence.defaultModel')
  return firstBinding.models[0]
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

function emitProvidersOrder(): void {
  const reordered = sortableEnabledBindings.value.map((binding, index) => {
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

function handleTest(): void {
  if (props.isTesting) return
  emits('test')
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

<style lang="scss" scoped>
.capability-info {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.capability-info__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1.5rem;
  background: var(--el-bg-color);
  border-radius: 1rem;
  border: 1px solid var(--el-border-color-lighter);
}

.capability-info__header-content {
  flex: 1;
}

.capability-info__id {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--el-text-color-placeholder);
  margin: 0 0 0.5rem 0;
  font-weight: 500;
}

.capability-info__title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.75rem 0;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.capability-info__description {
  margin: 0;
  color: var(--el-text-color-regular);
  max-width: 48rem;
  line-height: 1.6;
  font-size: 0.95rem;
}

.capability-info__test-button {
  flex-shrink: 0;
}

.capability-info__body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.capability-info__test-result {
  margin-bottom: 0.5rem;
}

.test-result {
  border-radius: 0.875rem;
  padding: 1.25rem;
  border: 1px solid transparent;

  &--success {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.08);
  }

  &--fail {
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.06);
  }
}

.test-result__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;

  i {
    font-size: 1.25rem;
  }
}

.test-result__title {
  font-weight: 600;
  font-size: 1rem;
  margin: 0;
}

.test-result__message {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--el-text-color-regular);
}

.test-result__meta {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  margin-top: 0.5rem;
}

.test-result__preview {
  margin: 0.75rem 0 0 0;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  font-family: monospace;
  padding: 0.5rem;
  background: var(--el-fill-color-light);
  border-radius: 0.5rem;
}

.capability-info__overview {
  margin-bottom: 0.5rem;
}

.overview-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-blank);
  border-radius: 0.875rem;
  border: 1px solid var(--el-border-color-lighter);
}

.overview-card__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--el-fill-color);
  border-radius: 0.75rem;
}

.overview-card__icon {
  font-size: 1.5rem;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.overview-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.overview-card__label {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.overview-card__value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

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

.config-param__section {
  margin-bottom: 0.75rem;
}

.config-param__label {
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0 0 0.25rem 0;
  color: var(--el-text-color-primary);
}

.config-param__hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.8rem;
  line-height: 1.4;
}

.config-param__list {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0.75rem;
  background: var(--el-fill-color-blank);
  padding: 0.5rem;
  min-height: 100px;
}

.config-param__empty {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 1rem;
}

.config-param__draggable {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.config-param__disabled-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.provider-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.625rem;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-border-color);
    background: var(--el-fill-color-light);
  }

  &.is-selected {
    border-color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 8%, var(--el-fill-color-blank));

    .provider-item__check {
      opacity: 1;
      color: var(--el-color-primary);
    }
  }

  &--disabled {
    opacity: 0.7;
  }
}

.provider-item__grab {
  font-size: 1rem;
  color: var(--el-text-color-placeholder);
  cursor: grab;
  flex-shrink: 0;
}

.provider-item__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  text-align: left;
  gap: 0.25rem;
}

.provider-item__name {
  font-weight: 600;
  font-size: 0.9rem;
}

.provider-item__meta {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.provider-item__badge {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 0.75rem;
}

.provider-item__check {
  font-size: 1.125rem;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.provider-item__status {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}

.config-param__row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.config-param__summary {
  flex: 1;
  margin: 0;
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.config-param__draggable :deep(.sortable-ghost) {
  opacity: 0.5;
}

.test-config {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.test-config__info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-blank);
  border-radius: 0.75rem;
  border: 1px solid var(--el-border-color-lighter);
}

.test-config__item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.test-config__label {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.test-config__value {
  font-size: 0.9rem;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.test-config__actions {
  display: flex;
  gap: 0.75rem;
}
</style>
