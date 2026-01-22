<script lang="ts" name="IntelligenceList" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TuffListGroup } from '~/components/tuff/template/TuffListTemplate.vue'
import TuffListTemplate from '~/components/tuff/template/TuffListTemplate.vue'
import IntelligenceItem from './IntelligenceItem.vue'

interface IntelligenceProviderConfig {
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
  providers: IntelligenceProviderConfig[]
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

const listGroups = computed<TuffListGroup<unknown>[]>(() => [
  {
    id: 'enabled',
    title: t('intelligence.list.enabled'),
    icon: 'i-ri-check-line',
    badgeText: String(filteredEnabledProviders.value.length),
    items: filteredEnabledProviders.value,
    collapsible: false,
    badgeVariant: 'success' as const,
    itemKey: (provider) => (provider as IntelligenceProviderConfig).id
  },
  {
    id: 'disabled',
    title: t('intelligence.list.disabled'),
    icon: 'i-ri-close-line',
    badgeText: String(filteredDisabledProviders.value.length),
    items: filteredDisabledProviders.value,
    collapsible: true,
    collapsed: false,
    badgeVariant: 'info' as const,
    itemKey: (provider) => (provider as IntelligenceProviderConfig).id
  }
])

function handleItemClick(id: string): void {
  selectedId.value = id
}

function isProvider(item: unknown): item is IntelligenceProviderConfig {
  return (
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item && 'type' in item
  )
}
</script>

<template>
  <aside class="IntelligenceList h-full">
    <TuffListTemplate
      :groups="listGroups"
      :empty-text="t('intelligence.list.empty')"
      class="h-full"
    >
      <template #item="{ item }">
        <IntelligenceItem
          v-if="isProvider(item)"
          :provider="item"
          :is-selected="item.id === selectedId"
          role="listitem"
          @click="handleItemClick(item.id)"
        />
      </template>
    </TuffListTemplate>
  </aside>
</template>
