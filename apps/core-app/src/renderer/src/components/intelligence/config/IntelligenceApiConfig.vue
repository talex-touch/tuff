<script lang="ts" name="IntelligenceApiConfig" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { TxPopover } from '@talex-touch/tuffex/popover'
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { createIntelligenceClient } from '@talex-touch/tuff-intelligence'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatInput from '~/components/base/input/FlatInput.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { isNexusManagedProvider } from '~/modules/intelligence/nexus-provider'
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

const requiresApiKey = computed(() => {
  if (props.modelValue.type === 'local') {
    return false
  }
  return !isNexusManagedProvider(props.modelValue)
})

const apiKeyDescription = computed(() => {
  if (apiKeyError.value) {
    return apiKeyError.value
  }
  if (!requiresApiKey.value) {
    return t('settings.intelligence.nexusManagedApiKeyHint')
  }
  return t('intelligence.config.api.apiKeyRequired')
})

const canTest = computed(() => {
  if (!isBaseUrlValid(localBaseUrl.value)) {
    return false
  }
  if (!requiresApiKey.value) {
    return true
  }
  return localApiKey.value.trim().length > 0
})

function resolveTestFailureMessage(result?: { code?: string; message?: string }): string {
  if (result?.code === 'NETWORK_COOLDOWN_ACTIVE') {
    const retryAfterSeconds = Number(result.message?.match(/^NETWORK_COOLDOWN_ACTIVE:(\d+)$/)?.[1])
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return t('intelligence.config.api.networkRecoveringWithRetry', {
        seconds: retryAfterSeconds
      })
    }
    return t('intelligence.config.api.networkRecovering')
  }
  return result?.message || t('intelligence.config.api.connectionFailed')
}

function validateApiKey(value: string): boolean {
  apiKeyError.value = ''

  if (requiresApiKey.value && !value.trim()) {
    apiKeyError.value = t('intelligence.config.api.apiKeyRequired')
    return false
  }

  return true
}

function isBaseUrlValid(value: string): boolean {
  if (!value.trim()) {
    return true
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function validateBaseUrl(value: string): boolean {
  baseUrlError.value = ''

  if (!isBaseUrlValid(value)) {
    baseUrlError.value = t('intelligence.config.api.baseUrlInvalid')
    return false
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
  if (!validateBaseUrl(localBaseUrl.value) || !validateApiKey(localApiKey.value)) return

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
      apiKey: localApiKey.value.trim() || undefined,
      baseUrl: localBaseUrl.value.trim() || undefined,
      models: Array.isArray(props.modelValue.models) ? [...props.modelValue.models] : [],
      defaultModel: props.modelValue.defaultModel || undefined,
      instructions: props.modelValue.instructions || undefined,
      metadata: props.modelValue.metadata ? { ...props.modelValue.metadata } : undefined,
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
      code?: string
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
      const message = resolveTestFailureMessage(result)
      testError.value = message

      await forDialogMention(
        t('intelligence.config.api.testFailedTitle'),
        message || t('intelligence.config.api.testFailedDesc'),
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
      :description="apiKeyDescription"
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
      <div class="aisdk-api-config__test-row">
        <div class="aisdk-api-config__test-status">
          <div v-if="testResult" class="aisdk-api-config__test-success">
            <i class="i-carbon-checkmark-filled-warning" />
            <span>{{ testResult }}</span>
          </div>
          <TxPopover
            v-else-if="testError"
            trigger="hover"
            placement="top-end"
            :width="360"
            :max-width="420"
            :open-delay="160"
            :close-delay="80"
            panel-background="refraction"
            panel-shadow="soft"
          >
            <template #reference>
              <div class="aisdk-api-config__test-error" :title="testError">
                <i class="i-carbon-warning-filled" />
                <span>{{ testError }}</span>
              </div>
            </template>
            <p class="aisdk-api-config__error-popover">
              {{ testError }}
            </p>
          </TxPopover>
        </div>
        <TxButton
          variant="flat"
          :disabled="!canTest || isTesting"
          :loading="isTesting"
          @click="handleTest"
        >
          <i v-if="!isTesting" class="i-carbon-play-filled" />
          <span>{{ t('intelligence.config.api.testButton') }}</span>
        </TxButton>
      </div>
    </TuffBlockSlot>
  </div>
</template>

<style lang="scss" scoped>
.aisdk-api-config__test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.aisdk-api-config__test-status {
  display: flex;
  align-items: center;
  max-width: min(240px, 32vw);
  min-width: 0;
}

.aisdk-api-config__test-success,
.aisdk-api-config__test-error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 0.875rem;
}

.aisdk-api-config__test-success {
  color: var(--tx-color-success);
}

.aisdk-api-config__test-error {
  color: var(--tx-color-danger);
  cursor: help;
}

.aisdk-api-config__test-success span,
.aisdk-api-config__test-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aisdk-api-config__error-popover {
  margin: 0;
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--tx-text-color-primary);
  line-height: 1.5;
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
</style>
