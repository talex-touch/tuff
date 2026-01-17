<script lang="ts" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/utils/types/intelligence'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import IntelligencePromptSelector from '~/components/intelligence/config/IntelligencePromptSelector.vue'

const props = defineProps<{
  capabilityId: string
  isTesting: boolean
  disabled: boolean
  enabledBindings?: Array<{
    providerId: string
    provider?: IntelligenceProviderConfig
    models?: string[]
  }>
  promptTemplate?: string
  showPromptSelector?: boolean
}>()

const emits = defineEmits<{
  test: [
    options: {
      providerId: string
      model?: string
      promptTemplate?: string
      promptVariables?: Record<string, any>
      userInput?: string
    }
  ]
}>()

const { t } = useI18n()

const selectedProviderId = ref<string>('')
const selectedModel = ref<string>('')
const promptTemplate = ref<string>('')
const promptVariablesText = ref<string>('')
const userInput = ref<string>('')

const resolvedShowPromptSelector = computed(() => props.showPromptSelector !== false)

const availableProviders = computed(() => props.enabledBindings || [])

const availableModels = computed(() => {
  if (!selectedProviderId.value) return []
  const binding = availableProviders.value.find((b) => b.providerId === selectedProviderId.value)
  return binding?.models || []
})

const canTest = computed(() => {
  return !props.disabled && !props.isTesting && selectedProviderId.value
})

const testButtonText = computed(() => {
  return props.isTesting
    ? t('settings.intelligence.testing')
    : t('settings.intelligence.testCapability')
})

function handleTest(): void {
  if (!canTest.value) return

  let promptVariables: Record<string, any> | undefined
  const raw = promptVariablesText.value.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) promptVariables = parsed
    } catch {
      promptVariables = undefined
    }
  }

  emits('test', {
    providerId: selectedProviderId.value,
    model: selectedModel.value || undefined,
    promptTemplate: resolvedShowPromptSelector.value
      ? promptTemplate.value || undefined
      : props.promptTemplate || undefined,
    promptVariables,
    userInput: userInput.value.trim() || undefined
  })
}

if (availableProviders.value.length > 0) {
  selectedProviderId.value = availableProviders.value[0].providerId
  if (availableModels.value.length > 0) {
    selectedModel.value = availableModels.value[0]
  }
}
</script>

<template>
  <div class="capability-test-input">
    <div class="input-section">
      <div v-if="resolvedShowPromptSelector" class="input-field">
        <label class="input-label">{{
          t('settings.intelligence.capabilityPromptSectionTitle')
        }}</label>
        <IntelligencePromptSelector v-model="promptTemplate" />
      </div>

      <div class="input-field">
        <label class="input-label">{{ t('settings.intelligence.userMessageLabel') }}</label>
        <textarea
          v-model="userInput"
          class="input-textarea"
          :disabled="disabled || isTesting"
          :placeholder="t('settings.intelligence.userMessagePlaceholder')"
          rows="3"
        />
      </div>

      <div class="input-field">
        <label class="input-label">{{ t('settings.intelligence.promptVariablesLabel') }}</label>
        <textarea
          v-model="promptVariablesText"
          class="input-textarea"
          :disabled="disabled || isTesting"
          :placeholder="t('settings.intelligence.promptVariablesPlaceholder')"
          rows="2"
        />
      </div>
    </div>

    <div class="config-section">
      <div class="input-field">
        <label class="input-label">{{ t('settings.intelligence.selectProvider') }}</label>
        <select v-model="selectedProviderId" class="input-select" :disabled="disabled || isTesting">
          <option
            v-for="binding in availableProviders"
            :key="binding.providerId"
            :value="binding.providerId"
          >
            {{ binding.provider?.name || binding.providerId }}
          </option>
        </select>
      </div>

      <div v-if="availableModels.length > 0" class="input-field">
        <label class="input-label">{{ t('settings.intelligence.selectModel') }}</label>
        <select v-model="selectedModel" class="input-select" :disabled="disabled || isTesting">
          <option value="">
            {{ t('settings.intelligence.defaultModel') }}
          </option>
          <option v-for="model in availableModels" :key="model" :value="model">
            {{ model }}
          </option>
        </select>
      </div>
    </div>

    <div class="action-section">
      <FlatButton primary block :disabled="!canTest" :loading="isTesting" @click="handleTest">
        <i v-if="!isTesting" class="i-carbon-play-filled" aria-hidden="true" />
        <i v-else class="i-carbon-circle-dash animate-spin" aria-hidden="true" />
        <span>{{ testButtonText }}</span>
      </FlatButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.capability-test-input {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.config-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.input-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.input-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.input-select,
.input-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--el-border-color);
  border-radius: 0.5rem;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  transition: all 0.2s;
  font-family: var(--el-font-family);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

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

.input-textarea {
  resize: vertical;
  min-height: 60px;
  white-space: pre-wrap;
}

.action-section {
  display: flex;
  gap: 0.75rem;
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
