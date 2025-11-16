<template>
  <div class="aisdk-info-root h-full flex flex-col">
    <!-- Header -->
    <IntelligenceHeader 
      :provider="localProvider"
      :is-testing="isTesting"
      @toggle="handleToggle"
      @test="handleTest"
    />

    <!-- Scrollable Content -->
    <div 
      class="flex-1 overflow-auto p-6"
      role="region"
      :aria-label="t('aisdk.info.configurationPanel')"
      tabindex="0"
    >
      <!-- Test Results -->
      <IntelligenceTestResults 
        v-if="testResult"
        :result="testResult"
        @dismiss="handleDismissTestResult"
      />

      <!-- Configuration Sections (always visible, disabled when provider is disabled) -->
      <TuffGroupBlock
        :name="t('aisdk.config.api.title')"
        :description="t('aisdk.config.api.description')"
        default-icon="i-carbon-key"
        active-icon="i-carbon-key"
        memory-name="aisdk-api-config"
      >
        <IntelligenceApiConfig 
          v-model="localProvider" 
          :disabled="!localProvider.enabled"
          @change="handleChange" 
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('aisdk.config.model.title')"
        :description="t('aisdk.config.model.description')"
        default-icon="i-carbon-model"
        active-icon="i-carbon-model"
        memory-name="aisdk-model-config"
      >
        <IntelligenceModelConfig 
          v-model="localProvider" 
          :disabled="!localProvider.enabled"
          @change="handleChange" 
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('aisdk.config.advanced.title')"
        :description="t('aisdk.config.advanced.description')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings"
        memory-name="aisdk-advanced-config"
      >
        <IntelligenceAdvancedConfig 
          v-model="localProvider" 
          :disabled="!localProvider.enabled"
          @change="handleChange" 
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('aisdk.config.rateLimit.title')"
        :description="t('aisdk.config.rateLimit.description')"
        default-icon="i-carbon-time"
        active-icon="i-carbon-time"
        memory-name="aisdk-ratelimit-config"
      >
        <IntelligenceRateLimitConfig 
          v-model="localProvider" 
          :disabled="!localProvider.enabled"
          @change="handleChange" 
        />
      </TuffGroupBlock>

      <!-- Global Settings -->
      <TuffGroupBlock
        :name="t('aisdk.global.title')"
        :description="t('aisdk.global.description')"
        default-icon="i-carbon-settings-adjust"
        active-icon="i-carbon-settings-adjust"
        memory-name="aisdk-global-settings"
      >
        <IntelligenceGlobalSettings 
          v-model="localGlobalConfig"
          @change="handleGlobalChange"
        />
      </TuffGroupBlock>
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceInfo" setup>
/**
 * AISDKInfo Component
 * 
 * Provider detail panel that displays comprehensive configuration options for a selected AI provider.
 * Features:
 * - Provider header with status and test button
 * - Collapsible configuration sections (API, Model, Advanced, Rate Limits)
 * - Test results display
 * - Global AISDK settings
 * - Conditional rendering based on provider enabled state
 * - Auto-save on configuration changes
 * 
 * @example
 * ```vue
 * <AISDKInfo
 *   :provider="selectedProvider"
 *   :global-config="globalConfig"
 *   @update="handleUpdateProvider"
 *   @test="handleTestProvider"
 *   @update-global="handleUpdateGlobal"
 * />
 * ```
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import IntelligenceHeader from './IntelligenceHeader.vue'
import IntelligenceApiConfig from '../config/IntelligenceApiConfig.vue'
import IntelligenceModelConfig from '../config/IntelligenceModelConfig.vue'
import IntelligenceAdvancedConfig from '../config/IntelligenceAdvancedConfig.vue'
import IntelligenceRateLimitConfig from '../config/IntelligenceRateLimitConfig.vue'
import IntelligenceTestResults from './IntelligenceTestResults.vue'
import IntelligenceGlobalSettings from '../config/IntelligenceGlobalSettings.vue'
import type { AiProviderConfig, AISDKGlobalConfig, TestResult } from '~/types/aisdk'

const props = defineProps<{
  provider: AiProviderConfig
  globalConfig: AISDKGlobalConfig
  testResult?: TestResult | null
  isTesting?: boolean
}>()

const emits = defineEmits<{
  update: [provider: AiProviderConfig]
  test: []
  updateGlobal: [config: AISDKGlobalConfig]
}>()

const { t } = useI18n()

// Local state for provider and global config
const localProvider = ref<AiProviderConfig>({ ...props.provider })
const localGlobalConfig = ref<AISDKGlobalConfig>({ ...props.globalConfig })
const testResult = ref<TestResult | null>(props.testResult || null)
const isTesting = ref(props.isTesting || false)

// Watch for external provider changes
watch(
  () => props.provider,
  (newProvider) => {
    localProvider.value = { ...newProvider }
  },
  { deep: true }
)

// Watch for external global config changes
watch(
  () => props.globalConfig,
  (newConfig) => {
    localGlobalConfig.value = { ...newConfig }
  },
  { deep: true }
)

// Watch for test result changes
watch(
  () => props.testResult,
  (newResult) => {
    testResult.value = newResult || null
  }
)

// Watch for testing state changes
watch(
  () => props.isTesting,
  (newState) => {
    isTesting.value = newState || false
  }
)

/**
 * Handle provider toggle (enable/disable)
 */
function handleToggle() {
  localProvider.value = {
    ...localProvider.value,
    enabled: !localProvider.value.enabled
  }
  emits('update', localProvider.value)
}

/**
 * Handle test button click
 */
function handleTest() {
  emits('test')
}

/**
 * Handle configuration changes
 * Emits update event with the modified provider
 */
function handleChange() {
  emits('update', localProvider.value)
}

/**
 * Handle global configuration changes
 */
function handleGlobalChange() {
  emits('updateGlobal', localGlobalConfig.value)
}

/**
 * Handle test result dismissal
 */
function handleDismissTestResult() {
  testResult.value = null
}
</script>

<style lang="scss" scoped>
.aisdk-info-root {
  background: var(--el-bg-color-page);
}

// Custom scrollbar styling
.aisdk-info-root > div:nth-child(2) {
  scroll-behavior: smooth;
  
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-border-color);
    border-radius: 4px;
  }
}
</style>
