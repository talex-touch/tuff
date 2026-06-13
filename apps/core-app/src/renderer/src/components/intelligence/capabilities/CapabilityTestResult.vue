<script lang="ts" setup>
import type { CapabilityTestResult } from './types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  result: CapabilityTestResult
}>()

const { t } = useI18n()

const resultIcon = computed(() => {
  return props.result.success ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'
})

const resultClass = computed(() => {
  return props.result.success ? 'test-result--success' : 'test-result--error'
})

const hasMetrics = computed(() => {
  return Boolean(
    props.result.provider ||
    props.result.model ||
    props.result.latency ||
    props.result.usage ||
    props.result.tokensPerSecond
  )
})

const stabilityClass = computed(() => {
  return `test-result__stability--${props.result.stability?.status || 'unknown'}`
})
</script>

<template>
  <div class="test-result" :class="resultClass">
    <div class="test-result__header">
      <i :class="resultIcon" class="test-result__icon" />
      <span class="test-result__title">
        {{
          result.success
            ? t('settings.intelligence.testSuccess')
            : t('settings.intelligence.testFailed')
        }}
      </span>
    </div>

    <div v-if="result.message" class="test-result__section">
      <p class="test-result__message">
        {{ result.message }}
      </p>
    </div>

    <div v-if="hasMetrics" class="test-result__section">
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
          <span class="test-result__meta-label">耗时</span>
          <span class="test-result__meta-value">{{ result.latency }}ms</span>
        </div>
        <div v-if="result.usage" class="test-result__meta-item">
          <span class="test-result__meta-label">Prompt Tokens</span>
          <span class="test-result__meta-value">{{ result.usage.promptTokens }}</span>
        </div>
        <div v-if="result.usage" class="test-result__meta-item">
          <span class="test-result__meta-label">Completion Tokens</span>
          <span class="test-result__meta-value">{{ result.usage.completionTokens }}</span>
        </div>
        <div v-if="result.usage" class="test-result__meta-item">
          <span class="test-result__meta-label">Total Tokens</span>
          <span class="test-result__meta-value">{{ result.usage.totalTokens }}</span>
        </div>
        <div v-if="result.tokensPerSecond" class="test-result__meta-item">
          <span class="test-result__meta-label">Token 速度</span>
          <span class="test-result__meta-value">{{ result.tokensPerSecond }}/s</span>
        </div>
      </div>
    </div>

    <div v-if="result.stability" class="test-result__section">
      <div class="test-result__preview-label">稳定性分析</div>
      <div class="test-result__stability" :class="stabilityClass">
        <div class="test-result__stability-head">
          <span class="test-result__stability-status">{{ result.stability.status }}</span>
          <span
            v-if="typeof result.stability.score === 'number'"
            class="test-result__stability-score"
          >
            {{ result.stability.score }}/100
          </span>
        </div>
        <p class="test-result__stability-summary">
          {{ result.stability.summary }}
        </p>
        <div v-if="result.stability.signals?.length" class="test-result__signals">
          <span
            v-for="signal in result.stability.signals"
            :key="signal"
            class="test-result__signal"
          >
            {{ signal }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="result.reasoning" class="test-result__section">
      <div class="test-result__preview-label">Reasoning</div>
      <pre class="test-result__preview test-result__preview--reasoning">{{ result.reasoning }}</pre>
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
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  animation: slideIn 0.3s ease-out;
}

.test-result--success {
  border-color: rgba(34, 197, 94, 0.45);
  box-shadow: inset 3px 0 0 rgba(34, 197, 94, 0.85);
}

.test-result--error {
  border-color: rgba(248, 113, 113, 0.45);
  box-shadow: inset 3px 0 0 rgba(248, 113, 113, 0.85);
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
  color: var(--tx-color-success);
}

.test-result--error .test-result__icon {
  color: var(--tx-color-error);
}

.test-result__title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--tx-text-color-primary);
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
  color: var(--tx-text-color-primary);
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
  color: var(--tx-text-color-regular);
  text-transform: uppercase;
  letter-spacing: 0;
}

.test-result__meta-value {
  font-size: 0.875rem;
  color: var(--tx-text-color-primary);
  font-family: monospace;
}

.test-result__preview-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--tx-text-color-regular);
  text-transform: uppercase;
  letter-spacing: 0;
  margin-bottom: 0.5rem;
}

.test-result__stability {
  padding: 0.875rem;
  border-radius: 0.5rem;
  background: var(--tx-fill-color);
  border: 1px solid var(--tx-border-color-lighter);
}

.test-result__stability--stable {
  border-color: rgba(34, 197, 94, 0.35);
}

.test-result__stability--slow {
  border-color: rgba(245, 158, 11, 0.42);
}

.test-result__stability--unstable {
  border-color: rgba(248, 113, 113, 0.42);
}

.test-result__stability-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.test-result__stability-status {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  text-transform: capitalize;
}

.test-result__stability-score {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--tx-text-color-regular);
}

.test-result__stability-summary {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 0.875rem;
  line-height: 1.6;
}

.test-result__signals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.test-result__signal {
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.375rem;
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color-lighter);
  color: var(--tx-text-color-regular);
  font-size: 0.75rem;
  line-height: 1.2;
}

.test-result__preview {
  margin: 0;
  padding: 0.875rem;
  border-radius: 0.5rem;
  background: var(--tx-fill-color);
  border: 1px solid var(--tx-border-color-lighter);
  color: var(--tx-text-color-primary);
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
    background: var(--tx-border-color);
    border-radius: 3px;
  }
}

.test-result__preview--reasoning {
  max-height: 180px;
  color: var(--tx-text-color-regular);
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
