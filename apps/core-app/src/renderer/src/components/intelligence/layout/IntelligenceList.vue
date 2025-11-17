<template>
  <aside class="AISDKList-Container h-full flex flex-col">
    <!-- Search Section -->
    <div class="AISDKList-Search-Section flex-shrink-0 p-3 border-b border-[var(--el-border-color-lighter)]">
      <div class="search-wrapper">
        <label for="provider-search" class="sr-only">{{ t('aisdk.search.label') }}</label>
        <i class="i-ri-search-line search-icon" aria-hidden="true" />
        <input
          id="provider-search"
          v-model="searchQuery"
          type="search"
          :placeholder="t('aisdk.search.placeholder')"
          :aria-label="t('aisdk.search.label')"
          :aria-describedby="searchQuery ? 'search-results-count' : undefined"
          class="search-input"
          autocomplete="off"
        />
        <FlatButton
          v-if="searchQuery"
          class="clear-icon"
          mini
          :aria-label="t('aisdk.search.clear')"
          @click="clearSearch"
          @keydown.enter="clearSearch"
          @keydown.space.prevent="clearSearch"
        >
          <i class="i-ri-close-line" aria-hidden="true" />
        </FlatButton>
      </div>

      <div
        v-if="searchQuery"
        id="search-results-count"
        class="sr-only"
        role="status"
        aria-live="polite"
      >
        {{ t('aisdk.search.results', {
          count: filteredEnabledProviders.length + filteredDisabledProviders.length
        }) }}
      </div>
    </div>

    <!-- Providers List Section -->
    <div class="AISDKList-Content flex-1 overflow-hidden">
      <TouchScroll>
        <div class="p-3 pb-20">
          <IntelligenceListModule
            v-model="selectedId"
            :providers="filteredEnabledProviders"
            :title="t('aisdk.list.enabled')"
            icon="i-ri-check-line"
            section-id="enabled-providers"
          />

          <IntelligenceListModule
            v-model="selectedId"
            :providers="filteredDisabledProviders"
            :title="t('aisdk.list.disabled')"
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
        :aria-label="t('settings.aisdk.addChannel')"
        @click="handleAddProvider"
      >
        <i class="i-carbon-add" aria-hidden="true" />
        <span>{{ t('settings.aisdk.addChannel') }}</span>
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
}>()

const emits = defineEmits<{
  select: [id: string]
  addProvider: []
}>()

const { t } = useI18n()
const searchQuery = ref('')
const selectedId = ref<string | null>(props.selectedId || null)

// Separate enabled and disabled providers
const enabledProviders = computed(() =>
  props.providers.filter((provider) => provider.enabled)
)

const disabledProviders = computed(() =>
  props.providers.filter((provider) => !provider.enabled)
)

// Filter providers based on search query
const filteredEnabledProviders = computed(() => {
  if (!searchQuery.value.trim()) {
    return enabledProviders.value
  }

  const query = searchQuery.value.toLowerCase()
  return enabledProviders.value.filter(
    (provider) =>
      provider.name.toLowerCase().includes(query) ||
      provider.type.toLowerCase().includes(query)
  )
})

const filteredDisabledProviders = computed(() => {
  if (!searchQuery.value.trim()) {
    return disabledProviders.value
  }

  const query = searchQuery.value.toLowerCase()
  return disabledProviders.value.filter(
    (provider) =>
      provider.name.toLowerCase().includes(query) ||
      provider.type.toLowerCase().includes(query)
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

function clearSearch() {
  searchQuery.value = ''
}
</script>

<style lang="scss" scoped>
.AISDKList-Container {
  background: var(--el-bg-color);
  position: relative;
}

.AISDKList-Search-Section {
  background: var(--el-bg-color);
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  padding: 0 12px;
  height: 36px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-border-color);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  }

  &:focus-within {
    background: var(--el-fill-color);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 0 0 3px var(--el-color-primary-light-9), 0 2px 4px rgba(0, 0, 0, 0.06);
  }
}

.search-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-right: 8px;
  transition: color 0.3s ease;

  .search-wrapper:focus-within & {
    color: var(--el-color-primary);
  }
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 13px;
  height: 100%;

  &::placeholder {
    color: var(--el-text-color-placeholder);
    transition: color 0.3s ease;
  }

  &:focus::placeholder {
    color: var(--el-text-color-disabled);
  }
}

.clear-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-left: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 0;

  &:hover {
    color: var(--el-text-color-regular);
    background: var(--el-fill-color);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }

  :deep(> div) {
    padding: 0;
  }
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
