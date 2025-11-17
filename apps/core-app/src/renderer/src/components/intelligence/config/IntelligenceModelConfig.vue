<template>
  <div class="aisdk-model-config">
    <!-- Models Management Button -->
    <TuffBlockSlot
      :title="t('aisdk.config.model.models')"
      :description="modelsError || t('aisdk.config.model.modelsHint')"
      default-icon="i-carbon-model"
      active-icon="i-carbon-model"
      :active="localModels.length > 0"
      :disabled="disabled"
      guidance
      @click="showModelsDrawer = true"
    >
      <div class="models-summary">
        <span v-if="localModels.length === 0" class="text-[var(--el-text-color-placeholder)]">
          {{ t('aisdk.config.model.noModels') }}
        </span>
        <span v-else class="text-[var(--el-text-color-primary)]">
          {{ localModels.length }} {{ t('aisdk.config.model.modelsCount') }}
        </span>
      </div>
    </TuffBlockSlot>

    <!-- Default Model Selector -->
    <TuffBlockSelect
      v-model="localDefaultModel"
      :title="t('aisdk.config.model.defaultModel')"
      :description="defaultModelError || t('aisdk.config.model.defaultModelPlaceholder')"
      default-icon="i-carbon-checkmark"
      active-icon="i-carbon-checkmark"
      :disabled="disabled || localModels.length === 0"
      @update:model-value="handleDefaultModelChange"
    >
      <TSelectItem
        v-for="model in localModels"
        :key="model"
        :model-value="model"
      >
        {{ model }}
      </TSelectItem>
    </TuffBlockSelect>

    <!-- Instructions Prompt Selector -->
    <TuffBlockSlot
      :title="t('aisdk.config.model.instructions')"
      :description="t('aisdk.config.model.instructionsHint')"
      default-icon="i-carbon-document"
      active-icon="i-carbon-document"
      :active="!!localInstructions"
      :disabled="disabled"
      guidance
    >
      <IntelligencePromptSelector
        v-model="localInstructions"
        @update:model-value="handleInstructionsChange"
      />
    </TuffBlockSlot>

    <!-- Models Drawer -->
    <TDrawer
      v-model:visible="showModelsDrawer"
      :title="t('aisdk.config.model.manageModels')"
    >
      <div class="models-drawer-content">
        <p class="text-sm text-[var(--el-text-color-secondary)] mb-4">
          {{ t('aisdk.config.model.modelsHint') }}
        </p>

        <!-- Model Tags -->
        <div class="model-tags-list">
          <div
            v-for="model in localModels"
            :key="model"
            class="model-tag-item"
          >
            <span>{{ model }}</span>
            <i
              class="i-carbon-close cursor-pointer text-[var(--el-text-color-secondary)] hover:text-[var(--el-color-error)]"
              @click="handleRemoveModel(model)"
            />
          </div>
          
          <div v-if="localModels.length === 0" class="empty-state">
            <i class="i-carbon-model text-4xl text-[var(--el-text-color-placeholder)]" />
            <p class="text-[var(--el-text-color-secondary)]">
              {{ t('aisdk.config.model.noModels') }}
            </p>
          </div>
        </div>

        <!-- Fetch Models Button -->
        <div class="fetch-models-section">
          <FlatButton
            class="fetch-models-button"
            :disabled="disabled || !canFetchModels || isFetching"
            :loading="isFetching"
            @click="handleFetchModels"
          >
            <i v-if="isFetching" class="i-carbon-renew animate-spin" />
            <i v-else class="i-carbon-download" />
            {{ t('aisdk.config.model.fetchModels') }}
          </FlatButton>
          <p class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('aisdk.config.model.fetchModelsHint') }}
          </p>
        </div>

        <!-- Add Model Input -->
        <div class="add-model-section">
          <input
            v-model="newModelInput"
            type="text"
            :placeholder="t('aisdk.config.model.addModelPlaceholder')"
            class="add-model-input"
            @keyup.enter="handleAddModel"
          />
          <FlatButton
            class="add-model-button"
            :disabled="!newModelInput.trim()"
            @click="handleAddModel"
          >
            <i class="i-carbon-add" />
            {{ t('aisdk.config.model.addModel') }}
          </FlatButton>
        </div>

        <p v-if="modelsError" class="error-message">
          {{ modelsError }}
        </p>
      </div>
    </TDrawer>
  </div>
</template>

<script lang="ts" name="IntelligenceModelConfig" setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TDrawer from '~/components/base/dialog/TDrawer.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import IntelligencePromptSelector from './IntelligencePromptSelector.vue'
import { createIntelligenceClient } from '@talex-touch/utils/intelligence/client'
import { touchChannel } from '~/modules/channel/channel-core'
import { intelligenceSettings, type AiProviderConfig } from '@talex-touch/utils/renderer/storage'

const props = defineProps<{
  modelValue: AiProviderConfig
  disabled?: boolean
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AiProviderConfig]
  change: []
}>()

const { t } = useI18n()
const aiClient = createIntelligenceClient(touchChannel as any)

// 使用 reactive 计算属性直接操作存储
const localModels = computed({
  get: () => props.modelValue.models || [],
  set: (value: string[]) => {
    intelligenceSettings.updateProvider(props.modelValue.id, { models: value })
    emits('change')
  }
})

const localDefaultModel = computed({
  get: () => props.modelValue.defaultModel || '',
  set: (value: string) => {
    intelligenceSettings.updateProvider(props.modelValue.id, {
      defaultModel: value || undefined
    })
    emits('change')
  }
})

const localInstructions = computed({
  get: () => props.modelValue.instructions || '',
  set: (value: string) => {
    intelligenceSettings.updateProvider(props.modelValue.id, {
      instructions: value || undefined
    })
    emits('change')
  }
})

const newModelInput = ref('')
const modelsError = ref('')
const defaultModelError = ref('')
const showModelsDrawer = ref(false)
const isFetching = ref(false)

// 检查是否可以获取模型（需要 API Key 且不是本地模型）
const canFetchModels = computed(() => {
  const hasApiKey = !!props.modelValue.apiKey?.trim()
  const isNotLocal = props.modelValue.type !== 'local'
  return hasApiKey && isNotLocal
})

function validateModels(): boolean {
  modelsError.value = ''

  if (props.modelValue.enabled && localModels.value.length === 0) {
    modelsError.value = t('aisdk.config.model.modelsRequired')
    return false
  }

  return true
}

function validateDefaultModel(): boolean {
  defaultModelError.value = ''

  if (props.modelValue.enabled && !localDefaultModel.value) {
    defaultModelError.value = t('aisdk.config.model.defaultModelRequired')
    return false
  }

  if (localDefaultModel.value && !localModels.value.includes(localDefaultModel.value)) {
    defaultModelError.value = t('aisdk.config.model.defaultModelInvalid')
    return false
  }

  return true
}

function handleAddModel() {
  const modelName = newModelInput.value.trim()

  if (!modelName) return

  if (localModels.value.includes(modelName)) {
    modelsError.value = t('aisdk.config.model.modelExists')
    return
  }

  const newModels = [...localModels.value, modelName]
  localModels.value = newModels
  newModelInput.value = ''
  modelsError.value = ''

  // If this is the first model, set it as default
  if (newModels.length === 1) {
    localDefaultModel.value = modelName
  }
}

function handleRemoveModel(model: string) {
  const newModels = localModels.value.filter(m => m !== model)
  localModels.value = newModels

  // If removed model was the default, clear default or set to first available
  if (localDefaultModel.value === model) {
    localDefaultModel.value = newModels.length > 0 ? newModels[0] : ''
  }

  validateModels()
}

function handleDefaultModelChange() {
  validateDefaultModel()
}

function handleInstructionsChange() {
  // Instructions are handled automatically by computed property
}

async function handleFetchModels() {
  if (!canFetchModels.value || isFetching.value) return

  isFetching.value = true
  modelsError.value = ''

  try {
    console.log('[Model Config] Fetching available models...')

    // 创建用于获取模型的临时配置
    const fetchConfig = {
      id: props.modelValue.id,
      type: props.modelValue.type,
      name: props.modelValue.name,
      enabled: true,
      apiKey: props.modelValue.apiKey,
      baseUrl: props.modelValue.baseUrl,
      models: [],
      timeout: props.modelValue.timeout || 30000
    }

    const result = await aiClient.fetchModels(fetchConfig)

    if (result.success && result.models) {
      // 合并现有模型和新获取的模型，去重
      const allModels = [...new Set([...localModels.value, ...result.models])]
      localModels.value = allModels

      // 如果没有默认模型且有可用模型，设置第一个为默认
      if (!localDefaultModel.value && allModels.length > 0) {
        localDefaultModel.value = allModels[0]
      }

      toast.success(`已获取 ${result.models.length} 个模型`)
    } else {
      modelsError.value = result.message || '获取模型失败'
      toast.error(`获取模型失败: ${result.message}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取模型失败'
    modelsError.value = message
    toast.error(`获取模型失败: ${message}`)
    console.error('[Model Config] Failed to fetch models:', error)
  } finally {
    isFetching.value = false
  }
}
</script>

<style lang="scss" scoped>
.aisdk-model-config {
  .models-summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.models-drawer-content {
  padding: 0 4px;

  .model-tags-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    min-height: 200px;
    max-height: 400px;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-blank);
  }

  .model-tag-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--el-color-info-light-9);
    border: 1px solid var(--el-color-info-light-7);
    border-radius: 6px;
    font-size: 14px;
    color: var(--el-text-color-primary);

    i {
      font-size: 16px;
      transition: all 0.2s;
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  .fetch-models-section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .fetch-models-button {
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
    width: 100%;
    justify-content: center;
    margin-bottom: 8px;

    &:hover:not(.is-disabled) {
      background: var(--el-color-primary-light-3);
    }

    &.is-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    i {
      font-size: 16px;
    }

    .animate-spin {
      animation: spin 1s linear infinite;
    }
  }

  .add-model-section {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .add-model-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
    
    &:focus {
      border-color: var(--el-color-primary);
    }
    
    &::placeholder {
      color: var(--el-text-color-placeholder);
    }
  }

  .add-model-button {
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

    &:hover:not(.is-disabled) {
      background: var(--el-color-primary-light-3);
    }

    &.is-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    i {
      font-size: 16px;
    }
  }

  .error-message {
    color: var(--el-color-error);
    font-size: 12px;
    margin: 0;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
