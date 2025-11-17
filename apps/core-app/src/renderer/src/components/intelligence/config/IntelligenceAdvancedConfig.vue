<template>
  <div class="aisdk-advanced-config">
    <!-- Priority Selector -->
    <TuffBlockSelect
      v-model="localPriority"
      :title="t('intelligence.config.advanced.priority')"
      :description="t('intelligence.config.advanced.priorityHint')"
      default-icon="i-carbon-task-star"
      active-icon="i-carbon-task-star"
      :disabled="disabled"
      @update:model-value="handlePriorityChange"
    >
      <TSelectItem :model-value="1">
        <div class="flex items-center gap-2">
          <i class="i-carbon-arrow-up text-red-500" />
          <span>{{ t('intelligence.priority.high') }}</span>
        </div>
      </TSelectItem>
      <TSelectItem :model-value="2">
        <div class="flex items-center gap-2">
          <i class="i-carbon-subtract text-yellow-500" />
          <span>{{ t('intelligence.priority.medium') }}</span>
        </div>
      </TSelectItem>
      <TSelectItem :model-value="3">
        <div class="flex items-center gap-2">
          <i class="i-carbon-arrow-down text-green-500" />
          <span>{{ t('intelligence.priority.low') }}</span>
        </div>
      </TSelectItem>
    </TuffBlockSelect>

    <!-- Timeout Input -->
    <TuffBlockInput
      v-model="localTimeout"
      :title="t('intelligence.config.advanced.timeout')"
      :description="timeoutError || t('intelligence.config.advanced.timeoutHint')"
      :placeholder="t('intelligence.config.advanced.timeoutPlaceholder')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="disabled"
      @blur="handleTimeoutBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <div class="flex items-center gap-2">
          <input
            :value="modelValue"
            type="number"
            min="1000"
            max="300000"
            :placeholder="t('intelligence.config.advanced.timeoutPlaceholder')"
            :disabled="disabled"
            class="tuff-input flex-1"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="blur(); handleTimeoutBlur()"
          />
          <span class="text-sm text-[var(--el-text-color-secondary)]">
            {{ t('intelligence.config.advanced.timeoutUnit') }}
          </span>
        </div>
      </template>
    </TuffBlockInput>
  </div>
</template>

<script lang="ts" name="IntelligenceAdvancedConfig" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

const localPriority = ref(props.modelValue.priority || 2)
const localTimeout = ref(props.modelValue.timeout || 30000)
const timeoutError = ref('')

// Watch for external changes
watch(
  () => props.modelValue.priority,
  (newValue) => {
    localPriority.value = newValue || 2
  }
)

watch(
  () => props.modelValue.timeout,
  (newValue) => {
    localTimeout.value = newValue || 30000
  }
)

function validateTimeout(value: number): boolean {
  timeoutError.value = ''
  
  if (isNaN(value) || value < 1000 || value > 300000) {
    timeoutError.value = t('intelligence.config.advanced.timeoutInvalid')
    return false
  }
  
  return true
}

function handlePriorityChange() {
  const updated = {
    ...props.modelValue,
    priority: localPriority.value
  }
  emits('update:modelValue', updated)
  emits('change')
}

function handleTimeoutBlur() {
  if (validateTimeout(localTimeout.value)) {
    const updated = {
      ...props.modelValue,
      timeout: localTimeout.value
    }
    emits('update:modelValue', updated)
    emits('change')
  } else {
    // Reset to previous valid value
    localTimeout.value = props.modelValue.timeout || 30000
  }
}
</script>

<style lang="scss" scoped>
.aisdk-advanced-config {
  .tuff-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
    transition: all 0.2s;

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
</style>
