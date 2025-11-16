<template>
  <div class="aisdk-page h-full flex flex-col" role="main" aria-label="Intelligence Capability Binding">
    <header class="aisdk-hero">
      <div>
        <p class="aisdk-hero__eyebrow">{{ t('flatNavBar.aisdk') }}</p>
        <h1>{{ t('settings.aisdk.capabilityPageTitle') }}</h1>
        <p class="aisdk-hero__desc">
          {{ t('settings.aisdk.capabilityPageDesc') }}
        </p>
      </div>
    </header>

    <div class="aisdk-body flex-1 flex flex-col gap-4 overflow-hidden">
      <div class="capability-grid">
        <article
          v-for="capability in capabilityList"
          :key="capability.id"
          class="capability-card"
        >
          <header class="capability-card__header">
            <div>
              <h3>{{ capability.label || capability.id }}</h3>
              <p>{{ capability.description }}</p>
            </div>
            <FlatButton
              :primary="!capabilityTesting[capability.id]"
              @click="handleCapabilityTest(capability.id)"
            >
              <i :class="capabilityTesting[capability.id] ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'" aria-hidden="true" />
              <span>
                {{ capabilityTesting[capability.id] ? t('settings.aisdk.testing') : t('settings.aisdk.capabilityTest') }}
              </span>
            </FlatButton>
          </header>

          <div class="capability-card__section">
            <p class="section-title">{{ t('settings.aisdk.capabilityProviderLabel') }}</p>
            <div class="provider-pills">
              <label
                v-for="provider in providers"
                :key="provider.id"
                class="provider-pill"
              >
                <input
                  type="checkbox"
                  :checked="isCapabilityProviderSelected(capability.id, provider.id)"
                  @change="handleCapabilityProviderToggle(capability.id, provider.id, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ provider.name }}</span>
              </label>
            </div>
          </div>

          <div
            v-for="binding in activeBindings(capability.id)"
            :key="`${capability.id}-${binding.providerId}`"
            class="capability-card__section"
          >
            <p class="section-title">{{ binding.provider?.name || binding.providerId }}</p>
            <input
              type="text"
              class="aisdk-input"
              :value="getBindingModels(capability.id, binding.providerId)"
              :placeholder="binding.provider?.defaultModel || 'model-1, model-2'"
              @change="handleCapabilityModels(capability.id, binding.providerId, ($event.target as HTMLInputElement).value)"
            />
          </div>

          <div class="capability-card__section">
            <p class="section-title">{{ t('settings.aisdk.capabilityPromptLabel') }}</p>
            <textarea
              class="aisdk-textarea"
              rows="3"
              :value="capability.promptTemplate || ''"
              :placeholder="t('settings.settingAISDK.instructionsPlaceholder')"
              @change="handleCapabilityPrompt(capability.id, ($event.target as HTMLTextAreaElement).value)"
            />
          </div>

          <div
            v-if="capabilityTests[capability.id]"
            class="capability-card__result"
          >
            <p class="result-title">
              <i
                :class="capabilityTests[capability.id]?.success ? 'i-carbon-checkmark-filled text-green-500' : 'i-carbon-warning-filled text-red-500'"
                aria-hidden="true"
              />
              <span>
                {{ capabilityTests[capability.id]?.success ? t('settings.aisdk.testSuccess') : t('settings.aisdk.testFailed') }}
              </span>
            </p>
            <p v-if="capabilityTests[capability.id]?.textPreview" class="result-snippet">
              {{ capabilityTests[capability.id]?.textPreview }}
            </p>
            <p class="result-meta">
              <span v-if="capabilityTests[capability.id]?.provider">
                {{ capabilityTests[capability.id]?.provider }}
              </span>
              <span v-if="capabilityTests[capability.id]?.model">
                · {{ capabilityTests[capability.id]?.model }}
              </span>
              <span v-if="capabilityTests[capability.id]?.latency">
                · {{ capabilityTests[capability.id]?.latency }}ms
              </span>
            </p>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceCapabilitiesPage" setup>
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '@comp/base/button/FlatButton.vue'
import type {
  AISDKCapabilityConfig,
  AiCapabilityProviderBinding,
  AiVisionOcrResult,
  AiProviderConfig
} from '~/types/aisdk'
import type { AiInvokeResult } from '@talex-touch/utils/types/aisdk'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { createAiSDKClient } from '@talex-touch/utils/aisdk/client'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()
const aiClient = createAiSDKClient(touchChannel as any)

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

const capabilityTests = reactive<Record<string, { success: boolean; message?: string; latency?: number; provider?: string; model?: string; textPreview?: string; timestamp: number } | null>>({})
const capabilityTesting = reactive<Record<string, boolean>>({})

function isCapabilityProviderSelected(capabilityId: string, providerId: string): boolean {
  const capability = capabilities.value[capabilityId]
  return capability?.providers?.some((binding) => binding.providerId === providerId) ?? false
}

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

function getBindingModels(capabilityId: string, providerId: string): string {
  const capability = capabilities.value[capabilityId]
  const binding = capability?.providers?.find((entry) => entry.providerId === providerId)
  return binding?.models?.join(', ') ?? ''
}

function handleCapabilityModels(
  capabilityId: string,
  providerId: string,
  value: string
): void {
  const models = value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
  updateCapabilityBinding(capabilityId, providerId, { models })
}

function handleCapabilityPrompt(capabilityId: string, prompt: string): void {
  updateCapability(capabilityId, { promptTemplate: prompt })
}

function activeBindings(capabilityId: string): Array<AiCapabilityProviderBinding & { provider?: AiProviderConfig }> {
  const capability = capabilities.value[capabilityId]
  if (!capability?.providers) return []
  return capability.providers
    .filter((binding) => binding.enabled !== false)
    .map((binding) => ({
      ...binding,
      provider: providerMap.value.get(binding.providerId)
    }))
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
      message: t('settings.aisdk.capabilityTestHint'),
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
