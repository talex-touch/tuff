<template>
  <TuffGroupBlock
    :name="capability.label || capability.id"
    :description="capability.description"
    default-icon="i-carbon-flow"
    active-icon="i-carbon-flow"
    :memory-name="`capability-details-${capability.id}`"
  >
    <template #default>
      <div class="capability-details">
        <header class="capability-details__header">
          <div>
            <p class="capability-details__eyebrow">
              {{ capability.id }}
            </p>
            <h1>{{ capability.label || capability.id }}</h1>
            <p>{{ capability.description }}</p>
            <div class="capability-details__badges">
              <span class="capability-details__badge">
                <i class="i-carbon-flow-logs" aria-hidden="true" />
                {{ t('settings.intelligence.capabilityProvidersStat', { count: activeBindingCount }) }}
              </span>
              <span class="capability-details__badge capability-details__badge--muted">
                <i class="i-carbon-catalog" aria-hidden="true" />
                {{ t('settings.intelligence.capabilityBindingsStat', { count: capability.providers?.length || 0 }) }}
              </span>
            </div>
          </div>
          <FlatButton
            class="test-button"
            primary
            :disabled="isTesting"
            :aria-busy="isTesting"
            @click="handleTest"
          >
            <i :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'" aria-hidden="true" />
            <span>{{ isTesting ? t('settings.intelligence.testing') : t('settings.intelligence.capabilityTest') }}</span>
          </FlatButton>
        </header>

        <div class="capability-details__grid">
          <div class="capability-details__providers">
            <h2>{{ t('settings.intelligence.capabilityProviderSectionTitle') }}</h2>
            <p>{{ t('settings.intelligence.capabilityProviderSectionDesc') }}</p>
            <div class="capability-details__provider-list">
              <TuffBlockSlot
                v-for="provider in providers"
                :key="provider.id"
                :title="provider.name"
                :description="provider.type"
                default-icon="i-carbon-api-1"
                active-icon="i-carbon-api-1"
                :active="focusedProviderId === provider.id"
                @click="handleSelectProvider(provider.id)"
              >
                <template #tags>
                  <span
                    class="capability-details__tag"
                    :class="{ 'is-active': selectedProviderIds.has(provider.id) }"
                  >
                    {{ bindingMap.get(provider.id)?.models?.length || 0 }} 个模型
                  </span>
                </template>
                <div class="capability-details__provider-actions" @click.stop>
                  <TSwitch
                    :model-value="selectedProviderIds.has(provider.id)"
                    @change="(value: boolean) => handleProviderToggle(provider.id, value)"
                  />
                </div>
              </TuffBlockSlot>
            </div>
          </div>

          <div class="capability-details__actions">
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
                  <p class="capability-details__slot-summary">{{ modelSummary }}</p>
                  <FlatButton
                    primary
                    :disabled="!canEditModels"
                    @click="openModelDrawer"
                  >
                    <i class="i-carbon-settings" aria-hidden="true" />
                    <span>{{ t('settings.intelligence.manageModels') }}</span>
                  </FlatButton>
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
                  <p class="capability-details__slot-summary">{{ promptSummary }}</p>
                  <FlatButton text @click="openPromptDrawer">
                    <i class="i-carbon-edit" aria-hidden="true" />
                    <span>{{ t('settings.intelligence.editPrompt') }}</span>
                  </FlatButton>
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
                  {{ testResult.success ? t('settings.intelligence.testSuccess') : t('settings.intelligence.testFailed') }}
                </p>
                <p class="mt-2 text-sm">
                  {{ testResult.message }}
                </p>
                <p v-if="testResult.textPreview" class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
                  {{ testResult.textPreview }}
                </p>
              </div>
            </TuffBlockSlot>
          </div>
        </div>
      </div>
    </template>
  </TuffGroupBlock>

  <TDrawer v-model:visible="showModelDrawer" :title="t('settings.intelligence.capabilityBindingModelsTitle')">
    <CapabilityModelTransfer
      :model-value="focusedBinding?.models || []"
      :available-models="focusedProvider?.models || []"
      :disabled="!canEditModels"
      @update:model-value="handleModelTransferUpdates"
    />
  </TDrawer>

  <TDrawer v-model:visible="showPromptDrawer" :title="t('settings.intelligence.capabilityPromptSectionTitle')">
    <div class="capability-details__drawer">
      <p class="capability-details__drawer-description">
        {{ t('settings.intelligence.capabilityPromptSectionDesc') }}
      </p>
      <FlatMarkdown
        v-model="promptValue"
        :readonly="false"
      />
    </div>
  </TDrawer>
</template>

<script lang="ts" name="AISDKCapabilityDetails" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import TDrawer from '~/components/base/dialog/TDrawer.vue'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'
import CapabilityModelTransfer from './CapabilityModelTransfer.vue'
import type {
  AISDKCapabilityConfig,
  AiProviderConfig
} from '@talex-touch/utils/types/intelligence'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from './types'

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
}>()

const { t } = useI18n()
const promptValue = ref(props.capability.promptTemplate || '')
const focusedProviderId = ref<string>('')
const showModelDrawer = ref(false)
const showPromptDrawer = ref(false)
let promptTimer: ReturnType<typeof setTimeout> | null = null
let syncingFromProps = false

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

const focusedProvider = computed(() =>
  props.providers.find((provider) => provider.id === focusedProviderId.value) || null
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
    return hint === 'settings.intelligence.capabilityBindingModelsEnableHint' ? '开启渠道后再配置模型' : hint
  }

  const count = focusedBinding?.models?.length ?? 0
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
    return hint === 'settings.intelligence.capabilityBindingModelsEnableHint' ? '开启渠道后再配置模型' : hint
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

function handleSelectProvider(providerId: string): void {
  focusedProviderId.value = providerId
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
    if (focusedProviderId.value && props.providers.some((provider) => provider.id === focusedProviderId.value)) {
      return
    }
    const firstActive = props.capability.providers?.find((binding) => binding.enabled !== false)?.providerId
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
.capability-details {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem;
  height: 100%;
  overflow-y: auto;
}

.capability-details__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 1rem;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);

  h1 {
    font-size: 1.5rem;
    margin: 0.25rem 0;
  }

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
  }
}

.capability-details__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
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

.capability-details__grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1fr);
  gap: 1rem;
}

.capability-details__providers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.capability-details__actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.capability-details__provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.capability-details__tag {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);

  &.is-active {
    background: rgba(99, 102, 241, 0.12);
    color: #4c1d95;
  }
}

.capability-details__provider-actions {
  display: flex;
  align-items: center;
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
</style>
