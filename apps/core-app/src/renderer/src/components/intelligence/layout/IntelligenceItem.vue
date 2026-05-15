<script lang="ts" name="IntelligenceItemRefactored" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type {
  TuffItemBadge,
  TuffItemStatusDot
} from '~/components/tuff/template/TuffItemTemplate.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffItemTemplate from '~/components/tuff/template/TuffItemTemplate.vue'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ICON
} from '~/modules/intelligence/nexus-provider'

enum IntelligenceProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

interface IntelligenceProviderConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  metadata?: Record<string, unknown>
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
  provider: IntelligenceProviderConfig
  isSelected: boolean
  isLoggedIn?: boolean
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
  if (
    props.provider.type !== IntelligenceProviderType.LOCAL &&
    !isNexusManagedProvider(props.provider) &&
    !props.provider.apiKey
  ) {
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

const providerSubtitle = computed(() => {
  if (!isNexusManagedProvider(props.provider)) {
    return props.provider.type
  }
  return props.isLoggedIn
    ? t('intelligence.item.nexusAuthReady')
    : t('intelligence.item.nexusAuthRequired')
})

// Error badge configuration
const errorBadge = computed<TuffItemBadge>(() => ({
  text: t('intelligence.item.configError'),
  status: 'danger',
  icon: 'i-ri-error-warning-line'
}))

const nexusBadge = computed<TuffItemBadge>(() => ({
  text: t('intelligence.item.nexusOfficial'),
  status: props.isLoggedIn ? 'success' : 'info',
  icon: 'i-carbon-cloud-service-management'
}))

// Status dot configuration
const statusDot = computed<TuffItemStatusDot>(() => ({
  class: localEnabled.value ? 'is-active' : 'is-inactive',
  label: localEnabled.value ? t('intelligence.status.enabled') : t('intelligence.status.disabled')
}))

function getProviderIcon(provider: IntelligenceProviderConfig): ITuffIcon {
  if (isNexusManagedProvider(provider)) {
    return TUFF_NEXUS_PROVIDER_ICON
  }

  const iconMap: Record<string, string> = {
    [IntelligenceProviderType.OPENAI]: 'i-simple-icons-openai',
    [IntelligenceProviderType.ANTHROPIC]: 'i-simple-icons-anthropic',
    [IntelligenceProviderType.DEEPSEEK]: 'i-carbon-search-advanced',
    [IntelligenceProviderType.SILICONFLOW]: 'i-carbon-ibm-watson-machine-learning',
    [IntelligenceProviderType.LOCAL]: 'i-carbon-bare-metal-server',
    [IntelligenceProviderType.CUSTOM]: 'i-carbon-settings'
  }

  const iconClass = iconMap[provider.type] || 'i-carbon-ibm-watson-machine-learning'

  return {
    type: 'class',
    value: iconClass,
    status: 'normal' as const
  }
}

function handleClick() {
  // Click event is handled by parent
}
</script>

<template>
  <TuffItemTemplate
    :title="provider.name"
    :subtitle="providerSubtitle"
    :icon="getProviderIcon(provider)"
    :selected="isSelected"
    :top-badge="
      hasConfigError ? errorBadge : isNexusManagedProvider(provider) ? nexusBadge : undefined
    "
    :status-dot="statusDot"
    :aria-label="t('intelligence.item.selectProvider', { name: provider.name })"
    @click="handleClick"
  />
</template>
