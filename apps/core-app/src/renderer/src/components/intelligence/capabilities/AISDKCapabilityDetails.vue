<template>
  <div class="capability-details h-full flex flex-col">
    <header class="capability-details__header flex flex-wrap items-start gap-4 border-b border-[var(--el-border-color-lighter)] bg-[var(--el-bg-color)] p-6">
      <div class="min-w-0 flex-1">
        <p class="text-xs uppercase tracking-wide text-[var(--el-text-color-secondary)]">
          {{ capability.id }}
        </p>
        <h1 class="text-2xl font-semibold text-[var(--el-text-color-primary)]">
          {{ capability.label || capability.id }}
        </h1>
        <p class="mt-2 text-sm text-[var(--el-text-color-secondary)]">
          {{ capability.description }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="badge badge-info">
            <i class="i-carbon-flow-logs" aria-hidden="true" />
            {{ t('settings.aisdk.capabilityProvidersStat', { count: activeBindingCount }) }}
          </span>
          <span class="badge">
            <i class="i-carbon-catalog" aria-hidden="true" />
            {{ t('settings.aisdk.capabilityBindingsStat', { count: capability.providers?.length || 0 }) }}
          </span>
        </div>
      </div>
      <FlatButton
        class="test-button"
        :primary="true"
        :disabled="isTesting"
        :aria-busy="isTesting"
        @click="handleTest"
      >
        <i :class="isTesting ? 'i-carbon-renew animate-spin' : 'i-carbon-flash'" aria-hidden="true" />
        <span>{{ isTesting ? t('settings.aisdk.testing') : t('settings.aisdk.capabilityTest') }}</span>
      </FlatButton>
    </header>

    <div class="flex-1 overflow-auto p-6">
      <section class="detail-section" aria-labelledby="capability-provider-section">
        <div class="section-header">
          <div>
            <h2 id="capability-provider-section">{{ t('settings.aisdk.capabilityProviderSectionTitle') }}</h2>
            <p>{{ t('settings.aisdk.capabilityProviderSectionDesc') }}</p>
          </div>
        </div>
        <div class="provider-grid">
          <label
            v-for="provider in providers"
            :key="provider.id"
            class="provider-chip"
          >
            <input
              type="checkbox"
              :checked="selectedProviderIds.has(provider.id)"
              @change="handleProviderToggle(provider.id, ($event.target as HTMLInputElement).checked)"
            />
            <div class="provider-chip__content">
              <p>{{ provider.name }}</p>
              <span>{{ provider.type }}</span>
            </div>
          </label>
        </div>
      </section>

      <section
        v-if="bindings.length"
        class="detail-section"
        aria-labelledby="capability-binding-section"
      >
        <div class="section-header">
          <div>
            <h2 id="capability-binding-section">{{ t('settings.aisdk.capabilityBindingModelsTitle') }}</h2>
            <p>{{ t('settings.aisdk.capabilityBindingModelsDesc') }}</p>
          </div>
        </div>
        <div class="space-y-3">
          <div
            v-for="binding in bindings"
            :key="`${capability.id}-${binding.providerId}`"
            class="binding-item"
          >
            <div class="binding-item__header">
              <h3>{{ binding.provider?.name || binding.providerId }}</h3>
              <span class="text-xs text-[var(--el-text-color-secondary)]">
                {{ binding.provider?.type }}
              </span>
            </div>
            <input
              type="text"
              class="aisdk-input"
              :value="(binding.models || []).join(', ')"
              :placeholder="binding.provider?.defaultModel || 'model-1, model-2'"
              @change="handleModelChange(binding.providerId, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="capability-prompt-section">
        <div class="section-header">
          <div>
            <h2 id="capability-prompt-section">{{ t('settings.aisdk.capabilityPromptSectionTitle') }}</h2>
            <p>{{ t('settings.aisdk.capabilityPromptSectionDesc') }}</p>
          </div>
        </div>
        <textarea
          v-model="promptValue"
          class="aisdk-textarea"
          rows="4"
          :placeholder="t('settings.settingAISDK.instructionsPlaceholder')"
          @change="handlePromptCommit"
        />
      </section>

      <section
        v-if="testResult"
        class="detail-section"
        aria-labelledby="capability-test-section"
      >
        <div class="section-header">
          <div>
            <h2 id="capability-test-section">{{ t('settings.aisdk.latestTestResult') }}</h2>
            <p class="flex flex-wrap gap-2 text-xs">
              <template v-if="testResult.provider">
                <span>{{ testResult.provider }}</span>
              </template>
              <template v-if="testResult.model">
                <span v-if="testResult.provider">·</span>
                <span>{{ testResult.model }}</span>
              </template>
              <template v-if="testResult.latency">
                <span v-if="testResult.provider || testResult.model">·</span>
                <span>{{ testResult.latency }}ms</span>
              </template>
            </p>
          </div>
        </div>
        <div
          class="test-result"
          :class="testResult.success ? 'test-result--success' : 'test-result--fail'"
          role="status"
        >
          <p class="font-semibold">
            {{ testResult.success ? t('settings.aisdk.testSuccess') : t('settings.aisdk.testFailed') }}
          </p>
          <p class="mt-2 text-sm">
            {{ testResult.message }}
          </p>
          <p v-if="testResult.textPreview" class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
            {{ testResult.textPreview }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" name="AISDKCapabilityDetails" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import type {
  AISDKCapabilityConfig,
  AiProviderConfig
} from '~/types/aisdk'
import type {
  CapabilityBinding,
  CapabilityTestResult
} from './types'

const props = defineProps<{
  capability: AISDKCapabilityConfig
  providers: AiProviderConfig[]
  bindings: CapabilityBinding[]
  isTesting: boolean
  testResult?: CapabilityTestResult | null
}>()

const emits = defineEmits<{
  toggleProvider: [providerId: string, enabled: boolean]
  updateModels: [providerId: string, value: string]
  updatePrompt: [prompt: string]
  test: []
}>()

const { t } = useI18n()
const promptValue = ref(props.capability.promptTemplate || '')

const selectedProviderIds = computed(() => {
  return new Set(
    (props.capability.providers || [])
      .filter((binding) => binding.enabled !== false)
      .map((binding) => binding.providerId)
  )
})

const activeBindingCount = computed(() => selectedProviderIds.value.size)

watch(
  () => props.capability.promptTemplate,
  (value) => {
    promptValue.value = value || ''
  }
)

function handleProviderToggle(providerId: string, enabled: boolean): void {
  emits('toggleProvider', providerId, enabled)
}

function handleModelChange(providerId: string, value: string): void {
  emits('updateModels', providerId, value)
}

function handlePromptCommit(): void {
  emits('updatePrompt', promptValue.value)
}

function handleTest(): void {
  if (props.isTesting) return
  emits('test')
}
</script>

<style lang="scss" scoped>
.capability-details__header {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.detail-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;

  h2 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 4px;
  }

  p {
    font-size: 0.85rem;
    color: var(--el-text-color-secondary);
  }
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.provider-chip {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  gap: 12px;
  cursor: pointer;
  align-items: center;
  background: var(--el-fill-color-lighter);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-border-color);
    background: var(--el-fill-color);
  }

  input {
    accent-color: var(--el-color-primary);
  }

  &__content {
    display: flex;
    flex-direction: column;

    p {
      font-weight: 600;
      font-size: 0.9rem;
      margin: 0;
    }

    span {
      font-size: 0.75rem;
      color: var(--el-text-color-secondary);
    }
  }
}

.binding-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
  background: var(--el-fill-color-lighter);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;

    h3 {
      font-size: 0.95rem;
      font-weight: 600;
    }
  }
}

.test-result {
  border-radius: 12px;
  padding: 16px;
  border: 1px solid transparent;

  &--success {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.1);
  }

  &--fail {
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.08);
  }
}
</style>
