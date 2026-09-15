<script lang="ts" name="IntelligenceAdvancedConfig" setup>
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

const props = defineProps<{
  modelValue: IntelligenceProviderConfig
  disabled?: boolean
  priorityOnly?: boolean
}>()

const emits = defineEmits<{
  'update:modelValue': [value: IntelligenceProviderConfig]
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

function parseTimeoutValue(value: string | number): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : localTimeout.value
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

function handleTimeoutControlBlur(onBlur: () => void) {
  onBlur()
  handleTimeoutBlur()
}
</script>

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
      <TxSelectItem :value="1">
        <div class="flex items-center gap-2">
          <i class="i-carbon-arrow-up text-red-500" />
          <span>{{ t('intelligence.priority.high') }}</span>
        </div>
      </TxSelectItem>
      <TxSelectItem :value="2">
        <div class="flex items-center gap-2">
          <i class="i-carbon-subtract text-yellow-500" />
          <span>{{ t('intelligence.priority.medium') }}</span>
        </div>
      </TxSelectItem>
      <TxSelectItem :value="3">
        <div class="flex items-center gap-2">
          <i class="i-carbon-arrow-down text-green-500" />
          <span>{{ t('intelligence.priority.low') }}</span>
        </div>
      </TxSelectItem>
    </TuffBlockSelect>

    <!-- Timeout Input -->
    <TuffBlockInput
      v-if="!priorityOnly"
      v-model="localTimeout"
      :title="t('intelligence.config.advanced.timeout')"
      :description="timeoutError || t('intelligence.config.advanced.timeoutHint')"
      :placeholder="t('intelligence.config.advanced.timeoutPlaceholder')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="disabled"
      @blur="handleTimeoutBlur"
    >
      <template #control="{ modelValue: slotValue, update, focus, blur }">
        <div class="timeout-control">
          <TxInput
            :model-value="slotValue"
            type="number"
            min="1000"
            max="300000"
            inputmode="numeric"
            :placeholder="t('intelligence.config.advanced.timeoutPlaceholder')"
            :disabled="disabled"
            class="timeout-input flex-1"
            @update:model-value="update(parseTimeoutValue($event))"
            @focus="focus"
            @blur="handleTimeoutControlBlur(blur)"
          />
          <span class="timeout-unit">
            {{ t('intelligence.config.advanced.timeoutUnit') }}
          </span>
        </div>
      </template>
    </TuffBlockInput>
  </div>
</template>

<style lang="scss" scoped>
.aisdk-advanced-config {
  .timeout-control {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 234px;
    max-width: 100%;
  }

  .timeout-unit {
    font-size: 12px;
    color: var(--tx-text-color-secondary);
    white-space: nowrap;
    flex-shrink: 0;
  }
}
</style>
