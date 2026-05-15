<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  IntelligenceCapabilityProviderBinding,
  IntelligenceCapabilityConfig
} from '@talex-touch/tuff-intelligence'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from '~/components/intelligence/capabilities/types'
import type {
  TuffItemBadge,
  TuffItemStatusDot
} from '~/components/tuff/template/TuffItemTemplate.vue'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IntelligenceCapabilityInfo from '~/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue'
import TuffItemTemplate from '~/components/tuff/template/TuffItemTemplate.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const transport = useTuffTransport()
const aiClient = createIntelligenceClient(transport)

const {
  providers,
  capabilities,
  loading,
  updateCapability,
  setCapabilityProviders,
  updateProvider
} = useIntelligenceManager()

const searchQuery = ref('')
const capabilityList = computed<IntelligenceCapabilityConfig[]>(() =>
  Object.values(capabilities.value || {}).sort((a, b) => a.id.localeCompare(b.id))
)
const providerMap = computed(
  () => new Map(providers.value.map((provider) => [provider.id, provider]))
)

const filteredCapabilities = computed(() => {
  if (!searchQuery.value.trim()) return capabilityList.value
  const query = searchQuery.value.toLowerCase()
  return capabilityList.value.filter(
    (capability) =>
      capability.id.toLowerCase().includes(query) ||
      (capability.label?.toLowerCase().includes(query) ?? false) ||
      (capability.description?.toLowerCase().includes(query) ?? false)
  )
})

const selectedCapabilityId = ref<string | null>(null)
const selectedCapability = computed<IntelligenceCapabilityConfig | null>(() => {
  if (!selectedCapabilityId.value) return null
  const values = Object.values(capabilityList.value)
  return values.find((entry) => entry.id === selectedCapabilityId.value) ?? null
})

watch(
  capabilityList,
  (list) => {
    if (list.length > 0 && !selectedCapabilityId.value) {
      selectedCapabilityId.value = list[0].id
    }
  },
  { immediate: true }
)

watch(filteredCapabilities, (list) => {
  if (list.length === 0) {
    selectedCapabilityId.value = null
    return
  }
  if (!selectedCapabilityId.value || !list.some((item) => item.id === selectedCapabilityId.value)) {
    selectedCapabilityId.value = list[0].id
  }
})

function handleSelectCapability(id: string): void {
  selectedCapabilityId.value = id
}

function getCapabilityIcon(capability: IntelligenceCapabilityConfig): ITuffIcon {
  const iconMap: Record<string, { icon: string; color: string }> = {
    'text.chat': { icon: 'i-carbon-chat', color: '#1e88e5' },
    'embedding.generate': { icon: 'i-carbon-data-base', color: '#7b1fa2' },
    'vision.ocr': { icon: 'i-carbon-image-search', color: '#fb8c00' },
    'text.translate': { icon: 'i-carbon-translate', color: '#43a047' },
    'text.summarize': { icon: 'i-carbon-document-tasks', color: '#e53935' },
    'audio.transcribe': { icon: 'i-carbon-microphone', color: '#00acc1' },
    'code.generate': { icon: 'i-carbon-code', color: '#5e35b1' },
    'intent.detect': { icon: 'i-carbon-explore', color: '#f4511e' }
  }
  const config = iconMap[capability.id] || { icon: 'i-carbon-cube', color: '#757575' }
  return {
    type: 'class',
    value: config.icon
  }
}

function getConfiguredProviderCount(capability: IntelligenceCapabilityConfig): number {
  return capability.providers?.filter((provider) => provider.enabled !== false).length ?? 0
}

function getCapabilityStatus(
  capability: IntelligenceCapabilityConfig
): 'configured' | 'unconfigured' {
  return getConfiguredProviderCount(capability) > 0 ? 'configured' : 'unconfigured'
}

function getCapabilityBadge(capability: IntelligenceCapabilityConfig): TuffItemBadge {
  const configuredCount = getConfiguredProviderCount(capability)
  if (configuredCount > 0) {
    return {
      text: String(configuredCount),
      icon: 'i-carbon-checkmark',
      status: 'success'
    }
  }
  return {
    text: t('settings.intelligence.capabilityNotConfigured'),
    icon: 'i-carbon-warning-alt',
    status: 'muted'
  }
}

function getCapabilityStatusDot(
  capability: IntelligenceCapabilityConfig
): TuffItemStatusDot | undefined {
  if (getCapabilityStatus(capability) !== 'configured') return undefined
  return {
    class: 'is-active',
    label: t('settings.intelligence.capabilitySummary', {
      count: getConfiguredProviderCount(capability)
    })
  }
}

const capabilityTests = reactive<Record<string, CapabilityTestResult | null>>({})
const capabilityTesting = reactive<Record<string, boolean>>({})

function updateCapabilityBinding(
  capabilityId: string,
  providerId: string,
  patch: Partial<IntelligenceCapabilityProviderBinding>
): void {
  const capability = capabilities.value[capabilityId]
  const current = capability?.providers ? [...capability.providers] : []
  const index = current.findIndex((binding) => binding.providerId === providerId)
  if (index === -1) {
    current.push({
      providerId,
      enabled: true,
      priority: current.length + 1,
      ...patch
    })
  } else {
    current[index] = { ...current[index], ...patch }
  }
  setCapabilityProviders(capabilityId, current)
}

function handleCapabilityProviderToggle(
  capabilityId: string,
  providerId: string,
  enabled: boolean
): void {
  if (enabled) {
    updateCapabilityBinding(capabilityId, providerId, { enabled: true })
    const provider = providerMap.value.get(providerId)
    if (provider && !provider.enabled) {
      updateProvider(providerId, { enabled: true })
    }
  } else {
    const capability = capabilities.value[capabilityId]
    if (!capability?.providers) return
    const remaining = capability.providers.filter((binding) => binding.providerId !== providerId)
    setCapabilityProviders(capabilityId, remaining)
  }
}

function handleCapabilityModels(capabilityId: string, providerId: string, models: string[]): void {
  const normalized = models.map((token) => token.trim()).filter(Boolean)
  updateCapabilityBinding(capabilityId, providerId, { models: normalized })
}

function handleCapabilityPrompt(capabilityId: string, prompt: string): void {
  updateCapability(capabilityId, { promptTemplate: prompt })
}

function activeBindings(capabilityId: string): CapabilityBinding[] {
  const capability = capabilities.value[capabilityId]
  if (!capability?.providers) return []
  return capability.providers
    .filter((binding) => binding.enabled !== false)
    .map((binding) => ({
      ...binding,
      provider: providerMap.value.get(binding.providerId)
    }))
}

function onToggleProvider(providerId: string, enabled: boolean): void {
  if (!selectedCapability.value) return
  handleCapabilityProviderToggle(selectedCapability.value.id, providerId, enabled)
}

function onUpdateModels(providerId: string, models: string[]): void {
  if (!selectedCapability.value) return
  handleCapabilityModels(selectedCapability.value.id, providerId, models)
}

function onUpdatePrompt(prompt: string): void {
  if (!selectedCapability.value) return
  handleCapabilityPrompt(selectedCapability.value.id, prompt)
}

function onReorderProviders(bindings: IntelligenceCapabilityProviderBinding[]): void {
  if (!selectedCapability.value) return
  setCapabilityProviders(selectedCapability.value.id, bindings)
}

async function handleCapabilityTest(
  capabilityId: string,
  params?: {
    providerId?: string
    userInput?: string
    model?: string
    promptTemplate?: string
    promptVariables?: Record<string, unknown>
  }
): Promise<void> {
  if (capabilityTesting[capabilityId]) return
  capabilityTesting[capabilityId] = true
  capabilityTests[capabilityId] = null

  try {
    const response = (await aiClient.testCapability({
      capabilityId,
      providerId: params?.providerId,
      userInput: params?.userInput,
      model: params?.model,
      promptTemplate: params?.promptTemplate,
      promptVariables: params?.promptVariables
    })) as CapabilityTestResult

    // 使用格式化后的结果
    capabilityTests[capabilityId] = {
      ...response,
      timestamp: Date.now()
    }
  } catch (error) {
    capabilityTests[capabilityId] = {
      success: false,
      message: error instanceof Error ? error.message : '能力测试失败',
      timestamp: Date.now()
    }
  } finally {
    capabilityTesting[capabilityId] = false
  }
}
</script>

<template>
  <TuffAsideTemplate
    v-model="searchQuery"
    class="capability-shell flex-1"
    search-id="capability-search"
    :search-placeholder="t('settings.intelligence.capabilitySearchPlaceholder')"
    :clear-label="t('common.close')"
    :main-edge-blur="false"
  >
    <template #default>
      <!-- Loading skeleton -->
      <div v-if="loading" class="capability-cards">
        <CapabilitySkeleton v-for="i in 8" :key="i" />
      </div>

      <!-- Capability list -->
      <div v-else class="capability-cards">
        <TuffItemTemplate
          v-for="capability in filteredCapabilities"
          :key="capability.id"
          class="capability-card"
          :title="capability.label || capability.id"
          :subtitle="capability.description"
          :icon="getCapabilityIcon(capability)"
          :selected="selectedCapabilityId === capability.id"
          :top-badge="getCapabilityBadge(capability)"
          :status-dot="getCapabilityStatusDot(capability)"
          size="sm"
          :aria-label="capability.label || capability.id"
          @click="handleSelectCapability(capability.id)"
        />
        <div v-if="filteredCapabilities.length === 0" class="capability-list-empty">
          <p>{{ t('settings.intelligence.capabilityListEmpty') }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <span class="w-full text-xs text-center op-50 block">
        {{ t('settings.intelligence.capabilitySummary', { count: capabilityList.length }) }}
      </span>
    </template>

    <template #main>
      <div :key="selectedCapabilityId ?? 'empty'" class="h-full overflow-hidden">
        <IntelligenceCapabilityInfo
          v-if="selectedCapability"
          :capability="selectedCapability"
          :providers="providers"
          :bindings="activeBindings(selectedCapability.id)"
          :is-testing="!!capabilityTesting[selectedCapability.id]"
          :test-result="capabilityTests[selectedCapability.id]"
          @toggle-provider="onToggleProvider"
          @update-models="onUpdateModels"
          @update-prompt="onUpdatePrompt"
          @reorder-providers="onReorderProviders"
          @test="
            (params?: {
              providerId?: string
              userInput?: string
              model?: string
              promptTemplate?: string
              promptVariables?: Record<string, unknown>
            }) => handleCapabilityTest(selectedCapability!.id, params)
          "
        />
      </div>
    </template>
  </TuffAsideTemplate>
</template>

<style lang="scss" scoped>
.capability-cards {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  align-items: stretch;
  padding: 0.5rem;
}

.capability-card {
  flex: 0 0 auto;
  align-self: stretch;
  height: 5.25rem;
  min-height: 0;
}

.capability-card :deep(.TuffItemTemplate-Content) {
  gap: 0.25rem;
}

.capability-card :deep(.TuffItemTemplate-Subtitle) {
  align-items: flex-start;
}

.capability-card :deep(.TuffItemTemplate-SubtitleText) {
  display: -webkit-box;
  white-space: normal;
  line-height: 1.35;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.capability-list-empty {
  padding: 3rem 1.5rem;
  text-align: center;

  p {
    margin: 0;
    color: var(--tx-text-color-secondary);
    font-size: 0.9rem;
  }
}
</style>
