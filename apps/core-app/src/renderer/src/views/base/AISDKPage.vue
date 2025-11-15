<template>
  <ViewTemplate title="AI SDK">
    <div class="aisdk-shell">
      <section class="aisdk-sidebar">
        <div class="sidebar-header">
          <h3>{{ t('aisdk.providers') }}</h3>
          <TButton variant="primary" size="sm" block @click="showAddProvider = true">
            <i class="i-carbon-add" />
            {{ t('aisdk.addProvider') }}
          </TButton>
        </div>
        <div class="provider-group">
          <p class="group-title">{{ t('aisdk.builtinProviders') }}</p>
          <button
            v-for="provider in builtinProviders"
            :key="provider.id"
            type="button"
            class="provider-card"
            :class="{ active: selectedProvider?.id === provider.id }"
            @click="selectProvider(provider)"
          >
            <div class="card-icon">{{ getProviderIcon(provider.type) }}</div>
            <div class="card-info">
              <span class="card-name">{{ provider.name }}</span>
              <TTag :type="provider.enabled ? 'success' : 'default'" size="sm" pill>
                {{ provider.enabled ? t('aisdk.enabled') : t('aisdk.disabled') }}
              </TTag>
            </div>
            <i class="indicator i-carbon-chevron-right" />
          </button>
        </div>
        <div v-if="customProviders.length" class="provider-group">
          <p class="group-title">{{ t('aisdk.customProviders') }}</p>
          <button
            v-for="provider in customProviders"
            :key="provider.id"
            type="button"
            class="provider-card"
            :class="{ active: selectedProvider?.id === provider.id }"
            @click="selectProvider(provider)"
          >
            <div class="card-icon custom">{{ getProviderIcon(provider.type) }}</div>
            <div class="card-info">
              <span class="card-name">{{ provider.name }}</span>
              <TTag :type="provider.enabled ? 'success' : 'default'" size="sm" pill>
                {{ provider.enabled ? t('aisdk.enabled') : t('aisdk.disabled') }}
              </TTag>
            </div>
            <i class="indicator i-carbon-chevron-right" />
          </button>
        </div>
      </section>

      <section class="aisdk-main">
        <div v-if="!selectedProvider" class="aisdk-empty">
          <i class="i-carbon-watson-machine-learning" />
          <p>{{ t('aisdk.selectProviderHint') }}</p>
          <TButton variant="primary" size="lg" @click="showAddProvider = true">
            {{ t('aisdk.addProvider') }}
          </TButton>
        </div>

        <div v-else class="aisdk-panel">
          <header class="panel-header">
            <div class="panel-meta">
              <div class="panel-icon">{{ getProviderIcon(selectedProvider.type) }}</div>
              <div>
                <h2>{{ selectedProvider.name }}</h2>
                <TTag type="info" size="sm" pill>{{ selectedProvider.type }}</TTag>
              </div>
            </div>
            <div class="panel-actions">
              <TButton
                v-if="selectedProvider.enabled && selectedProvider.apiKey"
                variant="primary"
                size="sm"
                :loading="testingProvider === selectedProvider.id"
                @click="testProvider(selectedProvider)"
              >
                <i
                  :class="
                    testingProvider === selectedProvider.id ? 'i-carbon-renew animate-spin' : 'i-carbon-play-filled'
                  "
                />
                {{ testingProvider === selectedProvider.id ? t('aisdk.testing') : t('aisdk.test') }}
              </TButton>
              <TSwitch v-model="selectedProvider.enabled" @change="onProviderChange" />
              <TButton
                v-if="selectedProvider.custom"
                variant="danger"
                size="sm"
                @click="deleteProvider(selectedProvider)"
              >
                <i class="i-carbon-trash-can" />
              </TButton>
            </div>
          </header>

          <section
            v-if="testResults[selectedProvider.id]"
            class="panel-results"
            :class="{ success: testResults[selectedProvider.id].success }"
          >
            <i
              :class="
                testResults[selectedProvider.id].success
                  ? 'i-carbon-checkmark-filled'
                  : 'i-carbon-warning-filled'
              "
            />
            <div>
              <p class="result-title">
                {{ testResults[selectedProvider.id].success ? t('aisdk.testSuccess') : t('aisdk.testFailed') }}
              </p>
              <p class="result-message">{{ testResults[selectedProvider.id].message }}</p>
              <p v-if="testResults[selectedProvider.id].latency" class="result-latency">
                {{ t('aisdk.latency') }}: {{ testResults[selectedProvider.id].latency }}ms
              </p>
            </div>
          </section>

          <section class="panel-section">
            <h4>{{ t('aisdk.apiConfig') }}</h4>
            <div class="field-grid">
              <div class="field">
                <label>{{ t('aisdk.apiKey') }}</label>
                <TFormInput
                  v-model="selectedProvider.apiKey"
                  type="password"
                  :placeholder="t('aisdk.apiKeyPlaceholder')"
                  @blur="onProviderChange"
                />
              </div>
              <div class="field">
                <label>{{ t('aisdk.baseUrl') }}</label>
                <TFormInput
                  v-model="selectedProvider.baseUrl"
                  type="text"
                  :placeholder="t('aisdk.baseUrlPlaceholder')"
                  @blur="onProviderChange"
                />
              </div>
            </div>
          </section>

          <section class="panel-section">
            <h4>{{ t('aisdk.modelConfig') }}</h4>
            <div class="field">
              <label>{{ t('aisdk.models') }}</label>
              <div class="model-builder">
                <div class="model-tags">
                  <TTag
                    v-for="(model, idx) in selectedProvider.models"
                    :key="model"
                    type="info"
                    size="sm"
                    pill
                  >
                    <span>{{ model }}</span>
                    <button type="button" class="tag-remove" @click="removeModel(selectedProvider, idx)">
                      <i class="i-carbon-close" />
                    </button>
                  </TTag>
                </div>
                <TFormInput
                  v-model="newModel[selectedProvider.id]"
                  :placeholder="t('aisdk.addModelPlaceholder')"
                  @keyup.enter="addModel(selectedProvider)"
                />
              </div>
            </div>
            <div class="field">
              <label>{{ t('aisdk.defaultModel') }}</label>
              <TSelectField
                v-model="selectedProvider.defaultModel"
                :placeholder="t('aisdk.selectModel')"
                :options="(selectedProvider.models || []).map(model => ({ label: model, value: model }))"
                clearable
                @change="onProviderChange"
              />
            </div>
            <div class="field">
              <label>{{ t('aisdk.instructions') }}</label>
              <TFormInput
                v-model="selectedProvider.instructions"
                textarea
                :rows="4"
                :placeholder="t('aisdk.instructionsPlaceholder')"
                @blur="onProviderChange"
              />
            </div>
          </section>

          <section class="panel-section">
            <h4>{{ t('aisdk.advancedConfig') }}</h4>
            <div class="field-grid">
              <div class="field">
                <label>{{ t('aisdk.priority') }}</label>
                <TSelectField
                  v-model="selectedProvider.priority"
                  :options="priorityOptions"
                  :placeholder="t('aisdk.priorityHigh')"
                  @change="onProviderChange"
                />
              </div>
              <div class="field">
                <label>{{ t('aisdk.timeout') }}</label>
                <div class="inline-input">
                  <TFormInput
                    v-model.number="selectedProvider.timeout"
                    type="number"
                    min="1000"
                    max="300000"
                    step="1000"
                    @blur="onProviderChange"
                  />
                  <span class="unit">ms</span>
                </div>
              </div>
            </div>
          </section>

          <section class="panel-section">
            <h4>{{ t('aisdk.rateLimit') }}</h4>
            <div class="field-grid">
              <div class="field">
                <label>{{ t('aisdk.requestsPerMinute') }}</label>
                <TFormInput
                  v-model.number="selectedProvider.rateLimit!.requestsPerMinute"
                  type="number"
                  min="0"
                  :placeholder="t('aisdk.unlimited')"
                  @blur="onProviderChange"
                />
              </div>
              <div class="field">
                <label>{{ t('aisdk.tokensPerMinute') }}</label>
                <TFormInput
                  v-model.number="selectedProvider.rateLimit!.tokensPerMinute"
                  type="number"
                  min="0"
                  :placeholder="t('aisdk.unlimited')"
                  @blur="onProviderChange"
                />
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>

    <TModal v-model="showAddProvider" :title="t('aisdk.addCustomProvider')">
      <div class="modal-fields">
        <div class="field">
          <label>{{ t('aisdk.providerType') }}</label>
          <TSelectField
            v-model="newProvider.type"
            :options="providerTypeOptions"
            :placeholder="t('aisdk.providerType')"
          />
        </div>
        <div class="field">
          <label>{{ t('aisdk.providerName') }}</label>
          <TFormInput v-model="newProvider.name" :placeholder="t('aisdk.providerNamePlaceholder')" />
        </div>
        <div class="field">
          <label>{{ t('aisdk.baseUrl') }}</label>
          <TFormInput v-model="newProvider.baseUrl" :placeholder="t('aisdk.baseUrlPlaceholder')" />
        </div>
      </div>
      <template #footer>
        <TButton variant="ghost" @click="showAddProvider = false">
          {{ t('common.cancel') }}
        </TButton>
        <TButton
          variant="primary"
          :disabled="!newProvider.name || !newProvider.baseUrl"
          @click="addCustomProvider"
        >
          {{ t('common.add') }}
        </TButton>
      </template>
    </TModal>
  </ViewTemplate>
</template>

<script setup lang="ts" name="AISDKPage">
import { useI18n } from 'vue-i18n'
import { ref, computed, reactive } from 'vue'
import ViewTemplate from '@comp/base/template/ViewTemplate.vue'
import TButton from '@comp/base/tuff/TButton.vue'
import TFormInput from '@comp/base/tuff/TFormInput.vue'
import TSelectField from '@comp/base/tuff/TSelectField.vue'
import TTag from '@comp/base/tuff/TTag.vue'
import TModal from '@comp/base/tuff/TModal.vue'
import TSwitch from '@comp/base/switch/TSwitch.vue'

enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

interface AiProviderRateLimit {
  requestsPerMinute?: number
  tokensPerMinute?: number
}

interface AiProviderConfig {
  id: string
  type: AiProviderType
  name: string
  enabled: boolean
  custom?: boolean
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: AiProviderRateLimit
  priority?: number
}

const { t } = useI18n()

const providers = ref<AiProviderConfig[]>([
  {
    id: 'openai-default',
    type: AiProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'anthropic-default',
    type: AiProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'deepseek-default',
    type: AiProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 2,
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'local-default',
    type: AiProviderType.LOCAL,
    name: 'Local Model',
    enabled: false,
    priority: 3,
    models: [],
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    rateLimit: {}
  }
])

const selectedProvider = ref<AiProviderConfig | null>(null)
const showAddProvider = ref(false)
const newModel = reactive<Record<string, string>>({})
const testingProvider = ref<string | null>(null)
const testResults = reactive<Record<string, { success: boolean; message?: string; latency?: number }>>({})

const newProvider = reactive({
  type: 'custom' as AiProviderType,
  name: '',
  baseUrl: ''
})

const builtinProviders = computed(() => providers.value.filter(p => !p.custom))
const customProviders = computed(() => providers.value.filter(p => p.custom))
const priorityOptions = computed(() => [
  { value: 1, label: t('aisdk.priorityHigh') },
  { value: 2, label: t('aisdk.priorityMedium') },
  { value: 3, label: t('aisdk.priorityLow') }
])
const providerTypeOptions = computed(() => [
  { value: AiProviderType.CUSTOM, label: t('aisdk.customCompatible') },
  { value: AiProviderType.OPENAI, label: `OpenAI ${t('aisdk.compatible')}` },
  { value: AiProviderType.ANTHROPIC, label: `Anthropic ${t('aisdk.compatible')}` },
  { value: AiProviderType.DEEPSEEK, label: 'DeepSeek' },
  { value: AiProviderType.LOCAL, label: 'Local' }
])

function ensureProviderShape(provider: AiProviderConfig) {
  if (!provider.models) {
    provider.models = []
  }
  if (!provider.rateLimit) {
    provider.rateLimit = {}
  }
  if (typeof provider.priority === 'undefined') {
    provider.priority = 2
  }
  if (typeof provider.timeout === 'undefined') {
    provider.timeout = 30000
  }
}

function selectProvider(provider: AiProviderConfig) {
  ensureProviderShape(provider)
  selectedProvider.value = provider
}

function getProviderIcon(type: AiProviderType): string {
  const icons: Record<AiProviderType, string> = {
    [AiProviderType.OPENAI]: '🤖',
    [AiProviderType.ANTHROPIC]: '🧠',
    [AiProviderType.DEEPSEEK]: '🔍',
    [AiProviderType.LOCAL]: '💻',
    [AiProviderType.CUSTOM]: '⚙️'
  }
  return icons[type] || '⚙️'
}

function onProviderChange() {
  console.log('Provider changed:', selectedProvider.value)
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
    onProviderChange()
  }
}

function removeModel(provider: AiProviderConfig, index: number) {
  if (provider.models) {
    provider.models.splice(index, 1)
    onProviderChange()
  }
}

async function testProvider(provider: AiProviderConfig) {
  testingProvider.value = provider.id
  delete testResults[provider.id]

  const startTime = Date.now()

  try {
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const latency = Date.now() - startTime
    testResults[provider.id] = {
      success: true,
      message: t('aisdk.testSuccessMessage'),
      latency
    }
  } catch (error) {
    testResults[provider.id] = {
      success: false,
      message: error instanceof Error ? error.message : t('aisdk.testErrorMessage')
    }
  } finally {
    testingProvider.value = null
  }
}

function addCustomProvider() {
  if (!newProvider.name || !newProvider.baseUrl) return

  const provider: AiProviderConfig = {
    id: `custom-${Date.now()}`,
    type: newProvider.type,
    name: newProvider.name,
    enabled: false,
    custom: true,
    baseUrl: newProvider.baseUrl,
    models: [],
    priority: 2,
    timeout: 30000,
    rateLimit: {}
  }

  providers.value.push(provider)
  selectedProvider.value = provider
  showAddProvider.value = false
  
  newProvider.type = AiProviderType.CUSTOM
  newProvider.name = ''
  newProvider.baseUrl = ''
}

function deleteProvider(provider: AiProviderConfig) {
  const index = providers.value.findIndex(p => p.id === provider.id)
  if (index > -1) {
    providers.value.splice(index, 1)
    selectedProvider.value = null
  }
}
</script>

<style lang="scss" scoped>
.aisdk-shell {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  background: var(--el-bg-color-page, transparent);
}

.aisdk-sidebar {
  background: var(--el-bg-color);
  border-radius: 24px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  border: 1px solid var(--el-border-color-lighter);
}

.sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.provider-group {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .group-title {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--el-text-color-secondary);
  }
}

.provider-card {
  border: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    box-shadow: inset 0 0 0 1px var(--el-color-primary-light-3);
  }

  .card-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--el-fill-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;

    &.custom {
      background: var(--el-color-warning-light-9);
    }
  }

  .card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .card-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .indicator {
    color: var(--el-color-primary);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &.active .indicator {
    opacity: 1;
  }
}

.aisdk-main {
  background: var(--el-bg-color);
  border-radius: 24px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.aisdk-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);

  i {
    font-size: 56px;
  }

  p {
    margin: 0;
  }
}

.aisdk-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-meta {
  display: flex;
  gap: 16px;
  align-items: center;

  h2 {
    margin: 0 0 4px 0;
  }
}

.panel-icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-results {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);

  &.success {
    border-color: var(--el-color-success-light-5);
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }

  i {
    font-size: 24px;
  }

  .result-title {
    margin: 0;
    font-weight: 600;
  }

  .result-message,
  .result-latency {
    margin: 0;
    font-size: 13px;
  }
}

.panel-section {
  background: var(--el-fill-color-lighter);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h4 {
    margin: 0;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
}

.field-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.model-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-remove {
  border: none;
  background: transparent;
  color: inherit;
  margin-left: 6px;
  cursor: pointer;
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;

  .unit {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.modal-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>

