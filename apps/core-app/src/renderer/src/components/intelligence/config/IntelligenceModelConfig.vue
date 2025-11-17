<template>
  <div class="aisdk-model-config">
    <!-- Models Management Button -->
    <TuffBlockSlot
      :title="t('intelligence.config.model.models')"
      :description="modelsError || t('intelligence.config.model.modelsHint')"
      default-icon="i-carbon-model"
      active-icon="i-carbon-model"
      :active="localModels.length > 0"
      :disabled="disabled"
      guidance
      @click="showModelsDrawer = true"
    >
      <div class="models-summary">
        <span v-if="localModels.length === 0" class="text-[var(--el-text-color-placeholder)]">
          {{ t('intelligence.config.model.noModels') }}
        </span>
        <span v-else class="text-[var(--el-text-color-primary)]">
          {{ localModels.length }} {{ t('intelligence.config.model.modelsCount') }}
        </span>
        <FlatButton>
          edit
        </FlatButton>
      </div>
    </TuffBlockSlot>

    <!-- Default Model Selector -->
    <TuffBlockSlot
      :title="t('intelligence.config.model.defaultModel')"
      :description="defaultModelError || t('intelligence.config.model.defaultModelPlaceholder')"
      default-icon="i-carbon-checkmark"
      active-icon="i-carbon-checkmark"
      :active="!!localDefaultModel"
      :disabled="disabled || localModels.length === 0"
    >
      <FlatButton
        class="config-action-button"
        :disabled="disabled || localModels.length === 0"
        @click="openDefaultModelDrawer"
      >
        <span>{{ defaultModelSummary }}</span>
        <i class="i-carbon-chevron-right" />
      </FlatButton>
    </TuffBlockSlot>

    <!-- Instructions Prompt Selector -->
    <TuffBlockSlot
      :title="t('intelligence.config.model.instructions')"
      :description="t('intelligence.config.model.instructionsHint')"
      default-icon="i-carbon-document"
      active-icon="i-carbon-document"
      :active="!!localInstructions"
      :disabled="disabled"
      guidance
    >
      <FlatButton :disabled="disabled" @click="openInstructionsDrawer">
        <span>{{ instructionsSummary }}</span>
        <i class="i-carbon-chevron-right" />
      </FlatButton>
    </TuffBlockSlot>

    <!-- Models Drawer -->
    <TDrawer v-model:visible="showModelsDrawer" :title="t('intelligence.config.model.manageModels')">
      <div class="models-drawer-content">
        <p class="text-sm text-[var(--el-text-color-secondary)] mb-4">
          {{ t('intelligence.config.model.modelsHint') }}
        </p>

        <div class="model-transfer-section">
          <el-transfer
            v-model="transferSelectedModels"
            :data="transferData"
            filterable
            :filter-placeholder="t('intelligence.config.model.transferFilterPlaceholder')"
            :titles="[
              t('intelligence.config.model.transferAll'),
              t('intelligence.config.model.transferEnabled')
            ]"
            :target-order="'original'"
          />
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
            {{ t('intelligence.config.model.fetchModels') }}
          </FlatButton>
          <p class="text-xs text-[var(--el-text-color-secondary)]">
            {{ t('intelligence.config.model.fetchModelsHint') }}
          </p>
        </div>

        <!-- Add Model Input -->
        <div class="add-model-section">
          <input
            v-model="newModelInput"
            type="text"
            :placeholder="t('intelligence.config.model.addModelPlaceholder')"
            class="add-model-input"
            @keyup.enter="handleAddModel"
          />
          <FlatButton
            class="add-model-button"
            :disabled="!newModelInput.trim()"
            @click="handleAddModel"
          >
            <i class="i-carbon-add" />
            {{ t('intelligence.config.model.addModel') }}
          </FlatButton>
        </div>

        <p v-if="modelsError" class="error-message">
          {{ modelsError }}
        </p>
      </div>
    </TDrawer>

    <!-- Default Model Drawer -->
    <TDrawer v-model:visible="showDefaultModelDrawer" :title="t('intelligence.config.model.defaultModel')">
      <p class="drawer-description">
        {{ t('intelligence.config.model.defaultModelPlaceholder') }}
      </p>
      <TuffBlockSelect
        v-model="localDefaultModel"
        :title="t('intelligence.config.model.defaultModel')"
        :description="defaultModelError || t('intelligence.config.model.defaultModelPlaceholder')"
        default-icon="i-carbon-checkmark"
        active-icon="i-carbon-checkmark"
        :disabled="disabled || localModels.length === 0"
        @update:model-value="handleDefaultModelChange"
      >
        <TSelectItem v-for="model in localModels" :key="model" :model-value="model">
          {{ model }}
        </TSelectItem>
      </TuffBlockSelect>
    </TDrawer>

    <!-- Instructions Drawer -->
    <TDrawer v-model:visible="showInstructionsDrawer" :title="t('intelligence.config.model.instructions')">
      <p class="drawer-description">
        {{ t('intelligence.config.model.instructionsHint') }}
      </p>
      <IntelligencePromptSelector
        v-model="localInstructions"
        @update:model-value="handleInstructionsChange"
      />
    </TDrawer>
  </div>
</template>

<script lang="ts" name="IntelligenceModelConfig" setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElTransfer } from 'element-plus'
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

const allModels = ref<string[]>([])

function normalizeModel(value?: string): string {
  return (value ?? '').trim()
}

function normalizeModelList(list: string[] = []): string[] {
  const seen = new Set<string>()
  return list
    .map(normalizeModel)
    .filter(Boolean)
    .filter((model) => {
      if (seen.has(model)) return false
      seen.add(model)
      return true
    })
}

function addToAllModels(values: string | string[]): void {
  const items = Array.isArray(values) ? values : [values]
  const normalized = normalizeModelList(items)

  if (!normalized.length) return

  const merged = new Set(allModels.value)
  normalized.forEach((model) => {
    merged.add(model)
  })
  allModels.value = Array.from(merged)
}

function ensureDefaultModelWithin(models: string[]): void {
  if (!models.length) {
    if (localDefaultModel.value) {
      localDefaultModel.value = ''
    }
    return
  }

  if (!localDefaultModel.value) {
    localDefaultModel.value = models[0]
    return
  }

  if (!models.includes(localDefaultModel.value)) {
    localDefaultModel.value = models[0]
  }
}

function applyModelUpdates(nextModels: string[]): void {
  const normalized = normalizeModelList(nextModels)
  addToAllModels(normalized)
  localModels.value = normalized
  ensureDefaultModelWithin(normalized)
  validateModels()
  validateDefaultModel()
}

const transferData = computed(() => {
  const pool = new Set<string>()
  allModels.value.forEach((model) => {
    const normalized = normalizeModel(model)
    if (normalized) pool.add(normalized)
  })
  localModels.value.forEach((model) => {
    const normalized = normalizeModel(model)
    if (normalized) pool.add(normalized)
  })

  return Array.from(pool)
    .sort((a, b) => a.localeCompare(b))
    .map((model) => ({
      key: model,
      label: model
    }))
})

const transferSelectedModels = computed<string[]>({
  get: () => localModels.value,
  set: (value) => {
    applyModelUpdates(value ?? [])
  }
})

const newModelInput = ref('')
const modelsError = ref('')
const defaultModelError = ref('')
const showModelsDrawer = ref(false)
const showDefaultModelDrawer = ref(false)
const showInstructionsDrawer = ref(false)
const isFetching = ref(false)

const defaultModelSummary = computed(() => {
  if (!localDefaultModel.value) {
    return t('intelligence.config.model.defaultModelPlaceholder')
  }

  return localDefaultModel.value
})

const instructionsSummary = computed(() => {
  const content = (localInstructions.value || '').trim()

  if (!content) {
    return t('intelligence.config.model.instructionsEmpty')
  }

  const singleLine = content.replace(/\s+/g, ' ')
  return singleLine.length > 60 ? `${singleLine.slice(0, 57)}...` : singleLine
})

function openDefaultModelDrawer() {
  if (props.disabled || localModels.value.length === 0) return
  showDefaultModelDrawer.value = true
}

function openInstructionsDrawer() {
  if (props.disabled) return
  showInstructionsDrawer.value = true
}

// 检查是否可以获取模型（需要 API Key 且不是本地模型）
const canFetchModels = computed(() => {
  const hasApiKey = !!props.modelValue.apiKey?.trim()
  const isNotLocal = props.modelValue.type !== 'local'
  return hasApiKey && isNotLocal
})

function validateModels(): boolean {
  modelsError.value = ''

  if (props.modelValue.enabled && localModels.value.length === 0) {
    modelsError.value = t('intelligence.config.model.modelsRequired')
    return false
  }

  return true
}

function validateDefaultModel(): boolean {
  defaultModelError.value = ''

  if (props.modelValue.enabled && !localDefaultModel.value) {
    defaultModelError.value = t('intelligence.config.model.defaultModelRequired')
    return false
  }

  if (localDefaultModel.value && !localModels.value.includes(localDefaultModel.value)) {
    defaultModelError.value = t('intelligence.config.model.defaultModelInvalid')
    return false
  }

  return true
}

function handleAddModel() {
  const modelName = normalizeModel(newModelInput.value)

  if (!modelName) return

  if (localModels.value.includes(modelName)) {
    modelsError.value = t('intelligence.config.model.modelExists')
    return
  }

  applyModelUpdates([...localModels.value, modelName])
  newModelInput.value = ''
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
      // 合并现有模型和新获取的模型并应用
      applyModelUpdates([...localModels.value, ...result.models])

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

watch(
  () => props.modelValue.id,
  () => {
    allModels.value = []
    addToAllModels(localModels.value)
  },
  { immediate: true }
)

watch(
  () => localModels.value,
  (models) => {
    addToAllModels(models)
  }
)
</script>

<style lang="scss" scoped>
.aisdk-model-config {
  .models-summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawer-description {
    margin-bottom: 12px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.models-drawer-content {
  padding: 0 4px;

  .model-transfer-section {
    margin-bottom: 16px;

    :deep(.el-transfer) {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--el-border-color-lighter);
      background: var(--el-fill-color-blank);
      min-height: 260px;
    }

    :deep(.el-transfer__buttons) {
      margin: 0 8px;
    }

    :deep(.el-transfer__panel) {
      min-height: 220px;
    }
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
