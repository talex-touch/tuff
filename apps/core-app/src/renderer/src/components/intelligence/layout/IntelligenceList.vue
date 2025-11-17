<template>
  <aside class="AISDKList-Container h-full flex flex-col">
    <!-- Providers List Section -->
    <div class="AISDKList-Content flex-1 overflow-hidden">
      <TouchScroll>
        <div class="p-3 pb-20">
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
        </div>
      </TouchScroll>
    </div>

    <!-- Add Provider Button -->
    <div class="AISDKList-AddButton-Section flex-shrink-0 p-3 border-t border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color-page)]">
      <FlatButton
        class="add-provider-btn w-full"
        :aria-label="t('settings.intelligence.addChannel')"
        @click="handleAddProvider"
      >
        <i class="i-carbon-add" aria-hidden="true" />
        <span>{{ t('settings.intelligence.addChannel') }}</span>
      </FlatButton>
    </div>
  </aside>
</template>

<script lang="ts" name="IntelligenceList" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import IntelligenceListModule from './IntelligenceListModule.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'

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
  addProvider: []
}>()

const { t } = useI18n()
const selectedId = ref<string | null>(props.selectedId || null)
const normalizedQuery = computed(() => props.searchQuery?.trim().toLowerCase() ?? '')

// Separate enabled and disabled providers
const enabledProviders = computed(() =>
  props.providers.filter((provider) => provider.enabled)
)

const disabledProviders = computed(() =>
  props.providers.filter((provider) => !provider.enabled)
)

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

function handleAddProvider() {
  emits('addProvider')
}

</script>

<style lang="scss" scoped>
.AISDKList-Container {
  background: var(--el-bg-color);
  position: relative;
}

.AISDKList-Content {
  background: var(--el-bg-color);
}

.AISDKList-AddButton-Section {
  background: var(--el-bg-color);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.add-provider-btn {
  height: 40px;
  border-radius: 12px;
  border: none;
  background: var(--el-color-primary);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-size: 14px;
  font-weight: 500;

  &:hover {
    background: var(--el-color-primary-light-3);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(var(--el-color-primary-rgb), 0.3);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }

  i {
    font-size: 16px;
  }
}

</style>
