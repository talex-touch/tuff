<template>
  <aside class="IntelligenceList h-full flex flex-col">
    <IntelligenceListModule
      v-model="selectedId"
      :providers="filteredEnabledProviders"
      :title="t('intelligence.list.enabled')"
      icon="i-ri-check-line"
      section-id="enabled-providers"
    />

    <IntelligenceListModule
      v-model="selectedId"
      :providers="filteredDisabledProviders"
      :title="t('intelligence.list.disabled')"
      icon="i-ri-close-line"
      section-id="disabled-providers"
    />
  </aside>
</template>

<script lang="ts" name="IntelligenceList" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import IntelligenceListModule from './IntelligenceListModule.vue'

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
  providers: AiProviderConfig[]
  selectedId?: string | null
  searchQuery?: string
}>()

const emits = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()
const selectedId = ref<string | null>(props.selectedId || null)
const normalizedQuery = computed(() => props.searchQuery?.trim().toLowerCase() ?? '')

// Separate enabled and disabled providers
const enabledProviders = computed(() => props.providers.filter((provider) => provider.enabled))

const disabledProviders = computed(() => props.providers.filter((provider) => !provider.enabled))

// Filter providers based on search query
const filteredEnabledProviders = computed(() => {
  if (!normalizedQuery.value) {
    return enabledProviders.value
  }

  return enabledProviders.value.filter(
    (provider) =>
      provider.name.toLowerCase().includes(normalizedQuery.value) ||
      provider.type.toLowerCase().includes(normalizedQuery.value)
  )
})

const filteredDisabledProviders = computed(() => {
  if (!normalizedQuery.value) {
    return disabledProviders.value
  }

  return disabledProviders.value.filter(
    (provider) =>
      provider.name.toLowerCase().includes(normalizedQuery.value) ||
      provider.type.toLowerCase().includes(normalizedQuery.value)
  )
})

// Watch for selection changes and emit
watch(
  () => selectedId.value,
  (newId) => {
    if (newId) {
      emits('select', newId)
    }
  }
)

// Watch for external selectedId changes
watch(
  () => props.selectedId,
  (newId) => {
    selectedId.value = newId || null
  }
)
</script>
