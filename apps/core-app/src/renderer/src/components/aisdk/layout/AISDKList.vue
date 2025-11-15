<template>
  <TouchScroll class="AISDKList-Container cubic-transition">
    <div class="AISDKList-Toolbox w-full">
      <div class="search-wrapper">
        <i class="i-ri-search-line search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('aisdk.search.placeholder')"
          class="search-input"
        />
        <i v-if="searchQuery" class="i-ri-close-line clear-icon" @click="searchQuery = ''" />
      </div>
    </div>

    <AISDKListModule
      v-model="selectedId"
      :providers="filteredEnabledProviders"
      :title="t('aisdk.list.enabled')"
      icon="i-ri-check-line"
      @toggle="handleToggle"
    />

    <AISDKListModule
      v-model="selectedId"
      :providers="filteredDisabledProviders"
      :title="t('aisdk.list.disabled')"
      icon="i-ri-close-line"
      @toggle="handleToggle"
    />
  </TouchScroll>
</template>

<script lang="ts" name="AISDKList" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '@comp/base/TouchScroll.vue'
import AISDKListModule from './AISDKListModule.vue'

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
  toggle: [provider: AiProviderConfig]
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

function handleToggle(provider: AiProviderConfig) {
  emits('toggle', provider)
}
</script>

<style lang="scss" scoped>
.AISDKList-Toolbox {
  z-index: 1;
  position: sticky;
  padding: 2px 2%;
  top: 1%;
  width: 100%;
  height: 36px;
  border-radius: 8px;
  box-sizing: border-box;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  padding: 0 12px;
  height: 32px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--el-border-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
    border-color: var(--el-border-color);
  }

  &:focus-within {
    background: var(--el-fill-color);
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
  }
}

.search-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-right: 8px;
  transition: color 0.3s ease;
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
  }
}

.clear-icon {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  margin-left: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--el-text-color-regular);
    background: var(--el-fill-color);
  }
}

.AISDKList-Container {
  position: relative;
  padding: 0 0.5rem;
  width: 100%;
  box-sizing: border-box;
}
</style>
