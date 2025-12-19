<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  AiCapabilityProviderBinding,
  AISDKCapabilityConfig
} from '@talex-touch/utils/types/intelligence'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from '~/components/intelligence/capabilities/types'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// import IntelligenceCapabilityInfo from '~/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const aiClient = createIntelligenceClient(touchChannel as any)

const {
  providers,
  capabilities,
  loading,
  updateCapability,
  setCapabilityProviders,
  updateProvider
} = useIntelligenceManager()

const searchQuery = ref('')
const capabilityList = computed<AISDKCapabilityConfig[]>(() =>
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
const selectedCapability = computed<AISDKCapabilityConfig | null>(() => {
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

function getCapabilityIcon(capability: AISDKCapabilityConfig): ITuffIcon {
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

function getCapabilityIconColor(capability: AISDKCapabilityConfig): string {
  const iconMap: Record<string, string> = {
    'text.chat': '#1e88e5',
    'embedding.generate': '#7b1fa2',
    'vision.ocr': '#fb8c00',
    'text.translate': '#43a047',
    'text.summarize': '#e53935',
    'audio.transcribe': '#00acc1',
    'code.generate': '#5e35b1',
    'intent.detect': '#f4511e'
  }
  return iconMap[capability.id] || '#757575'
}

function getCapabilityStatus(capability: AISDKCapabilityConfig): 'configured' | 'unconfigured' {
  // const hasProviders = capability.providers && capability.providers.length > 0
  const hasActiveProvider = capability.providers?.some((p) => p.enabled !== false)
  return hasActiveProvider ? 'configured' : 'unconfigured'
}

const capabilityTests = reactive<Record<string, CapabilityTestResult | null>>({})
const capabilityTesting = reactive<Record<string, boolean>>({})

function updateCapabilityBinding(
  capabilityId: string,
  providerId: string,
  patch: Partial<AiCapabilityProviderBinding>
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

function onReorderProviders(bindings: AiCapabilityProviderBinding[]): void {
  if (!selectedCapability.value) return
  setCapabilityProviders(selectedCapability.value.id, bindings)
}

async function handleCapabilityTest(
  capabilityId: string,
  params?: { providerId?: string; userInput?: string; model?: string; promptTemplate?: string; promptVariables?: Record<string, any> }
): Promise<void> {
  if (capabilityTesting[capabilityId]) return
  capabilityTesting[capabilityId] = true
  capabilityTests[capabilityId] = null

  try {
    const response = await aiClient.testCapability({
      capabilityId,
      providerId: params?.providerId,
      userInput: params?.userInput,
      model: params?.model,
      promptTemplate: params?.promptTemplate,
      promptVariables: params?.promptVariables,
    })

    // 使用格式化后的结果
    capabilityTests[capabilityId] = {
      ...(response as any),
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
  >
    <template #default>
      <!-- Loading skeleton -->
      <div v-if="loading" class="capability-cards">
        <CapabilitySkeleton v-for="i in 8" :key="i" />
      </div>

      <!-- Capability list -->
      <div v-else class="capability-cards">
        <div
          v-for="capability in filteredCapabilities"
          :key="capability.id"
          class="capability-card"
          :class="{
            'capability-card--selected': selectedCapabilityId === capability.id,
            'capability-card--configured': getCapabilityStatus(capability) === 'configured'
          }"
          @click="handleSelectCapability(capability.id)"
        >
          <div class="capability-card__icon" :style="{ color: getCapabilityIconColor(capability) }">
            <i :class="getCapabilityIcon(capability).value" />
          </div>
          <div class="capability-card__content">
            <div class="capability-card__header">
              <span class="capability-card__title">{{ capability.label || capability.id }}</span>
              <span
                v-if="getCapabilityStatus(capability) === 'configured'"
                class="capability-card__badge capability-card__badge--success"
              >
                <i class="i-carbon-checkmark" />
                {{ (capability.providers?.filter((p) => p.enabled !== false) || []).length }}
              </span>
              <span v-else class="capability-card__badge capability-card__badge--inactive">
                <i class="i-carbon-warning-alt" />
                未配置
              </span>
            </div>
            <p class="capability-card__description">{{ capability.description }}</p>
          </div>
        </div>
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
          @test="(params?: any) => handleCapabilityTest(selectedCapability!.id, params)"
        />
      </div>
    </template>
  </TuffAsideTemplate>
</template>

<style lang="scss" scoped>
.capability-cards {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0.5rem;
}

.capability-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border-radius: 0.75rem;
  background: var(--el-fill-color-blank);
  border: 1.5px solid var(--el-border-color-light);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border-color: var(--el-color-primary-light-5);
  }

  &--selected {
    background: linear-gradient(
      135deg,
      var(--el-color-primary-light-9) 0%,
      var(--el-fill-color-blank) 100%
    );
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(30, 136, 229, 0.15);
  }

  &--configured {
    border-left: 3px solid var(--el-color-success);
  }
}

.capability-card__icon {
  font-size: 2rem;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  background: currentColor;
  opacity: 0.12;
  position: relative;

  i {
    position: absolute;
    opacity: 8.33;
    color: inherit;
  }
}

.capability-card__content {
  flex: 1;
  min-width: 0;
}

.capability-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.capability-card__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
}

.capability-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;

  i {
    font-size: 0.75rem;
  }

  &--success {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }

  &--inactive {
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
  }
}

.capability-card__description {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.capability-list-empty {
  padding: 3rem 1.5rem;
  text-align: center;

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 0.9rem;
  }
}
</style>
