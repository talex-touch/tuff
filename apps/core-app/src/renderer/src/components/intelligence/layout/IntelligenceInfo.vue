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
import { isLocalCliProvider } from '~/modules/intelligence/provider-channel-type'
import IntelligenceAdvancedConfig from '../config/IntelligenceAdvancedConfig.vue'
import IntelligenceApiConfig from '../config/IntelligenceApiConfig.vue'
import IntelligenceModelConfig from '../config/IntelligenceModelConfig.vue'
import IntelligenceRateLimitConfig from '../config/IntelligenceRateLimitConfig.vue'
import IntelligenceHeader from './IntelligenceProviderHeader.vue'

const props = defineProps<{
  provider: IntelligenceProviderConfig
  testResult?: TestResult | null
  isTesting?: boolean
}>()

const emits = defineEmits<{
  update: [provider: IntelligenceProviderConfig]
  test: []
  delete: []
  duplicate: []
  editBasic: []
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
  return !isNexusManagedProvider.value && !localProvider.value.hasCredential
})

const isNexusManagedProvider = computed(() => {
  return checkNexusManagedProvider(localProvider.value)
})

const isCliProvider = computed(() => {
  return isLocalCliProvider(localProvider.value)
})
const nexusStatusTitle = computed(() =>
  isLoggedIn.value
    ? t('settings.intelligence.nexusInvokeReadyTitle')
    : t('settings.intelligence.nexusInvokeLoginTitle')
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
function handleStoredChange() {
  const liveProvider = intelligenceSettings
    .get()
    .providers.find((p) => p.id === localProvider.value.id)

  emits('update', liveProvider ?? localProvider.value)
}

function handleLocalChange(provider: IntelligenceProviderConfig) {
  emits('update', provider)
}

async function handleLogin() {
  await loginWithBrowser()
}

function handleToggleCliEnabled() {
  const next = !localProvider.value.enabled
  localProvider.value.enabled = next
  intelligenceSettings.updateProvider(localProvider.value.id, { enabled: next })
  emits('update', localProvider.value)
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
        default-icon="i-carbon-cloud-service-management"
        active-icon="i-carbon-cloud-service-management"
        memory-name="aisdk-nexus-status"
      >
        <TuffBlockSlot
          :title="nexusCallStateText"
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
            <i v-if="!authLoadingState.isLoggingIn" class="i-carbon-login" aria-hidden="true" />
            <span>{{ t('settings.intelligence.nexusInvokeLoginAction') }}</span>
          </TxButton>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="isCliProvider"
        :name="t('settings.intelligence.cliStatusTitle')"
        :description="t('settings.intelligence.cliStatusDesc')"
        default-icon="i-carbon-terminal"
        active-icon="i-carbon-terminal"
        memory-name="aisdk-cli-status"
      >
        <TuffBlockSlot
          :title="
            localProvider.enabled
              ? t('settings.intelligence.cliEnabledTitle')
              : t('settings.intelligence.cliDisabledTitle')
          "
          :description="
            localProvider.enabled
              ? t('settings.intelligence.cliEnabledDesc')
              : t('settings.intelligence.cliDisabledDesc')
          "
          :default-icon="
            localProvider.enabled ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'
          "
          :active-icon="
            localProvider.enabled ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'
          "
          :active="localProvider.enabled"
          :icon-size="18"
        >
          <TxButton
            variant="flat"
            size="sm"
            :type="localProvider.enabled ? 'danger' : 'primary'"
            native-type="button"
            @click="handleToggleCliEnabled"
          >
            <span>{{
              localProvider.enabled
                ? t('intelligence.status.disabled')
                : t('settings.intelligence.enableCliAction')
            }}</span>
          </TxButton>
        </TuffBlockSlot>
        <TuffBlockSlot
          :title="t('settings.intelligence.cliModelInfoTitle')"
          :description="t('settings.intelligence.cliModelInfoDesc')"
          default-icon="i-carbon-model"
          active-icon="i-carbon-model"
        />
      </TuffGroupBlock>

      <template v-if="!isNexusManagedProvider && !isCliProvider">
        <TuffGroupBlock
          :name="t('intelligence.config.api.title')"
          :description="t('intelligence.config.api.description')"
          default-icon="i-carbon-key"
          active-icon="i-carbon-key"
          memory-name="aisdk-api-config"
        >
          <IntelligenceApiConfig v-model="localProvider" @change="handleStoredChange" />
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
            @change="handleStoredChange"
          />
        </TuffGroupBlock>
      </template>

      <TuffGroupBlock
        :name="t('intelligence.config.advanced.title')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings"
        memory-name="aisdk-advanced-config"
      >
        <IntelligenceAdvancedConfig
          v-model="localProvider"
          :priority-only="isNexusManagedProvider"
          @update:model-value="handleLocalChange"
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
        <IntelligenceRateLimitConfig
          v-model="localProvider"
          @update:model-value="handleLocalChange"
        />
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

  /* A failed sync keeps the danger colour the removed side row used to carry. */
  &.is-error :deep(.TBlockSlot-Label > p) {
    color: var(--tx-color-danger);
  }

  &:not(.is-error) :deep(.TBlockSlot-Label > p) {
    color: var(--tx-color-success);
  }
}

.nexus-status__action {
  flex-shrink: 0;
  min-width: 112px;
}
</style>
