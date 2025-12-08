<script lang="ts" name="IntelligenceInfo" setup>
// import IntelligenceTestResults from './IntelligenceTestResults.vue'
import type { IntelligenceProviderConfig, TestResult } from '@talex-touch/utils/types/intelligence'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
/**
 * IntelligenceInfo Component
 *
 * Provider detail panel that displays comprehensive configuration options for a selected AI provider.
 * Features:
 * - Provider header with status and test button
 * - Collapsible configuration sections (API, Model, Advanced, Rate Limits)
 * - Test results display
 * - Global Intelligence settings
 * - Conditional rendering based on provider enabled state
 * - Auto-save on configuration changes
 *
 * @example
 * ```vue
 * <IntelligenceInfo
 *   :provider="selectedProvider"
 *   :global-config="globalConfig"
 *   @update="handleUpdateProvider"
 *   @test="handleTestProvider"
 *   @update-global="handleUpdateGlobal"
 * />
 * ```
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import IntelligenceAdvancedConfig from '../config/IntelligenceAdvancedConfig.vue'
import IntelligenceApiConfig from '../config/IntelligenceApiConfig.vue'
import IntelligenceModelConfig from '../config/IntelligenceModelConfig.vue'
import IntelligenceRateLimitConfig from '../config/IntelligenceRateLimitConfig.vue'
import IntelligenceHeader from './IntelligenceHeader.vue'

const props = defineProps<{
  provider: IntelligenceProviderConfig
  testResult?: TestResult | null
  isTesting?: boolean
}>()

const emits = defineEmits<{
  update: [provider: IntelligenceProviderConfig]
  test: []
  delete: []
}>()

const { t } = useI18n()

const localProvider = ref<IntelligenceProviderConfig>({ ...props.provider })
const testResult = ref<TestResult | null>(props.testResult || null)
const isTesting = ref(props.isTesting || false)

const isModelConfigDisabled = computed(() => {
  if (localProvider.value.type === 'local') {
    return false
  }
  return !localProvider.value.apiKey || localProvider.value.apiKey.trim().length === 0
})

watch(
  () => props.provider,
  (newProvider) => {
    localProvider.value = { ...newProvider }
  },
  { deep: true },
)

watch(
  () => props.testResult,
  (newResult) => {
    testResult.value = newResult || null
  },
)

watch(
  () => props.isTesting,
  (newState) => {
    isTesting.value = newState || false
  },
)

/**
 * Handle delete button click
 */
function handleDelete() {
  emits('delete')
}

/**
 * Handle configuration changes
 * Emits update event with the modified provider
 */
function handleChange() {
  const liveProvider = intelligenceSettings
    .get()
    .providers
    .find(p => p.id === localProvider.value.id)

  emits('update', liveProvider ?? localProvider.value)
}
</script>

<template>
  <TouchScroll class="IntelligenceInfo-root h-full flex flex-col">
    <template #header>
      <IntelligenceHeader :provider="localProvider" @delete="handleDelete" />
    </template>

    <div role="region" :aria-label="t('intelligence.info.configurationPanel')" tabindex="0">
      <TuffGroupBlock
        :name="t('intelligence.config.api.title')"
        :description="t('intelligence.config.api.description')"
        default-icon="i-carbon-key"
        active-icon="i-carbon-key"
        memory-name="aisdk-api-config"
      >
        <IntelligenceApiConfig v-model="localProvider" @change="handleChange" />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('intelligence.config.model.title')"
        :description="t('intelligence.config.model.description')"
        default-icon="i-carbon-model"
        active-icon="i-carbon-model"
        memory-name="aisdk-model-config"
      >
        <IntelligenceModelConfig
          v-model="localProvider"
          :disabled="isModelConfigDisabled"
          @change="handleChange"
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('intelligence.config.advanced.title')"
        :description="t('Intelligence.config.advanced.description')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings"
        memory-name="aisdk-advanced-config"
      >
        <IntelligenceAdvancedConfig v-model="localProvider" @change="handleChange" />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('intelligence.config.rateLimit.title')"
        :description="t('intelligence.config.rateLimit.description')"
        default-icon="i-carbon-time"
        active-icon="i-carbon-time"
        memory-name="aisdk-ratelimit-config"
      >
        <IntelligenceRateLimitConfig v-model="localProvider" @change="handleChange" />
      </TuffGroupBlock>
    </div>
  </TouchScroll>
</template>
