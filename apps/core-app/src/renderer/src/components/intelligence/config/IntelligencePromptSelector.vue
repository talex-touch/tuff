<script lang="ts" name="IntelligencePromptSelector" setup>
import { TxButton } from '@talex-touch/tuffex'
import { ElInput, ElOption, ElOptionGroup, ElSelect, ElTag } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { getPromptManager } from '~/modules/hooks/usePromptManager'

const props = defineProps<{
  modelValue: string
}>()

const emits = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const router = useRouter()
const promptManager = getPromptManager()

const selectedPromptId = ref<string | null>(null)
const customInstructions = ref(props.modelValue || '')

// 分离内置和自定义提示词
const builtinPrompts = computed(() => promptManager.prompts.builtin)
const customPrompts = computed(() => promptManager.prompts.custom)

// 当前选中的提示词
const selectedPrompt = computed(() => {
  if (!selectedPromptId.value || selectedPromptId.value === '__create_new__') return null
  return promptManager.getPromptById(selectedPromptId.value) || null
})

// 监听外部值变化
watch(
  () => props.modelValue,
  (newValue) => {
    customInstructions.value = newValue || ''
    // 尝试匹配是否使用了预设提示词
    const matchedPrompt = promptManager.getAllPrompts().find((p) => p.content === newValue)
    selectedPromptId.value = matchedPrompt?.id || null
  },
  { immediate: true }
)

// 监听选中提示词变化
watch(selectedPrompt, (newPrompt) => {
  if (newPrompt) {
    customInstructions.value = newPrompt.content
    emits('update:modelValue', newPrompt.content)
  }
})

function handlePromptSelect(promptId: string) {
  if (promptId === '__create_new__') {
    handleManagePrompts()
    return
  }

  selectedPromptId.value = promptId
}

function handlePromptClear() {
  selectedPromptId.value = null
  customInstructions.value = ''
  emits('update:modelValue', '')
}

function handleCustomInstructionsChange(value: string) {
  customInstructions.value = value
  emits('update:modelValue', value)

  // 如果手动输入，清除选中的提示词
  if (selectedPromptId.value && selectedPrompt.value?.content !== value) {
    selectedPromptId.value = null
  }
}

function handleManagePrompts() {
  // 跳转到提示词管理页面
  router.push('/intelligence/prompts')
}
</script>

<template>
  <div class="prompt-selector">
    <div class="flex items-center justify-between mb-3">
      <label class="block text-sm font-medium text-[var(--el-text-color-primary)]">
        {{ t('intelligence.instructions') }}
      </label>
      <TxButton
        variant="flat"
        size="sm"
        type="text"
        class="manage-prompts-btn"
        :aria-label="t('intelligence.managePrompts')"
        @click="handleManagePrompts"
      >
        <i class="i-carbon-settings" aria-hidden="true" />
        <span>{{ t('intelligence.managePrompts') }}</span>
      </TxButton>
    </div>

    <!-- Quick Prompt Selection -->
    <div class="prompt-quick-select mb-3">
      <ElSelect
        :model-value="selectedPromptId"
        :placeholder="t('intelligence.selectPrompt')"
        clearable
        filterable
        class="w-full"
        @update:model-value="handlePromptSelect"
        @clear="handlePromptClear"
      >
        <!-- Built-in Prompts Group -->
        <ElOptionGroup v-if="builtinPrompts.length > 0" :label="t('intelligence.builtinPrompts')">
          <ElOption
            v-for="prompt in builtinPrompts"
            :key="prompt.id"
            :value="prompt.id"
            :label="prompt.name"
          >
            <div class="flex items-center justify-between w-full">
              <span>{{ prompt.name }}</span>
              <ElTag size="small" type="info">
                {{ t('intelligence.builtin') }}
              </ElTag>
            </div>
          </ElOption>
        </ElOptionGroup>

        <!-- Custom Prompts Group -->
        <ElOptionGroup v-if="customPrompts.length > 0" :label="t('intelligence.customPrompts')">
          <ElOption
            v-for="prompt in customPrompts"
            :key="prompt.id"
            :value="prompt.id"
            :label="prompt.name"
          >
            <div class="flex items-center justify-between w-full">
              <span>{{ prompt.name }}</span>
              <ElTag size="small" type="success">
                {{ t('intelligence.custom') }}
              </ElTag>
            </div>
          </ElOption>
        </ElOptionGroup>

        <!-- Add New Prompt Option -->
        <ElOption value="__create_new__" :label="t('intelligence.createNewPrompt')">
          <div class="flex items-center gap-2 text-[var(--el-color-primary)]">
            <i class="i-carbon-add" aria-hidden="true" />
            <span>{{ t('intelligence.createNewPrompt') }}</span>
          </div>
        </ElOption>
      </ElSelect>
    </div>

    <!-- Custom Text Input -->
    <div class="prompt-custom-input">
      <ElInput
        :model-value="customInstructions"
        type="textarea"
        :placeholder="t('intelligence.instructionsPlaceholder')"
        :rows="4"
        :disabled="!!selectedPromptId && selectedPromptId !== '__create_new__'"
        resize="vertical"
        @update:model-value="handleCustomInstructionsChange"
      />
      <div
        v-if="selectedPromptId && selectedPromptId !== '__create_new__'"
        class="mt-2 text-xs text-[var(--el-text-color-secondary)]"
      >
        {{ t('intelligence.promptSelectedHint') }}
      </div>
    </div>

    <!-- Prompt Preview -->
    <div
      v-if="selectedPrompt"
      class="prompt-preview mt-3 p-3 rounded-lg bg-[var(--el-fill-color-lighter)] border border-[var(--el-border-color-lighter)]"
    >
      <div class="flex items-center gap-2 mb-2">
        <i class="i-carbon-view text-[var(--el-color-primary)]" aria-hidden="true" />
        <span class="text-sm font-medium text-[var(--el-text-color-primary)]">
          {{ selectedPrompt.name }}
        </span>
        <ElTag size="small" :type="selectedPrompt.builtin ? 'info' : 'success'">
          {{ selectedPrompt.builtin ? t('intelligence.builtin') : t('intelligence.custom') }}
        </ElTag>
      </div>
      <div class="text-sm text-[var(--el-text-color-regular)] whitespace-pre-wrap">
        {{ selectedPrompt.content }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-selector {
  .manage-prompts-btn {
    font-size: 12px;
    padding: 4px 8px;
    height: auto;
    min-height: auto;

    i {
      font-size: 14px;
    }
  }

  :deep(.el-select) {
    .el-select__wrapper {
      border-radius: 8px;
    }
  }

  :deep(.el-textarea) {
    .el-textarea__inner {
      border-radius: 8px;
      font-family: var(--el-font-family);
      line-height: 1.5;
    }
  }

  .prompt-preview {
    max-height: 200px;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--el-border-color);
      border-radius: 3px;
    }
  }
}
</style>
