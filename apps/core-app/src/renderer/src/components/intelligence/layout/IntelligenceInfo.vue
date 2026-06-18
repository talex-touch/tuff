<script lang="ts" name="IntelligenceInfo" setup>
// import IntelligenceTestResults from './IntelligenceTestResults.vue'
import type { IntelligenceProviderConfig, TestResult } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
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
import { TxScroll } from '@talex-touch/tuffex/scroll'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAuth } from '~/modules/auth/useAuth'
import { isNexusManagedProvider as checkNexusManagedProvider } from '~/modules/intelligence/nexus-provider'
import IntelligenceAdvancedConfig from '../config/IntelligenceAdvancedConfig.vue'
import IntelligenceApiConfig from '../config/IntelligenceApiConfig.vue'
import IntelligenceModelConfig from '../config/IntelligenceModelConfig.vue'
import IntelligenceRateLimitConfig from '../config/IntelligenceRateLimitConfig.vue'
import IntelligenceHeader from './IntelligenceProviderHeader.vue'

const props = defineProps<{
  provider: IntelligenceProviderConfig
  testResult?: TestResult | null
  isTesting?: boolean
  isSyncingFromNexus?: boolean
  syncMessage?: string
  syncError?: string
}>()

const emits = defineEmits<{
  update: [provider: IntelligenceProviderConfig]
  test: []
  delete: []
  duplicate: []
  editBasic: []
  syncNexus: []
}>()

const { t } = useI18n()
const { isLoggedIn, loginWithBrowser, authLoadingState } = useAuth()

const localProvider = ref<IntelligenceProviderConfig>({ ...props.provider })
const testResult = ref<TestResult | null>(props.testResult || null)
const isTesting = ref(props.isTesting || false)

const isModelConfigDisabled = computed(() => {
  if (localProvider.value.type === 'local') {
    return false
  }
  return !localProvider.value.apiKey || localProvider.value.apiKey.trim().length === 0
})

const isNexusManagedProvider = computed(() => {
  return checkNexusManagedProvider(localProvider.value)
})

const nexusStatusTitle = computed(() =>
  isLoggedIn.value
    ? t('settings.intelligence.nexusInvokeReadyTitle')
    : t('settings.intelligence.nexusInvokeLoginTitle')
)

const nexusStatusDescription = computed(() =>
  isLoggedIn.value
    ? t('settings.intelligence.nexusInvokeReadyDesc')
    : t('settings.intelligence.nexusInvokeLoginDesc')
)

const nexusCallStateText = computed(() =>
  isLoggedIn.value
    ? t('settings.intelligence.nexusInvokeAutoCall')
    : t('settings.intelligence.nexusInvokeFallback')
)

watch(
  () => props.provider,
  (newProvider) => {
    localProvider.value = { ...newProvider }
  },
  { deep: true }
)

watch(
  () => props.testResult,
  (newResult) => {
    testResult.value = newResult || null
  }
)

watch(
  () => props.isTesting,
  (newState) => {
    isTesting.value = newState || false
  }
)

/**
 * Handle delete button click
 */
function handleDelete() {
  emits('delete')
}

function handleDuplicate() {
  emits('duplicate')
}

function handleEditBasic() {
  emits('editBasic')
}

/**
 * Handle configuration changes
 * Emits update event with the modified provider
 */
function handleChange() {
  const liveProvider = intelligenceSettings
    .get()
    .providers.find((p) => p.id === localProvider.value.id)

  emits('update', liveProvider ?? localProvider.value)
}

async function handleLogin() {
  await loginWithBrowser()
}

function handleSyncFromNexus() {
  emits('syncNexus')
}
</script>

<template>
  <TxScroll class="IntelligenceInfo-root h-full flex flex-col">
    <template #header>
      <IntelligenceHeader
        :provider="localProvider"
        @delete="handleDelete"
        @duplicate="handleDuplicate"
        @edit-basic="handleEditBasic"
      />
    </template>

    <div role="region" :aria-label="t('intelligence.info.configurationPanel')" tabindex="0">
      <TuffGroupBlock
        v-if="isNexusManagedProvider"
        :name="nexusStatusTitle"
        :description="nexusStatusDescription"
        default-icon="i-carbon-cloud-service-management"
        active-icon="i-carbon-cloud-service-management"
        memory-name="aisdk-nexus-status"
      >
        <TuffBlockSlot
          :title="nexusCallStateText"
          :description="isLoggedIn ? nexusStatusDescription : ''"
          :default-icon="isLoggedIn ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'"
          :active-icon="isLoggedIn ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'"
          :active="isLoggedIn"
          :icon-size="18"
          class="nexus-status-slot"
        >
          <TxButton
            v-if="!isLoggedIn"
            class="nexus-status__action"
            variant="flat"
            size="sm"
            native-type="button"
            :disabled="authLoadingState.isLoggingIn"
            :loading="authLoadingState.isLoggingIn"
            @click.stop="handleLogin"
          >
            <i
              :class="
                authLoadingState.isLoggingIn ? 'i-carbon-renew animate-spin' : 'i-carbon-login'
              "
            />
            <span>{{ t('settings.intelligence.nexusInvokeLoginAction') }}</span>
          </TxButton>
          <TxButton
            v-else
            class="nexus-status__action"
            variant="flat"
            size="sm"
            native-type="button"
            :disabled="isSyncingFromNexus"
            :loading="isSyncingFromNexus"
            @click.stop="handleSyncFromNexus"
          >
            <i v-if="!isSyncingFromNexus" class="i-carbon-cloud-download" aria-hidden="true" />
            <span>
              {{
                isSyncingFromNexus
                  ? t('settings.intelligence.syncingFromNexus')
                  : t('settings.intelligence.syncFromNexus')
              }}
            </span>
          </TxButton>
        </TuffBlockSlot>
        <div v-if="syncMessage || syncError" class="nexus-status__sync-result">
          <p v-if="syncMessage" class="is-success">
            {{ syncMessage }}
          </p>
          <p v-if="syncError" class="is-error">
            {{ syncError }}
          </p>
        </div>
      </TuffGroupBlock>

      <template v-if="!isNexusManagedProvider">
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
      </template>

      <TuffGroupBlock
        :name="t('intelligence.config.advanced.title')"
        :description="t('Intelligence.config.advanced.description')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings"
        memory-name="aisdk-advanced-config"
      >
        <IntelligenceAdvancedConfig
          v-model="localProvider"
          :priority-only="isNexusManagedProvider"
          @change="handleChange"
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="!isNexusManagedProvider"
        :name="t('intelligence.config.rateLimit.title')"
        :description="t('intelligence.config.rateLimit.description')"
        default-icon="i-carbon-time"
        active-icon="i-carbon-time"
        memory-name="aisdk-ratelimit-config"
      >
        <IntelligenceRateLimitConfig v-model="localProvider" @change="handleChange" />
      </TuffGroupBlock>
    </div>
  </TxScroll>
</template>

<style lang="scss" scoped>
.nexus-status-slot {
  :deep(.TBlockSlot-Container) {
    height: 48px;
  }

  :deep(.TBlockSlot-Content > .tuff-icon) {
    color: v-bind("isLoggedIn ? 'var(--tx-color-success)' : 'var(--tx-color-warning)'");
  }
}

.nexus-status__action {
  flex-shrink: 0;
  min-width: 112px;
}

.nexus-status__sync-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 16px 12px 56px;

  p {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .is-success {
    color: var(--tx-color-success);
  }

  .is-error {
    color: var(--tx-color-danger);
  }
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
