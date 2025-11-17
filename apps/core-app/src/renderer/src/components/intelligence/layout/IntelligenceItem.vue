<template>
  <TuffItemTemplate
    :title="provider.name"
    :subtitle="provider.type"
    :icon="getProviderIconClass(provider.type)"
    :selected="isSelected"
    :top-badge="hasConfigError ? errorBadge : undefined"
    :status-dot="statusDot"
    :aria-label="t('intelligence.item.selectProvider', { name: provider.name })"
    @click="handleClick"
  />
</template>

<script lang="ts" name="IntelligenceItemRefactored" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffItemTemplate from '~/components/tuff/template/TuffItemTemplate.vue'
import type { TuffItemBadge, TuffItemStatusDot } from '~/components/tuff/template/TuffItemTemplate.vue'

enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

interface AiProviderConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: {
    requestsPerMinute?: number
    tokensPerMinute?: number
  }
  priority?: number
}

const props = defineProps<{
  provider: AiProviderConfig
  isSelected: boolean
}>()

const { t } = useI18n()
const localEnabled = ref(props.provider.enabled)

// Watch for external changes to provider.enabled
watch(
  () => props.provider.enabled,
  (newValue) => {
    localEnabled.value = newValue
  }
)

// Check if provider has configuration errors
const hasConfigError = computed(() => {
  if (!props.provider.enabled) return false

  // Check for missing API key (except for local models)
  if (props.provider.type !== AiProviderType.LOCAL && !props.provider.apiKey) {
    return true
  }

  // Check for missing models
  if (!props.provider.models || props.provider.models.length === 0) {
    return true
  }

  // Check for missing default model
  if (!props.provider.defaultModel) {
    return true
  }

  return false
})

// Error badge configuration
const errorBadge = computed<TuffItemBadge>(() => ({
  text: t('intelligence.item.configError'),
  status: 'danger',
  icon: 'i-ri-error-warning-line'
}))

// Status dot configuration
const statusDot = computed<TuffItemStatusDot>(() => ({
  class: localEnabled.value ? 'is-active' : 'is-inactive',
  label: localEnabled.value ? t('intelligence.status.enabled') : t('intelligence.status.disabled')
}))

function getProviderIconClass(type: string): string {
  const iconClasses: Record<string, string> = {
    [AiProviderType.OPENAI]: 'i-simple-icons-openai text-green-600',
    [AiProviderType.ANTHROPIC]: 'i-simple-icons-anthropic text-orange-500',
    [AiProviderType.DEEPSEEK]: 'i-carbon-search-advanced text-blue-600',
    [AiProviderType.SILICONFLOW]: 'i-carbon-ibm-watson-machine-learning text-purple-600',
    [AiProviderType.LOCAL]: 'i-carbon-bare-metal-server text-gray-600',
    [AiProviderType.CUSTOM]: 'i-carbon-settings text-gray-500'
  }
  return iconClasses[type] || 'i-carbon-ibm-watson-machine-learning text-gray-400'
}

function handleClick() {
  // Click event is handled by parent
}
</script>
