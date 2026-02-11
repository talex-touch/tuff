<script lang="ts" name="IntelligenceApiConfig" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/utils/renderer/storage'
import { TxButton } from '@talex-touch/tuffex'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatInput from '~/components/base/input/FlatInput.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { forDialogMention } from '~/modules/mention/dialog-mention'

const props = defineProps<{
  modelValue: IntelligenceProviderConfig
}>()

const emits = defineEmits<{
  'update:modelValue': [value: IntelligenceProviderConfig]
  change: []
  testSuccess: [models: string[]]
}>()

const { t } = useI18n()

const transport = useTuffTransport()
const aiClient = createIntelligenceClient(transport)

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
    apiKeyError.value = t('intelligence.config.api.apiKeyRequired')
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
      baseUrlError.value = t('intelligence.config.api.baseUrlInvalid')
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

    const result = (await aiClient.testProvider(testProvider)) as {
      success?: boolean
      message?: string
    }

    if (result?.success) {
      testResult.value = t('intelligence.config.api.testSuccess')

      await forDialogMention(
        t('intelligence.config.api.testSuccessTitle'),
        t('intelligence.config.api.testSuccessDesc', { name: props.modelValue.name }),
        { type: 'class', value: 'i-ri-checkbox-circle-line' },
        [{ content: t('intelligence.config.api.confirm'), type: 'success', onClick: () => true }]
      )

      await fetchAvailableModels(testProvider)
    } else {
      testError.value = result?.message || t('intelligence.config.api.connectionFailed')

      await forDialogMention(
        t('intelligence.config.api.testFailedTitle'),
        result?.message || t('intelligence.config.api.testFailedDesc'),
        { type: 'class', value: 'i-ri-error-warning-line' },
        [{ content: t('intelligence.config.api.confirm'), type: 'danger', onClick: () => true }]
      )
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('intelligence.config.api.connectionFailed')
    testError.value = message

    await forDialogMention(
      t('intelligence.config.api.testFailedTitle'),
      t('intelligence.config.api.testErrorDesc', { message }),
      { type: 'class', value: 'i-ri-error-warning-line' },
      [{ content: t('intelligence.config.api.confirm'), type: 'danger', onClick: () => true }]
    )
  } finally {
    isTesting.value = false
  }
}

async function fetchAvailableModels(provider: IntelligenceProviderConfig) {
  try {
    const result = (await aiClient.fetchModels(provider)) as {
      success?: boolean
      models?: string[]
      message?: string
    }

    if (result?.success && result?.models) {
      intelligenceSettings.updateProvider(provider.id, {
        models: result.models
      })
      emits('testSuccess', result.models)

      await forDialogMention(
        t('intelligence.config.api.modelsFetchSuccessTitle'),
        t('intelligence.config.api.modelsFetchSuccessDesc', { count: result.models.length }),
        { type: 'class', value: 'i-ri-checkbox-circle-line' },
        [{ content: t('intelligence.config.api.confirm'), type: 'success', onClick: () => true }]
      )
    } else {
      emits('testSuccess', [])
    }
  } catch {
    emits('testSuccess', [])
  }
}
</script>

<template>
  <div class="aisdk-api-config">
    <TuffBlockInput
      v-model="localApiKey"
      :title="t('intelligence.config.api.apiKey')"
      :description="apiKeyError || t('intelligence.config.api.apiKeyRequired')"
      :placeholder="t('intelligence.config.api.apiKeyPlaceholder')"
      default-icon="i-carbon-password"
      active-icon="i-carbon-password"
      @blur="handleApiKeyBlur"
    >
      <template #control="{ modelValue: slotValue, update, focus }">
        <FlatInput
          v-model="slotValue as string"
          :placeholder="t('intelligence.config.api.apiKeyPlaceholder')"
          password
          @update:model-value="update"
          @focus="focus"
          @blur="handleApiKeyBlur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="localBaseUrl"
      :title="t('intelligence.config.api.baseUrl')"
      :description="baseUrlError || t('intelligence.config.api.baseUrlHint')"
      :placeholder="t('intelligence.config.api.baseUrlPlaceholder')"
      default-icon="i-carbon-link"
      active-icon="i-carbon-link"
      clearable
      @blur="handleBaseUrlBlur"
    >
      <template #control="{ modelValue: slotValue, update, focus }">
        <FlatInput
          :model-value="String(slotValue)"
          :placeholder="t('intelligence.config.api.baseUrlPlaceholder')"
          @update:model-value="update"
          @focus="focus"
          @blur="handleBaseUrlBlur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockSlot
      :title="t('intelligence.config.api.testConnection')"
      :description="t('intelligence.config.api.testConnectionHint')"
      default-icon="i-carbon-content-delivery-network"
      active-icon="i-carbon-content-delivery-network"
      :active="!!testResult"
      guidance
    >
      <div class="flex items-center gap-2">
        <div class="flex max-w-[200px] truncate">
          <div v-if="testResult" class="flex items-center gap-2 text-green-600 text-sm">
            <i class="i-carbon-checkmark-filled-warning" />
            <span>{{ testResult }}</span>
          </div>
          <div v-else-if="testError" class="flex items-center gap-2 text-red-600 text-sm">
            <i class="i-carbon-warning-filled" />
            <span>{{ testError }}</span>
          </div>
        </div>
        <TxButton
          variant="flat"
          :disabled="!canTest || isTesting"
          :loading="isTesting"
          @click="handleTest"
        >
          <i v-if="isTesting" class="i-carbon-renew animate-spin" />
          <i v-else class="i-carbon-play-filled" />
          <span>{{ t('intelligence.config.api.testButton') }}</span>
        </TxButton>
      </div>
    </TuffBlockSlot>
  </div>
</template>

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
