<script lang="ts" name="IntelligenceApiConfig" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import {
  BAILIAN_PUBLIC_BASE_URL,
  getVoiceAsrMetadata,
  normalizeVoiceAsrMetadata,
  resolveBailianVoiceEndpoints
} from '@talex-touch/utils/intelligence/voice-asr'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { intelligenceSettings } from '@talex-touch/utils/renderer/storage'
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { isNexusManagedProvider } from '~/modules/intelligence/nexus-provider'
import {
  getProviderChannelType,
  ProviderChannelType
} from '~/modules/intelligence/provider-channel-type'
import { snapshotIntelligenceProviderConfig } from '~/modules/intelligence/provider-config-snapshot'

const props = defineProps<{
  modelValue: IntelligenceProviderConfig
}>()

const emits = defineEmits<{
  'update:modelValue': [value: IntelligenceProviderConfig]
  change: []
  testSuccess: [models: string[]]
}>()

const { t } = useI18n()
const aiClient = useIntelligenceSdk()

const credentialInput = ref('')
const credentialDirty = ref(false)
const isCredentialRevealed = ref(false)
const isRevealingCredential = ref(false)
const revealRequestGeneration = ref(0)
const isSavingCredential = ref(false)
const baseUrlInput = ref(props.modelValue.baseUrl || '')
const baseUrlDirty = ref(false)
const isSavingBaseUrl = ref(false)
const voiceAsrIdentifierInput = ref('')
const voiceAsrDirty = ref(false)
const isSavingVoiceAsr = ref(false)
const voiceAsrError = ref('')
const providerChannelType = computed(() => getProviderChannelType(props.modelValue))
const isVoiceAsrChannel = computed(
  () =>
    providerChannelType.value === ProviderChannelType.BAILIAN ||
    providerChannelType.value === ProviderChannelType.VOLCENGINE
)
const isDoubaoAsrChannel = computed(
  () => providerChannelType.value === ProviderChannelType.VOLCENGINE
)
const voiceAsrProtocol = computed(() => {
  if (providerChannelType.value !== ProviderChannelType.BAILIAN) return 'doubao'
  return getVoiceAsrMetadata(props.modelValue.metadata)?.protocol === 'dashscope-qwen-asr-realtime'
    ? 'dashscope-qwen-asr-realtime'
    : 'bailian-paraformer'
})
const voiceAsrIdentifierTitle = computed(() =>
  t('intelligence.config.api.voiceAsrDoubaoResourceId')
)
const voiceAsrIdentifierPlaceholder = computed(() =>
  t('intelligence.config.api.voiceAsrDoubaoResourceIdPlaceholder')
)

const localApiKey = computed({
  get: () => credentialInput.value,
  set: (value: string) => {
    credentialInput.value = value
    credentialDirty.value = true
    apiKeyError.value = ''
  }
})

const localBaseUrl = computed({
  get: () => baseUrlInput.value,
  set: (value: string) => {
    baseUrlInput.value = value
    baseUrlDirty.value = true
    baseUrlError.value = ''
  }
})

watch(
  () => props.modelValue.id,
  () => {
    clearRevealedCredential()
    credentialInput.value = ''
    credentialDirty.value = false
    apiKeyError.value = ''
    baseUrlInput.value = props.modelValue.baseUrl || ''
    baseUrlDirty.value = false
    syncVoiceAsrInput()
  }
)

watch(
  () => props.modelValue.baseUrl,
  (value) => {
    if (!baseUrlDirty.value) baseUrlInput.value = value || ''
  }
)

watch(
  () => props.modelValue.metadata,
  () => {
    if (!voiceAsrDirty.value) syncVoiceAsrInput()
  },
  { deep: true }
)

const apiKeyError = ref('')
const baseUrlError = ref('')
const testError = ref('')
const testResult = ref('')
const isTesting = ref(false)
const connectionDialogVisible = ref(false)
const connectionDialogTitle = ref('')
const connectionDialogMessage = ref('')

const requiresApiKey = computed(() => {
  if (props.modelValue.type === 'local') return false
  return !isNexusManagedProvider(props.modelValue)
})

const baseUrlPlaceholder = computed(() =>
  providerChannelType.value === ProviderChannelType.BAILIAN
    ? BAILIAN_PUBLIC_BASE_URL
    : t('intelligence.config.api.baseUrlPlaceholder')
)

const apiKeyPlaceholder = computed(() =>
  props.modelValue.hasCredential
    ? t('intelligence.config.api.apiKeyReplacePlaceholder')
    : t('intelligence.config.api.apiKeyPlaceholder')
)

const canTest = computed(() => {
  if (!isBaseUrlValid(localBaseUrl.value)) return false
  if (!requiresApiKey.value) return true
  return localApiKey.value.trim().length > 0 || Boolean(props.modelValue.hasCredential)
})

function resolveTestFailureMessage(result?: { code?: string; message?: string }): string {
  if (result?.code === 'NETWORK_COOLDOWN_ACTIVE') {
    const retryAfterSeconds = Number(result.message?.match(/^NETWORK_COOLDOWN_ACTIVE:(\d+)$/)?.[1])
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return t('intelligence.config.api.networkRecoveringWithRetry', { seconds: retryAfterSeconds })
    }
    return t('intelligence.config.api.networkRecovering')
  }
  return result?.message || t('intelligence.config.api.connectionFailed')
}

function validateApiKey(value: string): boolean {
  apiKeyError.value = ''
  if (
    requiresApiKey.value &&
    !value.trim() &&
    !(!credentialDirty.value && props.modelValue.hasCredential)
  ) {
    apiKeyError.value = t('intelligence.config.api.apiKeyRequired')
    return false
  }
  return true
}

function isBaseUrlValid(value: string): boolean {
  if (!value.trim()) return true
  try {
    void new URL(value)
    return true
  } catch {
    return false
  }
}

function validateBaseUrl(value: string): boolean {
  baseUrlError.value = ''
  if (!isBaseUrlValid(value)) {
    baseUrlError.value = t('intelligence.config.api.baseUrlInvalid')
    return false
  }
  return true
}

function syncVoiceAsrInput(): void {
  const metadata = getVoiceAsrMetadata(props.modelValue.metadata)
  voiceAsrIdentifierInput.value =
    metadata?.protocol === 'doubao' && isDoubaoAsrChannel.value ? (metadata.resourceId ?? '') : ''
  voiceAsrDirty.value = false
  voiceAsrError.value = ''
}

function normalizeCurrentVoiceAsrMetadata() {
  return normalizeVoiceAsrMetadata(
    voiceAsrProtocol.value === 'bailian-paraformer'
      ? { protocol: 'bailian-paraformer' }
      : voiceAsrProtocol.value === 'dashscope-qwen-asr-realtime'
        ? { protocol: 'dashscope-qwen-asr-realtime' }
        : { protocol: 'doubao', resourceId: voiceAsrIdentifierInput.value }
  )
}

function snapshotProviderForSave(provider: IntelligenceProviderConfig): IntelligenceProviderConfig {
  const snapshot = snapshotIntelligenceProviderConfig(provider)
  if (getProviderChannelType(provider) === ProviderChannelType.BAILIAN) {
    snapshot.baseUrl = resolveBailianVoiceEndpoints(provider.baseUrl).baseUrl
    const protocol = getVoiceAsrMetadata(provider.metadata)?.protocol
    snapshot.metadata = {
      ...(snapshot.metadata || {}),
      voiceAsr: {
        protocol: protocol === 'dashscope-qwen-asr-realtime' ? protocol : 'bailian-paraformer'
      }
    }
  }
  return snapshot
}

function clearRevealedCredential(): void {
  revealRequestGeneration.value += 1
  isCredentialRevealed.value = false
  isRevealingCredential.value = false
  if (!credentialDirty.value) credentialInput.value = ''
}

async function toggleCredentialVisibility(): Promise<void> {
  if (isCredentialRevealed.value) {
    clearRevealedCredential()
    return
  }
  if (credentialDirty.value) {
    isCredentialRevealed.value = true
    return
  }
  if (!props.modelValue.hasCredential || isRevealingCredential.value) return
  const providerId = props.modelValue.id
  const generation = revealRequestGeneration.value + 1
  revealRequestGeneration.value = generation
  isRevealingCredential.value = true
  apiKeyError.value = ''
  try {
    const value = await aiClient.revealProviderCredential(providerId)
    if (props.modelValue.id !== providerId || revealRequestGeneration.value !== generation) return
    credentialInput.value = value
    isCredentialRevealed.value = true
  } catch {
    if (props.modelValue.id === providerId && revealRequestGeneration.value === generation) {
      apiKeyError.value = t('intelligence.config.api.apiKeyRevealFailed')
    }
  } finally {
    if (revealRequestGeneration.value === generation) isRevealingCredential.value = false
  }
}

async function handleApiKeyBlur() {
  if (isSavingCredential.value) return
  if (!credentialDirty.value) {
    validateApiKey(localApiKey.value)
    clearRevealedCredential()
    return
  }
  const { apiKey: _apiKey, ...provider } = snapshotProviderForSave(props.modelValue)
  const credential = credentialInput.value
  const hasCredentialInput = credential.trim().length > 0
  isSavingCredential.value = true
  try {
    const saved = await aiClient.saveProviderConfig({
      provider,
      credential: hasCredentialInput ? { action: 'set', value: credential } : { action: 'clear' }
    })
    intelligenceSettings.updateProvider(provider.id, saved)
    if (props.modelValue.id !== provider.id) return
    credentialInput.value = ''
    credentialDirty.value = false
    apiKeyError.value = ''
    clearRevealedCredential()
    emits('change')
  } catch {
    if (props.modelValue.id === provider.id)
      apiKeyError.value = t('intelligence.config.api.apiKeySaveFailed')
  } finally {
    isSavingCredential.value = false
  }
}

async function handleApiKeyControlBlur(blur: () => void): Promise<void> {
  blur()
  await handleApiKeyBlur()
}

function markVoiceAsrDirty(): void {
  voiceAsrDirty.value = true
  voiceAsrError.value = ''
}

async function handleBaseUrlBlur() {
  if (!validateBaseUrl(localBaseUrl.value) || !baseUrlDirty.value || isSavingBaseUrl.value) return
  const providerId = props.modelValue.id
  isSavingBaseUrl.value = true
  try {
    const normalizedBaseUrl =
      providerChannelType.value === ProviderChannelType.BAILIAN
        ? resolveBailianVoiceEndpoints(localBaseUrl.value).baseUrl
        : localBaseUrl.value.trim() || undefined
    const provider = snapshotProviderForSave({
      ...props.modelValue,
      baseUrl: normalizedBaseUrl,
      ...(providerChannelType.value === ProviderChannelType.BAILIAN
        ? {
            metadata: {
              ...(props.modelValue.metadata || {}),
              voiceAsr: { protocol: voiceAsrProtocol.value }
            }
          }
        : {})
    })
    const saved = await aiClient.saveProviderConfig({
      provider,
      credential: { action: 'preserve' }
    })
    intelligenceSettings.updateProvider(providerId, saved)
    if (props.modelValue.id !== providerId) return
    baseUrlInput.value = saved.baseUrl || ''
    baseUrlDirty.value = false
    baseUrlError.value = ''
    emits('change')
  } catch {
    if (props.modelValue.id === providerId)
      baseUrlError.value = t('intelligence.config.api.baseUrlInvalid')
  } finally {
    isSavingBaseUrl.value = false
  }
}

async function handleVoiceAsrBlur(): Promise<void> {
  if (!isVoiceAsrChannel.value || !voiceAsrDirty.value || isSavingVoiceAsr.value) return
  const voiceAsr = normalizeCurrentVoiceAsrMetadata()
  if (!voiceAsr) {
    voiceAsrError.value = t('intelligence.config.api.voiceAsrIdentifierInvalid')
    return
  }
  const providerId = props.modelValue.id
  isSavingVoiceAsr.value = true
  try {
    const provider = snapshotProviderForSave({
      ...props.modelValue,
      metadata: { ...(props.modelValue.metadata || {}), voiceAsr }
    })
    const saved = await aiClient.saveProviderConfig({
      provider,
      credential: { action: 'preserve' }
    })
    intelligenceSettings.updateProvider(providerId, saved)
    if (props.modelValue.id !== providerId) return
    voiceAsrDirty.value = false
    voiceAsrError.value = ''
    emits('change')
  } catch {
    if (props.modelValue.id === providerId)
      voiceAsrError.value = t('intelligence.config.api.connectionFailed')
  } finally {
    isSavingVoiceAsr.value = false
  }
}

function showConnectionDialog(title: string, message: string): void {
  connectionDialogTitle.value = title
  connectionDialogMessage.value = message
  connectionDialogVisible.value = true
}

async function handleTest() {
  if (!canTest.value || isTesting.value) return
  if (!validateBaseUrl(localBaseUrl.value) || !validateApiKey(localApiKey.value)) return
  isTesting.value = true
  testError.value = ''
  testResult.value = ''
  try {
    const testBaseUrl =
      providerChannelType.value === ProviderChannelType.BAILIAN
        ? resolveBailianVoiceEndpoints(localBaseUrl.value).baseUrl
        : localBaseUrl.value.trim() || undefined
    const testProvider = snapshotProviderForSave({
      id: props.modelValue.id,
      type: props.modelValue.type,
      name: props.modelValue.name,
      enabled: true,
      apiKey: localApiKey.value.trim() ? localApiKey.value : undefined,
      baseUrl: testBaseUrl,
      models: Array.isArray(props.modelValue.models) ? [...props.modelValue.models] : [],
      defaultModel: props.modelValue.defaultModel || undefined,
      instructions: props.modelValue.instructions || undefined,
      metadata: props.modelValue.metadata ? { ...props.modelValue.metadata } : undefined,
      timeout: Number(props.modelValue.timeout) || 30000,
      rateLimit: props.modelValue.rateLimit
        ? {
            requestsPerMinute: props.modelValue.rateLimit.requestsPerMinute || undefined,
            tokensPerMinute: props.modelValue.rateLimit.tokensPerMinute || undefined
          }
        : undefined,
      priority: Number(props.modelValue.priority) || 1
    })
    const result = (await aiClient.testProvider(testProvider)) as {
      success?: boolean
      code?: string
      message?: string
    }
    if (result?.success) {
      testResult.value = t('intelligence.config.api.testSuccess')
      showConnectionDialog(
        t('intelligence.config.api.testSuccessTitle'),
        t('intelligence.config.api.testSuccessDesc', { name: props.modelValue.name })
      )
      await fetchAvailableModels(testProvider)
    } else {
      const message = resolveTestFailureMessage(result)
      testError.value = message
      showConnectionDialog(
        t('intelligence.config.api.testFailedTitle'),
        message || t('intelligence.config.api.testFailedDesc')
      )
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('intelligence.config.api.connectionFailed')
    testError.value = message
    showConnectionDialog(
      t('intelligence.config.api.testFailedTitle'),
      t('intelligence.config.api.testErrorDesc', { message })
    )
  } finally {
    isTesting.value = false
  }
}

async function fetchAvailableModels(provider: IntelligenceProviderConfig) {
  try {
    const result = (await aiClient.fetchModels(provider)) as {
      success?: boolean
      models?: string[]
      message?: string
    }
    if (result?.success && result?.models) {
      const models = result.models.filter((model) => typeof model === 'string' && model.trim())
      const defaultModel =
        props.modelValue.defaultModel?.trim() || provider.defaultModel?.trim() || models[0]
      intelligenceSettings.updateProvider(provider.id, {
        models,
        ...(defaultModel ? { defaultModel } : {})
      })
      emits('testSuccess', models)
      showConnectionDialog(
        t('intelligence.config.api.modelsFetchSuccessTitle'),
        t('intelligence.config.api.modelsFetchSuccessDesc', { count: models.length })
      )
    } else {
      emits('testSuccess', [])
    }
  } catch {
    emits('testSuccess', [])
  }
}

onBeforeUnmount(clearRevealedCredential)
onDeactivated(clearRevealedCredential)
</script>

<template>
  <div class="aisdk-api-config">
    <TuffBlockInput
      v-model="localApiKey"
      :title="t('intelligence.config.api.apiKey')"
      :placeholder="apiKeyPlaceholder"
      input-type="password"
      :disabled="isSavingCredential || isRevealingCredential"
      default-icon="i-carbon-password"
      active-icon="i-carbon-password"
    >
      <template #control="control">
        <div class="aisdk-api-config__credential-control">
          <TxInput
            class="aisdk-api-config__input"
            :model-value="String(control.modelValue)"
            :type="isCredentialRevealed ? 'text' : 'password'"
            :placeholder="apiKeyPlaceholder"
            :disabled="control.disabled || isRevealingCredential"
            @update:model-value="control.update"
            @focus="control.focus"
            @blur="handleApiKeyControlBlur(control.blur)"
          />
          <TxButton
            variant="flat"
            size="small"
            :disabled="control.disabled || isRevealingCredential"
            :aria-label="
              t(
                isCredentialRevealed
                  ? 'intelligence.config.api.apiKeyHide'
                  : 'intelligence.config.api.apiKeyShow'
              )
            "
            @mousedown.prevent
            @click.stop="toggleCredentialVisibility"
          >
            <i :class="isCredentialRevealed ? 'i-carbon-view-off' : 'i-carbon-view'" />
          </TxButton>
          <span v-if="apiKeyError" class="aisdk-api-config__inline-error">{{ apiKeyError }}</span>
          <span
            v-else-if="props.modelValue.hasCredential && !credentialDirty && !isCredentialRevealed"
            class="aisdk-api-config__inline-status"
          >
            {{ t('intelligence.config.api.apiKeySaved') }}
          </span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-if="isDoubaoAsrChannel"
      v-model="voiceAsrIdentifierInput"
      :title="voiceAsrIdentifierTitle"
      :placeholder="voiceAsrIdentifierPlaceholder"
      :disabled="isSavingVoiceAsr"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
      @update:model-value="markVoiceAsrDirty"
      @blur="handleVoiceAsrBlur"
    >
      <template #control="control">
        <div class="aisdk-api-config__field-control">
          <TxInput
            class="aisdk-api-config__input"
            :model-value="String(control.modelValue)"
            :placeholder="voiceAsrIdentifierPlaceholder"
            :disabled="control.disabled"
            @update:model-value="control.update"
            @focus="control.focus"
            @blur="control.blur"
          />
          <span v-if="voiceAsrError" class="aisdk-api-config__inline-error">{{
            voiceAsrError
          }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="localBaseUrl"
      :title="t('intelligence.config.api.baseUrl')"
      :placeholder="baseUrlPlaceholder"
      clearable
      @blur="handleBaseUrlBlur"
    >
      <template #control="control">
        <div class="aisdk-api-config__field-control">
          <TxInput
            class="aisdk-api-config__input"
            :model-value="String(control.modelValue)"
            :placeholder="baseUrlPlaceholder"
            :disabled="control.disabled"
            clearable
            @update:model-value="control.update"
            @focus="control.focus"
            @blur="control.blur"
          />
          <span v-if="baseUrlError" class="aisdk-api-config__inline-error">{{ baseUrlError }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSlot
      :title="t('intelligence.config.api.testConnection')"
      default-icon="i-carbon-content-delivery-network"
      active-icon="i-carbon-content-delivery-network"
      :active="!!testResult"
      guidance
    >
      <div class="aisdk-api-config__test-row">
        <div class="aisdk-api-config__test-status">
          <div v-if="testResult" class="aisdk-api-config__test-success">
            <i class="i-carbon-checkmark-filled-warning" /><span>{{ testResult }}</span>
          </div>
          <div v-else-if="testError" class="aisdk-api-config__test-error" :title="testError">
            <i class="i-carbon-warning-filled" /><span>{{ testError }}</span>
          </div>
        </div>
        <TxButton
          variant="flat"
          :disabled="!canTest || isTesting"
          :loading="isTesting"
          @click="handleTest"
        >
          <i v-if="!isTesting" class="i-carbon-play-filled" /><span>{{
            t('intelligence.config.api.testButton')
          }}</span>
        </TxButton>
      </div>
    </TuffBlockSlot>

    <FlipDialog
      v-model="connectionDialogVisible"
      :header-title="connectionDialogTitle"
      :reference-auto-open="false"
    >
      <div class="aisdk-api-config__dialog-content">
        <p>{{ connectionDialogMessage }}</p>
        <TxButton variant="flat" @click="connectionDialogVisible = false">{{
          t('intelligence.config.api.dialogClose')
        }}</TxButton>
      </div>
    </FlipDialog>
  </div>
</template>

<style lang="scss" scoped>
.aisdk-api-config__credential-control,
.aisdk-api-config__field-control {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 234px;
  max-width: 100%;
  margin-left: auto;
  flex-shrink: 0;
}

.aisdk-api-config__credential-control :deep(.aisdk-api-config__input),
.aisdk-api-config__field-control :deep(.aisdk-api-config__input) {
  min-width: 0;
  flex: 1;
}

.aisdk-api-config__inline-status,
.aisdk-api-config__inline-error {
  flex: 0 0 auto;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
}

.aisdk-api-config__inline-status {
  color: var(--tx-color-success);
}
.aisdk-api-config__inline-error {
  color: var(--tx-color-danger);
}
.aisdk-api-config__test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.aisdk-api-config__test-status {
  display: flex;
  align-items: center;
  max-width: min(240px, 32vw);
  min-width: 0;
}
.aisdk-api-config__test-success,
.aisdk-api-config__test-error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 0.875rem;
}
.aisdk-api-config__test-success {
  color: var(--tx-color-success);
}
.aisdk-api-config__test-error {
  color: var(--tx-color-danger);
}
.aisdk-api-config__test-success span,
.aisdk-api-config__test-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aisdk-api-config__dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.aisdk-api-config__dialog-content p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
