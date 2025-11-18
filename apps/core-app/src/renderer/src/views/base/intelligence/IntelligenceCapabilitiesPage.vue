<template>
  <tuff-aside-template
    v-model="searchQuery"
    class="capability-shell flex-1"
    :search-id="'capability-search'"
    :search-placeholder="t('settings.intelligence.capabilitySearchPlaceholder')"
    :clear-label="t('common.close')"
  >
    <template #default>
      <TuffItemTemplate
        v-for="capability in filteredCapabilities"
        :key="capability.id"
        :title="capability.label || capability.id"
        :subtitle="capability.description"
        :icon="getCapabilityIcon(capability)"
        :selected="selectedCapabilityId === capability.id"
        size="md"
        @click="handleSelectCapability(capability.id)"
      />
      <div v-if="filteredCapabilities.length === 0" class="capability-list-empty">
        <p>{{ t('settings.intelligence.capabilityListEmpty') }}</p>
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
          @test="(params) => handleCapabilityTest(selectedCapability.id, params)"
        />
      </div>
    </template>
  </tuff-aside-template>
</template>

<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AISDKCapabilityConfig,
  AiCapabilityProviderBinding,
  AiVisionOcrResult
} from '@talex-touch/utils/types/intelligence'
import type { AiInvokeResult, ITuffIcon } from '@talex-touch/utils'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import TuffItemTemplate from '~/components/tuff/template/TuffItemTemplate.vue'
import IntelligenceCapabilityInfo from '~/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from '~/components/intelligence/capabilities/types'

const { t } = useI18n()
const aiClient = createIntelligenceClient(touchChannel as any)

const { providers, capabilities, updateCapability, setCapabilityProviders, updateProvider } =
  useIntelligenceManager()

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
  const iconMap: Record<string, string> = {
    'chat.completions': 'i-carbon-chat',
    'embedding.generate': 'i-carbon-data-base',
    'vision.ocr': 'i-carbon-image-search'
  }
  return {
    type: 'class',
    value: iconMap[capability.id] || 'i-carbon-cube'
  }
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
  params?: { providerId?: string; userInput?: string }
): Promise<void> {
  if (capabilityTesting[capabilityId]) return
  capabilityTesting[capabilityId] = true
  capabilityTests[capabilityId] = null

  try {
    const response = await aiClient.testCapability({
      capabilityId,
      providerId: params?.providerId,
      userInput: params?.userInput
    })

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
