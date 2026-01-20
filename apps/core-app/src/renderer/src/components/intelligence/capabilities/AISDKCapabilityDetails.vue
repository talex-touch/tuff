<script lang="ts" name="AISDKCapabilityDetails" setup>
import type {
  AiCapabilityProviderBinding,
  AISDKCapabilityConfig,
  IntelligenceProviderConfig
} from '@talex-touch/utils/types/intelligence'
import type { CapabilityBinding, CapabilityTestResult } from './types'
import { TxButton } from '@talex-touch/tuffex'
import { useIntelligence } from '@talex-touch/utils/renderer/hooks/use-intelligence'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { VueDraggable as draggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import CapabilityTestDialog from './CapabilityTestDialog.vue'

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
  test: [params?: { providerId?: string; userInput?: string }]
  reorderProviders: [bindings: AiCapabilityProviderBinding[]]
}>()

const { t } = useI18n()
const intelligence = useIntelligence()
const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDrawer = ref(false)
const showPromptDrawer = ref(false)
const showTestDialog = ref(false)
const testMeta = ref({ requiresUserInput: false, inputHint: '' })
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

const enabledProvidersForTest = computed(() => {
  return props.providers.filter(
    (provider) => selectedProviderIds.value.has(provider.id) && provider.enabled
  )
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

async function handleTest(): Promise<void> {
  if (props.isTesting) return

  // 获取测试元数据
  try {
    const meta = await intelligence.getCapabilityTestMeta({ capabilityId: props.capability.id })
    testMeta.value = meta
    showTestDialog.value = true
  } catch (error) {
    console.error('Failed to get test meta:', error)
    // 如果获取失败，使用默认值并继续
    testMeta.value = { requiresUserInput: false, inputHint: '' }
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
  <TouchScroll class="capability-details-touch h-full flex flex-col">
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
                  count: capability.providers?.length || 0
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
          <div class="capability-providers-shell">
            <div class="capability-providers__enabled-section">
              <div class="capability-providers__section-header">
                <p class="capability-providers__section-title">
                  {{ t('settings.intelligence.capabilityActionsLabel') }}
                </p>
                <p class="capability-providers__section-hint">
                  {{ t('settings.intelligence.capabilityActionsHint') }}
                </p>
              </div>
              <div class="capability-providers__list">
                <div
                  v-if="sortableEnabledBindings.length === 0"
                  class="capability-providers__empty"
                >
                  <p>{{ t('settings.intelligence.capabilityActionsEmpty') }}</p>
                </div>
                <draggable
                  v-else
                  v-model="sortableEnabledBindings"
                  item-key="providerId"
                  class="capability-providers__draggable"
                  handle=".provider-card__grab"
                  @end="emitProvidersOrder"
                >
                  <template #item="{ element }">
                    <TxButton
                      variant="bare"
                      native-type="button"
                      class="provider-card"
                      :class="{
                        'is-focused': focusedProviderId === element.providerId
                      }"
                      @click="handleProviderCardClick(element.providerId)"
                    >
                      <div class="provider-card__content">
                        <span class="provider-card__name">
                          {{ element.provider?.name || element.providerId }}
                        </span>
                        <span class="provider-card__details">
                          {{ element.provider?.type || element.providerId }}
                          <span v-if="element.models?.length">
                            ·
                            {{
                              t('settings.intelligence.capabilityModelCount', {
                                count: element.models.length
                              })
                            }}
                          </span>
                        </span>
                      </div>
                      <div class="provider-card__meta">
                        <span
                          class="provider-card__status"
                          :class="{ 'is-active': element.enabled !== false }"
                        >
                          {{
                            element.enabled !== false
                              ? t('settings.intelligence.capabilityChannelEnabled')
                              : t('settings.intelligence.capabilityChannelDisabled')
                          }}
                        </span>
                        <i
                          class="i-carbon-drag-horizontal provider-card__grab"
                          aria-hidden="true"
                        />
                      </div>
                    </TxButton>
                  </template>
                </draggable>
              </div>
            </div>

            <div v-if="disabledProviders.length" class="capability-providers__disabled-section">
              <div class="capability-providers__section-header">
                <p class="capability-providers__section-title">
                  {{ t('settings.intelligence.capabilityDisabledLabel') }}
                </p>
              </div>
              <div class="capability-providers__disabled-list">
                <TxButton
                  v-for="entry in disabledProviders"
                  :key="entry.providerId"
                  variant="bare"
                  class="provider-card provider-card--disabled"
                  native-type="button"
                  @click="handleProviderCardClick(entry.providerId)"
                >
                  <div class="provider-card__content">
                    <span class="provider-card__name">
                      {{ entry.provider?.name || entry.providerId }}
                    </span>
                    <span class="provider-card__details">
                      {{ entry.provider?.type || entry.providerId }}
                    </span>
                  </div>
                  <div class="provider-card__meta">
                    <span class="provider-card__badge">
                      {{ t('settings.intelligence.capabilityChannelDisabled') }}
                    </span>
                  </div>
                </TxButton>
              </div>
            </div>
          </div>
        </template>
      </TuffGroupBlock>

      <div class="capability-details__secondary">
        <TuffBlockSlot
          :title="focusedProvider?.name || t('settings.intelligence.capabilityBindingModelsTitle')"
          :description="modelTransferDescription"
          default-icon="i-carbon-model"
          active-icon="i-carbon-model"
          :active="!!focusedBinding"
          guidance
        >
          <template #default>
            <div class="capability-details__slot-row">
              <p class="capability-details__slot-summary">
                {{ modelSummary }}
              </p>
              <TxButton
                variant="flat"
                type="primary"
                :disabled="!canEditModels"
                @click="openModelDrawer"
              >
                <i class="i-carbon-settings" aria-hidden="true" />
                <span>{{ t('settings.intelligence.manageModels') }}</span>
              </TxButton>
            </div>
          </template>
        </TuffBlockSlot>

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
          <div
            class="test-result"
            :class="testResult.success ? 'test-result--success' : 'test-result--fail'"
            role="status"
          >
            <p class="font-semibold">
              {{
                testResult.success
                  ? t('settings.intelligence.testSuccess')
                  : t('settings.intelligence.testFailed')
              }}
            </p>
            <p class="mt-2 text-sm">
              {{ testResult.message }}
            </p>
            <p
              v-if="testResult.textPreview"
              class="mt-2 text-xs text-[var(--el-text-color-secondary)]"
            >
              {{ testResult.textPreview }}
            </p>
          </div>
        </TuffBlockSlot>
      </div>
    </div>
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
  background: var(--el-bg-color);
  border-radius: 1.25rem;
  border: 1px solid var(--el-border-color-lighter);
}

.capability-details__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.capability-details__description {
  margin: 0.25rem 0;
  color: var(--el-text-color-secondary);
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
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
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

.capability-providers-shell {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.capability-providers__section-header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.capability-providers__section-title {
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0;
}

.capability-providers__section-hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
}

.capability-providers__list {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1rem;
  background: var(--el-fill-color-blank);
  padding: 0.75rem;
  min-height: 120px;
}

.capability-providers__empty {
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
  text-align: center;
  padding: 1rem 0;
}

.capability-providers__draggable {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.capability-providers__disabled-section {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1rem;
  padding: 0.75rem;
  background: var(--el-fill-color-blank);
}

.capability-providers__disabled-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.provider-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 0.9rem;
  border: 1px solid transparent;
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition:
    border 0.2s,
    transform 0.2s;

  &:hover {
    border-color: var(--el-border-color);
  }

  &.is-focused {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.4);
  }
}

.provider-card--disabled {
  opacity: 0.8;
}

.provider-card__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  text-align: left;
}

.provider-card__name {
  font-weight: 600;
}

.provider-card__details {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

.provider-card__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.provider-card__status {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-secondary);

  &.is-active {
    border-color: rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }
}

.provider-card__badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px dashed var(--el-border-color);
}

.provider-card__grab {
  font-size: 1rem;
  color: var(--el-text-color-placeholder);
  cursor: grab;
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
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.capability-details__drawer :deep(.FlatMarkdown-Container) {
  min-height: 280px;
}

.test-result {
  border-radius: 0.75rem;
  padding: 1rem;
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

.capability-providers__draggable :deep(.sortable-ghost) {
  opacity: 0.6;
}
</style>
