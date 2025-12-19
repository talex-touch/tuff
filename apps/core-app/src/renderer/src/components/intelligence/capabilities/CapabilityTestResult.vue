<script lang="ts" setup>
import type { CapabilityTestResult } from './types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  result: CapabilityTestResult
}>()

const { t } = useI18n()

const resultIcon = computed(() => {
  return props.result.success
    ? 'i-carbon-checkmark-filled'
    : 'i-carbon-warning-filled'
})

const resultClass = computed(() => {
  return props.result.success ? 'test-result--success' : 'test-result--error'
})
</script>

<template>
  <div class="test-result" :class="resultClass">
    <div class="test-result__header">
      <i :class="resultIcon" class="test-result__icon" />
      <span class="test-result__title">
        {{ result.success ? t('settings.intelligence.testSuccess') : t('settings.intelligence.testFailed') }}
      </span>
    </div>

    <div v-if="result.message" class="test-result__section">
      <p class="test-result__message">
        {{ result.message }}
      </p>
    </div>

    <div v-if="result.provider || result.model" class="test-result__section">
      <div class="test-result__meta-grid">
        <div v-if="result.provider" class="test-result__meta-item">
          <span class="test-result__meta-label">Provider</span>
          <span class="test-result__meta-value">{{ result.provider }}</span>
        </div>
        <div v-if="result.model" class="test-result__meta-item">
          <span class="test-result__meta-label">Model</span>
          <span class="test-result__meta-value">{{ result.model }}</span>
        </div>
        <div v-if="result.latency" class="test-result__meta-item">
          <span class="test-result__meta-label">{{ t('settings.intelligence.latency') }}</span>
          <span class="test-result__meta-value">{{ result.latency }}ms</span>
        </div>
      </div>
    </div>

    <div v-if="result.textPreview" class="test-result__section">
      <div class="test-result__preview-label">Response</div>
      <pre class="test-result__preview">{{ result.textPreview }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.test-result {
  padding: 1.25rem;
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
  margin-bottom: 1rem;
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

.test-result__section {
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
}

.test-result__message {
  margin: 0;
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.test-result__meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.test-result__meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.test-result__meta-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.test-result__meta-value {
  font-size: 0.875rem;
  color: var(--el-text-color-primary);
  font-family: monospace;
}

.test-result__preview-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
}

.test-result__preview {
  margin: 0;
  padding: 0.875rem;
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.08);
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 3px;
  }
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
</style>
