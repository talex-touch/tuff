<script lang="ts" setup>
import type { CapabilityTestResult } from './types'
import type { IntelligenceProviderConfig } from '@talex-touch/utils/types/intelligence'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'

const props = defineProps<{
  providerName: string
  modelName: string
  isTesting: boolean
  disabled: boolean
  testResult?: CapabilityTestResult | null
  enabledBindings?: Array<{ providerId: string, provider?: IntelligenceProviderConfig, models?: string[] }>
}>()

const emits = defineEmits<{
  test: [options?: { providerId?: string, model?: string }]
}>()

const { t } = useI18n()

// Provider and model selection
const selectedProviderId = ref<string>('')
const selectedModel = ref<string>('')

const availableProviders = computed(() => {
  return props.enabledBindings || []
})

const availableModels = computed(() => {
  if (!selectedProviderId.value) return []
  const binding = availableProviders.value.find(b => b.providerId === selectedProviderId.value)
  return binding?.models || []
})

const canTest = computed(() => {
  return !props.disabled && !props.isTesting && selectedProviderId.value
})

const testButtonText = computed(() => {
  if (props.isTesting) {
    return t('settings.intelligence.testing')
  }
  return t('settings.intelligence.testCapability')
})

const resultIcon = computed(() => {
  if (!props.testResult) return null
  return props.testResult.success
    ? 'i-carbon-checkmark-filled'
    : 'i-carbon-warning-filled'
})

const resultClass = computed(() => {
  if (!props.testResult) return ''
  return props.testResult.success ? 'test-result--success' : 'test-result--error'
})

function handleTest(): void {
  if (!canTest.value) return
  emits('test', {
    providerId: selectedProviderId.value,
    model: selectedModel.value || undefined,
  })
}

// Auto-select first provider
if (availableProviders.value.length > 0) {
  selectedProviderId.value = availableProviders.value[0].providerId
  if (availableModels.value.length > 0) {
    selectedModel.value = availableModels.value[0]
  }
}
</script>

<template>
  <div class="test-section">
    <div class="test-section__config">
      <div class="test-section__field">
        <label class="test-section__label">{{ t('settings.intelligence.selectProvider') }}</label>
        <select
          v-model="selectedProviderId"
          class="test-section__select"
          :disabled="disabled || isTesting"
        >
          <option
            v-for="binding in availableProviders"
            :key="binding.providerId"
            :value="binding.providerId"
          >
            {{ binding.provider?.name || binding.providerId }}
          </option>
        </select>
      </div>

      <div v-if="availableModels.length > 0" class="test-section__field">
        <label class="test-section__label">{{ t('settings.intelligence.selectModel') }}</label>
        <select
          v-model="selectedModel"
          class="test-section__select"
          :disabled="disabled || isTesting"
        >
          <option value="">{{ t('settings.intelligence.defaultModel') }}</option>
          <option
            v-for="model in availableModels"
            :key="model"
            :value="model"
          >
            {{ model }}
          </option>
        </select>
      </div>
    </div>

    <div class="test-section__actions">
      <FlatButton
        primary
        :disabled="!canTest"
        :loading="isTesting"
        @click="handleTest"
      >
        <i v-if="!isTesting" class="i-carbon-play-filled" aria-hidden="true" />
        <i v-else class="i-carbon-circle-dash animate-spin" aria-hidden="true" />
        <span>{{ testButtonText }}</span>
      </FlatButton>
    </div>

    <div v-if="testResult" class="test-result" :class="resultClass">
      <div class="test-result__header">
        <i :class="resultIcon" class="test-result__icon" />
        <span class="test-result__title">
          {{ testResult.success ? t('settings.intelligence.testSuccess') : t('settings.intelligence.testFailed') }}
        </span>
      </div>
      <p v-if="testResult.message" class="test-result__message">
        {{ testResult.message }}
      </p>
      <p v-if="testResult.latency" class="test-result__latency">
        {{ t('settings.intelligence.latency') }}: {{ testResult.latency }}ms
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.test-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.test-section__config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.test-section__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.test-section__label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.test-section__select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--el-border-color);
  border-radius: 0.5rem;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    border-color: var(--el-color-primary-light-5);
  }

  &:focus {
    outline: none;
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.test-section__actions {
  display: flex;
  gap: 0.75rem;
}

.test-result {
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid;
  animation: slideIn 0.3s ease-out;
}

.test-result--success {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-5);
}

.test-result--error {
  background: var(--el-color-error-light-9);
  border-color: var(--el-color-error-light-5);
}

.test-result__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.test-result__icon {
  font-size: 1.25rem;
}

.test-result--success .test-result__icon {
  color: var(--el-color-success);
}

.test-result--error .test-result__icon {
  color: var(--el-color-error);
}

.test-result__title {
  font-weight: 600;
  font-size: 0.9375rem;
}

.test-result__message {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.test-result__latency {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
