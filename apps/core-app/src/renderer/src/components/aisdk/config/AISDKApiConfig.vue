<template>
  <div class="aisdk-api-config">
    <!-- API Key Input -->
    <TuffBlockInput
      v-model="localApiKey"
      :title="t('aisdk.config.api.apiKey')"
      :description="apiKeyError || t('aisdk.config.api.apiKeyRequired')"
      :placeholder="t('aisdk.config.api.apiKeyPlaceholder')"
      default-icon="i-carbon-password"
      active-icon="i-carbon-password"
      :disabled="disabled"
      @blur="handleApiKeyBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <input
          :value="modelValue"
          type="password"
          :placeholder="t('aisdk.config.api.apiKeyPlaceholder')"
          :disabled="disabled"
          class="tuff-input"
          @input="update(($event.target as HTMLInputElement).value)"
          @focus="focus"
          @blur="blur(); handleApiKeyBlur()"
        />
      </template>
    </TuffBlockInput>

    <!-- Base URL Input -->
    <TuffBlockInput
      v-model="localBaseUrl"
      :title="t('aisdk.config.api.baseUrl')"
      :description="baseUrlError || t('aisdk.config.api.baseUrlHint')"
      :placeholder="t('aisdk.config.api.baseUrlPlaceholder')"
      default-icon="i-carbon-link"
      active-icon="i-carbon-link"
      :disabled="disabled"
      clearable
      @blur="handleBaseUrlBlur"
    />
  </div>
</template>

<script lang="ts" name="AISDKApiConfig" setup>
import { ref, watch, getCurrentInstance } from 'vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'

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
  modelValue: AiProviderConfig
  disabled?: boolean
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AiProviderConfig]
  change: []
}>()

const instance = getCurrentInstance()
const t = (key: string) => instance?.proxy?.$t(key) || key

const localApiKey = ref(props.modelValue.apiKey || '')
const localBaseUrl = ref(props.modelValue.baseUrl || '')
const apiKeyError = ref('')
const baseUrlError = ref('')

// Watch for external changes
watch(
  () => props.modelValue.apiKey,
  (newValue) => {
    localApiKey.value = newValue || ''
  }
)

watch(
  () => props.modelValue.baseUrl,
  (newValue) => {
    localBaseUrl.value = newValue || ''
  }
)

function validateApiKey(value: string): boolean {
  apiKeyError.value = ''
  
  if (props.modelValue.enabled && props.modelValue.type !== 'local' && !value.trim()) {
    apiKeyError.value = t('aisdk.config.api.apiKeyRequired')
    return false
  }
  
  return true
}

function validateBaseUrl(value: string): boolean {
  baseUrlError.value = ''
  
  if (value.trim()) {
    try {
      new URL(value)
    } catch {
      baseUrlError.value = t('aisdk.config.api.baseUrlInvalid')
      return false
    }
  }
  
  return true
}

function handleApiKeyBlur() {
  if (validateApiKey(localApiKey.value)) {
    const updated = {
      ...props.modelValue,
      apiKey: localApiKey.value.trim() || undefined
    }
    emits('update:modelValue', updated)
    emits('change')
  }
}

function handleBaseUrlBlur() {
  if (validateBaseUrl(localBaseUrl.value)) {
    const updated = {
      ...props.modelValue,
      baseUrl: localBaseUrl.value.trim() || undefined
    }
    emits('update:modelValue', updated)
    emits('change')
  }
}
</script>

<style lang="scss" scoped>
.aisdk-api-config {
  .tuff-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
    transition: all 0.2s;

    &:focus {
      border-color: var(--el-color-primary);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &::placeholder {
      color: var(--el-text-color-placeholder);
    }
  }
}
</style>
