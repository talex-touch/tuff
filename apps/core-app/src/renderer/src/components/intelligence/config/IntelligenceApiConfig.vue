<template>
  <div class="aisdk-api-config">
    <TuffBlockInput
      v-model="localApiKey"
      :title="t('aisdk.config.api.apiKey')"
      :description="apiKeyError || t('aisdk.config.api.apiKeyRequired')"
      :placeholder="t('aisdk.config.api.apiKeyPlaceholder')"
      default-icon="i-carbon-password"
      active-icon="i-carbon-password"
      @blur="handleApiKeyBlur"
    >
      <template #control="{ modelValue, update, focus }">
        <FlatInput
          :model-value="modelValue"
          :placeholder="t('aisdk.config.api.apiKeyPlaceholder')"
          password
          @update:model-value="update"
          @focus="focus"
          @blur="handleApiKeyBlur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="localBaseUrl"
      :title="t('aisdk.config.api.baseUrl')"
      :description="baseUrlError || t('aisdk.config.api.baseUrlHint')"
      :placeholder="t('aisdk.config.api.baseUrlPlaceholder')"
      default-icon="i-carbon-link"
      active-icon="i-carbon-link"
      clearable
      @blur="handleBaseUrlBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <FlatInput
          :model-value="modelValue"
          :placeholder="t('aisdk.config.api.baseUrlPlaceholder')"
          @update:model-value="update"
          @focus="focus"
          @blur="handleBaseUrlBlur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockSlot
      :title="t('aisdk.config.api.testConnection')"
      :description="t('aisdk.config.api.testConnectionHint')"
      default-icon="i-carbon-content-delivery-network"
      active-icon="i-carbon-content-delivery-network"
      :active="!!testResult"
      guidance
    >
      <div class="flex items-center gap-2">
        <div class="flex">
          <div v-if="testResult" class="flex items-center gap-2 text-green-600 text-sm">
            <i class="i-carbon-checkmark-filled-warning" />
            <span>{{ testResult }}</span>
          </div>
          <div v-else-if="testError" class="flex items-center gap-2 text-red-600 text-sm">
            <i class="i-carbon-warning-filled" />
            <span>{{ testError }}</span>
          </div>
        </div>
        <FlatButton v-if="canTest" :disabled="isTesting" :loading="isTesting" @click="handleTest">
          <i v-if="isTesting" class="i-carbon-renew animate-spin" />
          <i v-else class="i-carbon-play-filled" />
          <span>{{ t('aisdk.config.api.testButton') }}</span>
        </FlatButton>
      </div>
    </TuffBlockSlot>
  </div>
</template>

<script lang="ts" name="IntelligenceApiConfig" setup>
import { ref, computed, getCurrentInstance } from 'vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatInput from '~/components/base/input/FlatInput.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'
import { intelligenceSettings, type AiProviderConfig } from '@talex-touch/utils/renderer/storage'
import { forDialogMention } from '~/modules/mention/dialog-mention'

const props = defineProps<{
  modelValue: AiProviderConfig
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AiProviderConfig]
  change: []
  testSuccess: [models: string[]]
}>()

const instance = getCurrentInstance()
const t = (key: string) => instance?.proxy?.$t(key) || key

const aiClient = createIntelligenceClient(touchChannel as any)

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

const apiKeyError = ref('')
const baseUrlError = ref('')
const testError = ref('')
const testResult = ref('')
const isTesting = ref(false)

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

async function handleTest() {
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
      rateLimit: props.modelValue.rateLimit
        ? {
            requestsPerMinute: props.modelValue.rateLimit.requestsPerMinute || undefined,
            tokensPerMinute: props.modelValue.rateLimit.tokensPerMinute || undefined
          }
        : undefined,
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

    const result = (await aiClient.testProvider(testProvider)) as any

    if (result?.success) {
      testResult.value = t('aisdk.config.api.testSuccess')

      // 使用 MentionDialog 显示成功消息
      await forDialogMention(
        '连接测试成功',
        `已成功连接到 ${props.modelValue.name}`,
        { type: 'remix', value: 'ri-checkbox-circle-line' },
        [{ content: '确定', type: 'success', onClick: () => true }]
      )

      // 尝试获取可用模型列表
      await fetchAvailableModels(testProvider)
    } else {
      testError.value = result?.message || '连接失败'

      // 使用 MentionDialog 显示失败消息
      await forDialogMention(
        '连接测试失败',
        result?.message || '无法连接到提供商，请检查您的配置',
        { type: 'remix', value: 'ri-error-warning-line' },
        [{ content: '确定', type: 'danger', onClick: () => true }]
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败'
    testError.value = message

    // 使用 MentionDialog 显示错误消息
    await forDialogMention(
      '连接测试失败',
      `连接过程中发生错误: ${message}`,
      { type: 'remix', value: 'ri-error-warning-line' },
      [{ content: '确定', type: 'danger', onClick: () => true }]
    )

    console.error('[API Config] Test connection failed:', error)
  } finally {
    isTesting.value = false
  }
}

async function fetchAvailableModels(provider: any) {
  try {
    console.log('[API Config] Fetching available models...')

    // 使用 intelligence client 获取模型列表
    const result = (await aiClient.fetchModels(provider)) as any

    if (result?.success && result?.models) {
      // 直接更新 provider 的模型列表
      intelligenceSettings.updateProvider(provider.id, {
        models: result.models
      })
      emits('testSuccess', result.models)

      // 使用 MentionDialog 显示获取模型成功消息
      await forDialogMention(
        '模型获取成功',
        `已获取 ${result.models.length} 个可用模型`,
        { type: 'remix', value: 'ri-checkbox-circle-line' },
        [{ content: '确定', type: 'success', onClick: () => true }]
      )
    } else {
      console.log('[API Config] Failed to fetch models:', result?.message)
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
</style>
