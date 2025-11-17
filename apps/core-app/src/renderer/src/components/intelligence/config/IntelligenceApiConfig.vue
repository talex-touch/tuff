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
        <FlatInput
          :model-value="modelValue"
          :placeholder="t('aisdk.config.api.apiKeyPlaceholder')"
          :disabled="disabled"
          password
          @update:model-value="update"
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
    >
      <template #control="{ modelValue, update, focus, blur }">
        <FlatInput
          :model-value="modelValue"
          :placeholder="t('aisdk.config.api.baseUrlPlaceholder')"
          :disabled="disabled"
          @update:model-value="update"
          @focus="focus"
          @blur="blur(); handleBaseUrlBlur()"
        />
      </template>
    </TuffBlockInput>

    <!-- 连接状态显示 -->
    <TuffBlockInput
      :model-value="''"
      :title="t('aisdk.config.api.testConnection')"
      :description="testError || testResult || t('aisdk.config.api.testConnectionHint')"
      default-icon="i-carbon-network"
      active-icon="i-carbon-network"
      :disabled="true"
      readonly
    >
      <template #control>
        <div class="test-status-display">
          <div v-if="isTesting" class="status-item testing">
            <i class="i-carbon-renew animate-spin" />
            <span>{{ t('aisdk.config.api.testButton') }}...</span>
          </div>
          <div v-else-if="testResult" class="status-item success">
            <i class="i-carbon-checkmark" />
            <span>{{ testResult }}</span>
          </div>
          <div v-else-if="testError" class="status-item error">
            <i class="i-carbon-warning" />
            <span>{{ testError }}</span>
          </div>
          <div v-else class="status-item idle">
            <i class="i-carbon-play" />
            <span>{{ t('aisdk.config.api.testConnectionHint') }}</span>
          </div>
        </div>
      </template>
    </TuffBlockInput>
  </div>
</template>

<script lang="ts" name="IntelligenceApiConfig" setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { toast } from 'vue-sonner'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import FlatInput from '~/components/base/input/FlatInput.vue'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'
import { intelligenceSettings, type AiProviderConfig } from '@talex-touch/utils/renderer/storage'

const props = defineProps<{
  modelValue: AiProviderConfig
  disabled?: boolean
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AiProviderConfig]
  change: []
  testSuccess: [models: string[]]
}>()

const instance = getCurrentInstance()
const t = (key: string) => instance?.proxy?.$t(key) || key

const aiClient = createIntelligenceClient(touchChannel as any)

// 直接使用 reactive 对象的计算属性
const localApiKey = computed({
  get: () => props.modelValue.apiKey || '',
  set: (value: string) => {
    intelligenceSettings.updateProvider(props.modelValue.id, {
      apiKey: value.trim() || undefined
    })
    emits('change')
  }
})

const localBaseUrl = computed({
  get: () => props.modelValue.baseUrl || '',
  set: (value: string) => {
    intelligenceSettings.updateProvider(props.modelValue.id, {
      baseUrl: value.trim() || undefined
    })
    emits('change')
  }
})

const testModelName = ref('')
const apiKeyError = ref('')
const baseUrlError = ref('')
const testError = ref('')
const testResult = ref('')
const isTesting = ref(false)

// 是否可以进行测试（只需要有 API Key，不需要启用）
const canTest = computed(() => {
  const hasApiKey = localApiKey.value.trim().length > 0
  const isNotLocal = props.modelValue.type !== 'local'
  return hasApiKey && isNotLocal
})

function validateApiKey(value: string): boolean {
  apiKeyError.value = ''

  if (props.modelValue.type !== 'local' && !value.trim()) {
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
  validateApiKey(localApiKey.value)
}

function handleBaseUrlBlur() {
  validateBaseUrl(localBaseUrl.value)
}

async function handleTestConnection() {
  if (!canTest.value || isTesting.value) return

  isTesting.value = true
  testError.value = ''
  testResult.value = ''

  try {
    // 创建临时提供商配置用于测试 - 确保所有字段都是可序列化的
    const testProvider = {
      id: props.modelValue.id,
      type: props.modelValue.type,
      name: props.modelValue.name,
      enabled: true, // 测试时强制启用
      apiKey: localApiKey.value.trim(),
      baseUrl: localBaseUrl.value.trim() || undefined,
      models: Array.isArray(props.modelValue.models) ? [...props.modelValue.models] : [],
      defaultModel: props.modelValue.defaultModel || undefined,
      instructions: props.modelValue.instructions || undefined,
      timeout: Number(props.modelValue.timeout) || 30000,
      rateLimit: props.modelValue.rateLimit ? {
        requestsPerMinute: props.modelValue.rateLimit.requestsPerMinute || undefined,
        tokensPerMinute: props.modelValue.rateLimit.tokensPerMinute || undefined
      } : undefined,
      priority: Number(props.modelValue.priority) || 1
    }

    // 使用默认模型或 gpt-3.5-turbo 进行测试
    const modelToTest = props.modelValue.defaultModel || 'gpt-3.5-turbo'

    console.log('[API Config] Testing provider connection...', {
      type: testProvider.type,
      model: modelToTest,
      hasApiKey: !!testProvider.apiKey,
      baseUrl: testProvider.baseUrl
    })

    const result = await aiClient.testProvider(testProvider)

    if (result.success) {
      testResult.value = t('aisdk.config.api.testSuccess')
      toast.success(t('aisdk.config.api.testSuccess'))

      // 尝试获取可用模型列表
      await fetchAvailableModels(testProvider)
    } else {
      testError.value = result.message || '连接失败'
      toast.error(`连接测试失败: ${result.message}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败'
    testError.value = message
    toast.error(`连接测试失败: ${message}`)
    console.error('[API Config] Test connection failed:', error)
  } finally {
    isTesting.value = false
  }
}

async function fetchAvailableModels(provider: AiProviderConfig) {
  try {
    console.log('[API Config] Fetching available models...')

    // 使用 intelligence client 获取模型列表
    const result = await aiClient.fetchModels(provider)

    if (result.success && result.models) {
      // 直接更新 provider 的模型列表
      intelligenceSettings.updateProvider(provider.id, {
        models: result.models
      })
      emits('testSuccess', result.models)

      toast.success(`已获取 ${result.models.length} 个可用模型`)
    } else {
      console.log('[API Config] Failed to fetch models:', result.message)
      // 即使获取模型失败，连接测试也算成功
      // 发送空数组，表示测试成功但没有获取到模型
      emits('testSuccess', [])
    }
  } catch (error) {
    console.error('[API Config] Failed to fetch models:', error)
    // 即使获取模型失败，连接测试也算成功
    emits('testSuccess', [])
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

  .test-status-display {
    width: 100%;
    padding: 8px 12px;

    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;

      &.testing {
        color: var(--el-color-primary);
      }

      &.success {
        color: var(--el-color-success);
      }

      &.error {
        color: var(--el-color-error);
      }

      &.idle {
        color: var(--el-text-color-secondary);
      }

      i {
        font-size: 16px;
      }
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
