<template>
  <div class="test-section">
    <div class="test-section__info">
      <div class="test-section__item">
        <span class="test-section__label">{{ t('settings.intelligence.testProvider') }}</span>
        <span class="test-section__value">{{ providerName }}</span>
      </div>
      <div class="test-section__item">
        <span class="test-section__label">{{ t('settings.intelligence.testModel') }}</span>
        <span class="test-section__value">{{ modelName }}</span>
      </div>
    </div>

    <div class="test-section__actions">
      <FlatButton
        primary
        block
        :disabled="isTesting || disabled"
        :aria-busy="isTesting"
        @click="$emit('test')"
      >
        <i
          :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'"
          aria-hidden="true"
        />
        <span>{{
          isTesting ? t('settings.intelligence.testing') : t('settings.intelligence.runTest')
        }}</span>
      </FlatButton>
    </div>

    <div
      v-if="testResult"
      class="test-result"
      :class="testResult.success ? 'test-result--success' : 'test-result--fail'"
    >
      <div class="test-result__header">
        <i
          :class="
            testResult.success ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'
          "
        />
        <p class="test-result__title">
          {{
            testResult.success
              ? t('settings.intelligence.testSuccess')
              : t('settings.intelligence.testFailed')
          }}
        </p>
      </div>
      <p class="test-result__message">{{ testResult.message }}</p>
      <div v-if="testSummary" class="test-result__meta">{{ testSummary }}</div>
      <p v-if="testResult.textPreview" class="test-result__preview">
        {{ testResult.textPreview }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import type { CapabilityTestResult } from './types'

const props = defineProps<{
  providerName: string
  modelName: string
  isTesting: boolean
  disabled?: boolean
  testResult?: CapabilityTestResult | null
}>()

defineEmits<{
  test: []
}>()

const { t } = useI18n()

const testSummary = computed(() => {
  if (!props.testResult) return ''
  const pieces: string[] = []
  if (props.testResult.provider) pieces.push(props.testResult.provider)
  if (props.testResult.model) pieces.push(props.testResult.model)
  if (props.testResult.latency) pieces.push(`${props.testResult.latency}ms`)
  return pieces.join(' · ')
})
</script>

<style lang="scss" scoped>
.test-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.test-section__info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-blank);
  border-radius: 0.75rem;
  border: 1px solid var(--el-border-color-lighter);
}

.test-section__item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.test-section__label {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.test-section__value {
  font-size: 0.9rem;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.test-section__actions {
  display: flex;
  gap: 0.75rem;
}

.test-result {
  border-radius: 0.875rem;
  padding: 1.25rem;
  border: 1px solid transparent;

  &--success {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.08);
  }

  &--fail {
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.06);
  }
}

.test-result__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;

  i {
    font-size: 1.25rem;
  }
}

.test-result__title {
  font-weight: 600;
  font-size: 1rem;
  margin: 0;
}

.test-result__message {
  margin: 0.5rem 0;
  font-size: 0.9rem;
  color: var(--el-text-color-regular);
}

.test-result__meta {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  margin-top: 0.5rem;
}

.test-result__preview {
  margin: 0.75rem 0 0 0;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  font-family: monospace;
  padding: 0.5rem;
  background: var(--el-fill-color-light);
  border-radius: 0.5rem;
}
</style>
