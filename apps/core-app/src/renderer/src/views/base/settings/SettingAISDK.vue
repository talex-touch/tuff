<template>
  <tuff-group-block
    :name="t('settings.settingAISDK.groupTitle')"
    :description="t('settings.settingAISDK.groupDesc')"
    default-icon="i-carbon-watson-machine-learning"
    active-icon="i-carbon-ai-status"
    memory-name="setting-aisdk"
  >
    <div v-for="provider in providers" :key="provider.id" class="provider-section">
      <div class="provider-header">
        <div class="provider-info">
          <div class="provider-icon" :class="`icon-${provider.type}`">
            {{ getProviderIcon(provider.type) }}
          </div>
          <div class="provider-title">
            <h4>{{ provider.name }}</h4>
            <span class="provider-type">{{ provider.type }}</span>
          </div>
        </div>
        <div class="provider-actions">
          <button
            v-if="provider.enabled && provider.apiKey"
            class="test-button"
            :class="{ testing: testingProvider === provider.id }"
            @click="testProvider(provider)"
          >
            <i v-if="testingProvider === provider.id" class="i-carbon-renew animate-spin" />
            <i v-else class="i-carbon-play-filled" />
            {{ testingProvider === provider.id ? t('settings.settingAISDK.testing') : t('settings.settingAISDK.test') }}
          </button>
          <tuff-block-switch
            v-model="provider.enabled"
            :title="t('settings.settingAISDK.enableProvider')"
            :description="t('settings.settingAISDK.enableProviderDesc', { name: provider.name })"
            default-icon="i-carbon-toggle-off"
            active-icon="i-carbon-toggle-on"
            @update:model-value="onProviderChange(provider)"
          />
        </div>
      </div>

      <div v-if="provider.enabled" class="provider-config">
        <!-- API Configuration -->
        <div class="config-section">
          <h5>{{ t('settings.settingAISDK.apiConfig') }}</h5>
          
          <tuff-block-slot
            :title="t('settings.settingAISDK.apiKey')"
            :description="t('settings.settingAISDK.apiKeyDesc')"
            default-icon="i-carbon-key"
            active-icon="i-carbon-unlocked"
            :active="Boolean(provider.apiKey)"
          >
            <div class="input-wrapper">
              <input
                v-model="provider.apiKey"
                type="password"
                :placeholder="t('settings.settingAISDK.apiKeyPlaceholder')"
                class="config-input"
                @blur="onProviderChange(provider)"
              />
            </div>
          </tuff-block-slot>

          <tuff-block-slot
            :title="t('settings.settingAISDK.baseUrl')"
            :description="t('settings.settingAISDK.baseUrlDesc')"
            default-icon="i-carbon-network-3"
            active-icon="i-carbon-network-4"
            :active="Boolean(provider.baseUrl)"
          >
            <div class="input-wrapper">
              <input
                v-model="provider.baseUrl"
                type="text"
                :placeholder="t('settings.settingAISDK.baseUrlPlaceholder')"
                class="config-input"
                @blur="onProviderChange(provider)"
              />
            </div>
          </tuff-block-slot>
        </div>

        <!-- Model Configuration -->
        <div class="config-section">
          <h5>{{ t('settings.settingAISDK.modelConfig') }}</h5>
          
          <tuff-block-slot
            :title="t('settings.settingAISDK.models')"
            :description="t('settings.settingAISDK.modelsDesc')"
            default-icon="i-carbon-model"
            active-icon="i-carbon-data-enrichment"
            :active="provider.models && provider.models.length > 0"
          >
            <div class="models-input">
              <div class="model-tags">
                <span
                  v-for="(model, idx) in provider.models"
                  :key="idx"
                  class="model-tag"
                >
                  {{ model }}
                  <i class="i-carbon-close" @click="removeModel(provider, idx)" />
                </span>
              </div>
              <input
                v-model="newModel[provider.id]"
                type="text"
                :placeholder="t('settings.settingAISDK.addModelPlaceholder')"
                class="model-input"
                @keyup.enter="addModel(provider)"
              />
            </div>
          </tuff-block-slot>

          <tuff-block-slot
            :title="t('settings.settingAISDK.defaultModel')"
            :description="t('settings.settingAISDK.defaultModelDesc')"
            default-icon="i-carbon-select-01"
            active-icon="i-carbon-checkmark"
            :active="Boolean(provider.defaultModel)"
          >
            <div class="input-wrapper">
              <select
                v-model="provider.defaultModel"
                class="config-select"
                @change="onProviderChange(provider)"
              >
                <option value="">{{ t('settings.settingAISDK.selectModel') }}</option>
                <option v-for="model in provider.models" :key="model" :value="model">
                  {{ model }}
                </option>
              </select>
            </div>
          </tuff-block-slot>

          <tuff-block-slot
            :title="t('settings.settingAISDK.instructions')"
            :description="t('settings.settingAISDK.instructionsDesc')"
            default-icon="i-carbon-document"
            active-icon="i-carbon-document-tasks"
            :active="Boolean(provider.instructions)"
          >
            <div class="input-wrapper">
              <textarea
                v-model="provider.instructions"
                :placeholder="t('settings.settingAISDK.instructionsPlaceholder')"
                class="config-textarea"
                rows="3"
                @blur="onProviderChange(provider)"
              />
            </div>
          </tuff-block-slot>
        </div>

        <!-- Advanced Configuration -->
        <div class="config-section">
          <h5>{{ t('settings.settingAISDK.advancedConfig') }}</h5>
          
          <tuff-block-select
            v-model="provider.priority"
            :title="t('settings.settingAISDK.priority')"
            :description="t('settings.settingAISDK.priorityDesc')"
            default-icon="i-carbon-data-quality-definition"
            active-icon="i-carbon-data-quality-definition"
            @update:model-value="onProviderChange(provider)"
          >
            <t-select-item :model-value="1">{{ t('settings.settingAISDK.priorityHigh') }}</t-select-item>
            <t-select-item :model-value="2">{{ t('settings.settingAISDK.priorityMedium') }}</t-select-item>
            <t-select-item :model-value="3">{{ t('settings.settingAISDK.priorityLow') }}</t-select-item>
          </tuff-block-select>

          <tuff-block-slot
            :title="t('settings.settingAISDK.timeout')"
            :description="t('settings.settingAISDK.timeoutDesc')"
            default-icon="i-carbon-timer"
            active-icon="i-carbon-time"
            :active="Boolean(provider.timeout)"
          >
            <div class="input-wrapper">
              <input
                v-model.number="provider.timeout"
                type="number"
                min="1000"
                max="300000"
                step="1000"
                :placeholder="t('settings.settingAISDK.timeoutPlaceholder')"
                class="config-input"
                @blur="onProviderChange(provider)"
              />
              <span class="input-unit">ms</span>
            </div>
          </tuff-block-slot>
        </div>

        <!-- Rate Limits -->
        <div class="config-section">
          <h5>{{ t('settings.settingAISDK.rateLimit') }}</h5>
          
          <tuff-block-slot
            :title="t('settings.settingAISDK.requestsPerMinute')"
            :description="t('settings.settingAISDK.requestsPerMinuteDesc')"
            default-icon="i-carbon-time"
            active-icon="i-carbon-timer"
            :active="Boolean(provider.rateLimit?.requestsPerMinute)"
          >
            <div class="input-wrapper">
              <input
                v-if="provider.rateLimit"
                v-model.number="provider.rateLimit.requestsPerMinute"
                type="number"
                min="0"
                :placeholder="t('settings.settingAISDK.unlimited')"
                class="config-input"
                @blur="onProviderChange(provider)"
              />
            </div>
          </tuff-block-slot>

          <tuff-block-slot
            :title="t('settings.settingAISDK.tokensPerMinute')"
            :description="t('settings.settingAISDK.tokensPerMinuteDesc')"
            default-icon="i-carbon-token"
            active-icon="i-carbon-data-1"
            :active="Boolean(provider.rateLimit?.tokensPerMinute)"
          >
            <div class="input-wrapper">
              <input
                v-if="provider.rateLimit"
                v-model.number="provider.rateLimit.tokensPerMinute"
                type="number"
                min="0"
                :placeholder="t('settings.settingAISDK.unlimited')"
                class="config-input"
                @blur="onProviderChange(provider)"
              />
            </div>
          </tuff-block-slot>
        </div>

        <!-- Test Results -->
        <div v-if="testResults[provider.id]" class="test-results" :class="testResults[provider.id].success ? 'success' : 'error'">
          <div class="test-header">
            <i :class="testResults[provider.id].success ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-filled'" />
            <span>{{ testResults[provider.id].success ? t('settings.settingAISDK.testSuccess') : t('settings.settingAISDK.testFailed') }}</span>
          </div>
          <div class="test-detail">
            <p v-if="testResults[provider.id].message">{{ testResults[provider.id].message }}</p>
            <p v-if="testResults[provider.id].latency" class="latency">
              {{ t('settings.settingAISDK.latency') }}: {{ testResults[provider.id].latency }}ms
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Global Settings -->
    <div class="global-settings">
      <h5>{{ t('settings.settingAISDK.globalSettings') }}</h5>
      
      <tuff-block-switch
        v-model="aiConfig.enableAudit"
        :title="t('settings.settingAISDK.enableAudit')"
        :description="t('settings.settingAISDK.enableAuditDesc')"
        default-icon="i-carbon-security-services"
        active-icon="i-carbon-security"
        @update:model-value="onConfigChange"
      />

      <tuff-block-switch
        v-model="aiConfig.enableCache"
        :title="t('settings.settingAISDK.enableCache')"
        :description="t('settings.settingAISDK.enableCacheDesc')"
        default-icon="i-carbon-data-base"
        active-icon="i-carbon-data-base-alt"
        @update:model-value="onConfigChange"
      />

      <tuff-block-select
        v-if="aiConfig.enableCache"
        v-model="aiConfig.cacheExpiration"
        :title="t('settings.settingAISDK.cacheExpiration')"
        :description="t('settings.settingAISDK.cacheExpirationDesc')"
        default-icon="i-carbon-time"
        active-icon="i-carbon-timer"
        @update:model-value="onConfigChange"
      >
        <t-select-item :model-value="300">5 {{ t('common.minutes') }}</t-select-item>
        <t-select-item :model-value="900">15 {{ t('common.minutes') }}</t-select-item>
        <t-select-item :model-value="1800">30 {{ t('common.minutes') }}</t-select-item>
        <t-select-item :model-value="3600">1 {{ t('common.hours') }}</t-select-item>
        <t-select-item :model-value="7200">2 {{ t('common.hours') }}</t-select-item>
        <t-select-item :model-value="86400">24 {{ t('common.hours') }}</t-select-item>
      </tuff-block-select>
    </div>
  </tuff-group-block>
</template>

<script setup lang="ts" name="SettingAISDK">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, reactive } from 'vue'

import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

interface AiProviderRateLimit {
  requestsPerMinute?: number
  requestsPerDay?: number
  tokensPerMinute?: number
  tokensPerDay?: number
}

interface AiProviderConfig {
  id: string
  type: AiProviderType
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: AiProviderRateLimit
  priority: number  // Changed from optional to required
}

interface AiSDKConfig {
  providers: AiProviderConfig[]
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration: number  // Changed from optional to required
}

const { t } = useI18n()
const ProviderType = AiProviderType

const providers = ref<AiProviderConfig[]>([
  {
    id: 'openai-default',
    type: ProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: undefined,
      tokensPerMinute: undefined
    }
  },
  {
    id: 'anthropic-default',
    type: ProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: undefined,
      tokensPerMinute: undefined
    }
  },
  {
    id: 'deepseek-default',
    type: ProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 2,
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: undefined,
      tokensPerMinute: undefined
    }
  },
  {
    id: 'local-default',
    type: ProviderType.LOCAL,
    name: 'Local Model',
    enabled: false,
    priority: 3,
    models: [],
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    rateLimit: {
      requestsPerMinute: undefined,
      tokensPerMinute: undefined
    }
  }
])

const aiConfig = ref<AiSDKConfig>({
  providers: [],
  defaultStrategy: 'adaptive-default',
  enableAudit: true,
  enableCache: true,
  cacheExpiration: 1800
})

const newModel = reactive<Record<string, string>>({})
const testingProvider = ref<string | null>(null)
const testResults = reactive<Record<string, { success: boolean; message?: string; latency?: number }>>({})

onMounted(() => {
  loadAISDKConfig()
})

function loadAISDKConfig() {
  console.log('Loading AISDK configuration...')
}

function onProviderChange(provider: AiProviderConfig) {
  console.log('Provider configuration changed:', provider)
  saveAISDKConfig()
}

function onConfigChange() {
  console.log('AISDK configuration changed')
  saveAISDKConfig()
}

function saveAISDKConfig() {
  aiConfig.value.providers = providers.value
  console.log('Saving AISDK configuration:', aiConfig.value)
}

function getProviderIcon(type: AiProviderType): string {
  const icons: Record<AiProviderType, string> = {
    [ProviderType.OPENAI]: '🤖',
    [ProviderType.ANTHROPIC]: '🧠',
    [ProviderType.DEEPSEEK]: '🔍',
    [ProviderType.LOCAL]: '💻',
    [ProviderType.CUSTOM]: '⚙️'
  }
  return icons[type] || '🤖'
}

function addModel(provider: AiProviderConfig) {
  const modelName = newModel[provider.id]?.trim()
  if (!modelName) return

  if (!provider.models) {
    provider.models = []
  }

  if (!provider.models.includes(modelName)) {
    provider.models.push(modelName)
    newModel[provider.id] = ''
    onProviderChange(provider)
  }
}

function removeModel(provider: AiProviderConfig, index: number) {
  if (provider.models) {
    provider.models.splice(index, 1)
    onProviderChange(provider)
  }
}

async function testProvider(provider: AiProviderConfig) {
  testingProvider.value = provider.id
  delete testResults[provider.id]

  const startTime = Date.now()

  try {
    console.log(`Testing ${provider.name}...`, {
      baseUrl: provider.baseUrl,
      model: provider.defaultModel,
      hasApiKey: !!provider.apiKey
    })

    await new Promise(resolve => setTimeout(resolve, 1000))

    const latency = Date.now() - startTime
    testResults[provider.id] = {
      success: true,
      message: t('settings.settingAISDK.testSuccessMessage'),
      latency
    }
  } catch (error) {
    testResults[provider.id] = {
      success: false,
      message: error instanceof Error ? error.message : t('settings.settingAISDK.testErrorMessage')
    }
  } finally {
    testingProvider.value = null
  }
}
</script>

<style lang="scss" scoped>
.provider-section {
  margin-bottom: 24px;
  padding: 20px;
  background: var(--el-fill-color-lighter);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.provider-icon {
  font-size: 36px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  border-radius: 12px;
}

.provider-title {
  h4 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .provider-type {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.provider-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.test-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--el-color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--el-color-primary-light-3);
  }

  &.testing {
    opacity: 0.7;
    cursor: not-allowed;
  }

  i {
    font-size: 16px;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.provider-config {
  margin-top: 20px;
}

.config-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  h5 {
    margin: 0 0 16px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    gap: 8px;

    &::before {
      content: '';
      width: 3px;
      height: 16px;
      background: var(--el-color-primary);
      border-radius: 2px;
    }
  }
}

.input-wrapper {
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-unit {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.config-input,
.config-select,
.config-textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  outline: none;
  transition: all 0.2s;
  font-family: inherit;

  &:focus {
    border-color: var(--el-color-primary);
    background: var(--el-fill-color-blank);
  }

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }

  &[type='password'] {
    font-family: monospace;
  }
}

.config-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}

.models-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 4px;
  font-size: 13px;

  i {
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;

    &:hover {
      opacity: 1;
    }
  }
}

.model-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--el-fill-color-blank);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  outline: none;
  transition: all 0.2s;

  &:focus {
    border-color: var(--el-color-primary);
    border-style: solid;
  }

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}

.test-results {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid;

  &.success {
    background: var(--el-color-success-light-9);
    border-color: var(--el-color-success-light-5);
  }

  &.error {
    background: var(--el-color-error-light-9);
    border-color: var(--el-color-error-light-5);
  }
}

.test-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;

  i {
    font-size: 18px;
  }

  .success & {
    color: var(--el-color-success);
  }

  .error & {
    color: var(--el-color-error);
  }
}

.test-detail {
  font-size: 13px;
  color: var(--el-text-color-regular);

  p {
    margin: 4px 0;
  }

  .latency {
    color: var(--el-text-color-secondary);
    font-family: monospace;
  }
}

.global-settings {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--el-border-color);

  h5 {
    margin: 0 0 20px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}
</style>
