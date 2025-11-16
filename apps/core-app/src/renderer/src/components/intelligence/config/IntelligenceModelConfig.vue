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

    <!-- Instructions Textarea -->
    <TuffBlockInput
      v-model="localInstructions"
      :title="t('aisdk.config.model.instructions')"
      :description="t('aisdk.config.model.instructionsHint')"
      default-icon="i-carbon-document"
      active-icon="i-carbon-document"
      :disabled="disabled"
      :placeholder="t('aisdk.config.model.instructionsPlaceholder')"
      @blur="handleInstructionsBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <textarea
          :value="modelValue"
          :placeholder="t('aisdk.config.model.instructionsPlaceholder')"
          :disabled="disabled"
          class="instructions-textarea"
          rows="4"
          @input="update(($event.target as HTMLTextAreaElement).value)"
          @focus="focus"
          @blur="blur(); handleInstructionsBlur()"
        />
      </template>
    </TuffBlockInput>

    <!-- Models Drawer -->
    <el-drawer
      v-model="showModelsDrawer"
      :title="t('aisdk.config.model.manageModels')"
      direction="rtl"
      size="500px"
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

        <!-- Add Model Input -->
        <div class="add-model-section">
          <input
            v-model="newModelInput"
            type="text"
            :placeholder="t('aisdk.config.model.addModelPlaceholder')"
            class="add-model-input"
            @keyup.enter="handleAddModel"
          />
          <button
            class="add-model-button"
            :disabled="!newModelInput.trim()"
            @click="handleAddModel"
          >
            <i class="i-carbon-add" />
            {{ t('aisdk.config.model.addModel') }}
          </button>
        </div>

        <p v-if="modelsError" class="error-message">
          {{ modelsError }}
        </p>
      </div>
    </el-drawer>
  </div>
</template>

<script lang="ts" name="IntelligenceModelConfig" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElDrawer } from 'element-plus'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'

interface AiProviderConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  rateLimit?: {
    requestsPerMinute?: number
    tokensPerMinute?: number
  }
  priority?: number
}

const props = defineProps<{
  modelValue: AiProviderConfig
  disabled?: boolean
}>()

const emits = defineEmits<{
  'update:modelValue': [value: AiProviderConfig]
  change: []
}>()

const { t } = useI18n()

const localModels = ref<string[]>([...(props.modelValue.models || [])])
const localDefaultModel = ref(props.modelValue.defaultModel || '')
const localInstructions = ref(props.modelValue.instructions || '')
const newModelInput = ref('')
const modelsError = ref('')
const defaultModelError = ref('')
const showModelsDrawer = ref(false)

// Watch for external changes
watch(
  () => props.modelValue.models,
  (newValue) => {
    localModels.value = [...(newValue || [])]
  }
)

watch(
  () => props.modelValue.defaultModel,
  (newValue) => {
    localDefaultModel.value = newValue || ''
  }
)

watch(
  () => props.modelValue.instructions,
  (newValue) => {
    localInstructions.value = newValue || ''
  }
)

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
  
  localModels.value.push(modelName)
  newModelInput.value = ''
  modelsError.value = ''
  
  // If this is the first model, set it as default
  if (localModels.value.length === 1) {
    localDefaultModel.value = modelName
  }
  
  emitUpdate()
}

function handleRemoveModel(model: string) {
  const index = localModels.value.indexOf(model)
  if (index > -1) {
    localModels.value.splice(index, 1)
  }
  
  // If removed model was the default, clear default or set to first available
  if (localDefaultModel.value === model) {
    localDefaultModel.value = localModels.value.length > 0 ? localModels.value[0] : ''
  }
  
  validateModels()
  emitUpdate()
}

function handleDefaultModelChange() {
  if (validateDefaultModel()) {
    emitUpdate()
  }
}

function handleInstructionsBlur() {
  emitUpdate()
}

function emitUpdate() {
  const updated = {
    ...props.modelValue,
    models: [...localModels.value],
    defaultModel: localDefaultModel.value || undefined,
    instructions: localInstructions.value.trim() || undefined
  }
  emits('update:modelValue', updated)
  emits('change')
}
</script>

<style lang="scss" scoped>
.aisdk-model-config {
  .models-summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .instructions-textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    resize: vertical;
    
    &:focus {
      border-color: var(--el-color-primary);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    &::placeholder {
      color: var(--el-text-color-placeholder);
    }
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

    &:hover:not(:disabled) {
      background: var(--el-color-primary-light-3);
    }

    &:disabled {
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
}
</style>
