<template>
  <div class="flex h-full flex-col" role="main" aria-label="Intelligence Capability Binding">
    <div class="flex flex-1 overflow-hidden border border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)]">
      <AISDKCapabilityList
        class="h-full w-80 flex-shrink-0 border-r border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color)]"
        :capabilities="capabilityList"
        :selected-id="selectedCapabilityId"
        @select="handleSelectCapability"
      />
      <section
        class="h-full flex-1 overflow-hidden"
        :aria-live="selectedCapability ? 'polite' : 'off'"
      >
        <Transition name="fade-slide" mode="out-in">
          <AISDKCapabilityDetails
            v-if="selectedCapability"
            :key="selectedCapability.id"
            :capability="selectedCapability"
            :providers="providers"
            :bindings="activeBindings(selectedCapability.id)"
            :is-testing="!!capabilityTesting[selectedCapability.id]"
            :test-result="capabilityTests[selectedCapability.id]"
            @toggle-provider="onToggleProvider"
            @update-models="onUpdateModels"
            @update-prompt="onUpdatePrompt"
            @reorder-providers="onReorderProviders"
            @test="handleCapabilityTest(selectedCapability.id)"
          />
          <div
            v-else
            class="flex h-full flex-col items-center justify-center gap-2 text-[var(--el-text-color-secondary)]"
            role="status"
          >
            <i class="i-carbon-cube text-3xl" aria-hidden="true" />
            <p>{{ t('settings.intelligence.capabilityListEmpty') }}</p>
          </div>
        </Transition>
      </section>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AISDKCapabilityConfig,
  AiCapabilityProviderBinding,
  AiVisionOcrResult
} from '@talex-touch/utils/types/intelligence'
import type { AiInvokeResult } from '@talex-touch/utils'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'
import AISDKCapabilityList from '~/components/intelligence/capabilities/AISDKCapabilityList.vue'
import AISDKCapabilityDetails from '~/components/intelligence/capabilities/AISDKCapabilityDetails.vue'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from '~/components/intelligence/capabilities/types'

const { t } = useI18n()
const aiClient = createIntelligenceClient(touchChannel as any)

const {
  providers,
  capabilities,
  updateCapability,
  setCapabilityProviders
} = useIntelligenceManager()

const capabilityList = computed<AISDKCapabilityConfig[]>(() =>
  Object.values(capabilities.value || {}).sort((a, b) => a.id.localeCompare(b.id))
)
const providerMap = computed(() => new Map(providers.value.map((provider) => [provider.id, provider])))

const selectedCapabilityId = ref<string | null>(capabilityList.value[0]?.id ?? null)
const selectedCapability = computed<AISDKCapabilityConfig | null>(() => {
  if (!selectedCapabilityId.value) return null
  return capabilityList.value.find((entry) => entry.id === selectedCapabilityId.value) ?? null
})

watch(
  capabilityList,
  (list) => {
    if (list.length === 0) {
      selectedCapabilityId.value = null
      return
    }
    if (!selectedCapabilityId.value || !list.some((item) => item.id === selectedCapabilityId.value)) {
      selectedCapabilityId.value = list[0].id
    }
  },
  { immediate: true }
)

function handleSelectCapability(id: string): void {
  selectedCapabilityId.value = id
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
  } else {
    const capability = capabilities.value[capabilityId]
    if (!capability?.providers) return
    const remaining = capability.providers.filter((binding) => binding.providerId !== providerId)
    setCapabilityProviders(capabilityId, remaining)
  }
}

function handleCapabilityModels(
  capabilityId: string,
  providerId: string,
  models: string[]
): void {
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

async function handleCapabilityTest(capabilityId: string): Promise<void> {
  if (capabilityTesting[capabilityId]) return
  capabilityTesting[capabilityId] = true
  capabilityTests[capabilityId] = null

  try {
    const invocation = (await aiClient.testCapability({
      capabilityId
    })) as AiInvokeResult<AiVisionOcrResult>

    capabilityTests[capabilityId] = {
      success: true,
      message: t('settings.intelligence.capabilityTestHint'),
      latency: invocation.latency,
      provider: invocation.provider,
      model: invocation.model,
      textPreview: invocation.result.text?.slice(0, 120),
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

<style lang="scss" scoped>
@import './intelligence-shared.scss';
</style>
