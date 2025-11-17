<template>
  <div class="aisdk-ratelimit-config">
    <!-- Requests Per Minute -->
    <TuffBlockInput
      v-model="localRequestsPerMinute"
      :title="t('intelligence.config.rateLimit.requestsPerMinute')"
      :description="requestsPerMinuteError || t('intelligence.config.rateLimit.requestsPerMinuteHint')"
      :placeholder="t('intelligence.config.rateLimit.unlimitedPlaceholder')"
      default-icon="i-carbon-request-quote"
      active-icon="i-carbon-request-quote"
      :disabled="disabled"
      clearable
      @blur="handleRequestsPerMinuteBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <div class="flex items-center gap-2">
          <input
            :value="modelValue || ''"
            type="number"
            min="0"
            :placeholder="t('intelligence.config.rateLimit.unlimitedPlaceholder')"
            :disabled="disabled"
            class="tuff-input flex-1"
            @input="update(($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            @focus="focus"
            @blur="blur(); handleRequestsPerMinuteBlur()"
          />
          <span class="text-sm text-[var(--el-text-color-secondary)]">
            {{ t('intelligence.config.rateLimit.requestsUnit') }}
          </span>
        </div>
      </template>
    </TuffBlockInput>

    <!-- Tokens Per Minute -->
    <TuffBlockInput
      v-model="localTokensPerMinute"
      :title="t('intelligence.config.rateLimit.tokensPerMinute')"
      :description="tokensPerMinuteError || t('intelligence.config.rateLimit.tokensPerMinuteHint')"
      :placeholder="t('intelligence.config.rateLimit.unlimitedPlaceholder')"
      default-icon="i-carbon-data-1"
      active-icon="i-carbon-data-1"
      :disabled="disabled"
      clearable
      @blur="handleTokensPerMinuteBlur"
    >
      <template #control="{ modelValue, update, focus, blur }">
        <div class="flex items-center gap-2">
          <input
            :value="modelValue || ''"
            type="number"
            min="0"
            :placeholder="t('intelligence.config.rateLimit.unlimitedPlaceholder')"
            :disabled="disabled"
            class="tuff-input flex-1"
            @input="update(($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            @focus="focus"
            @blur="blur(); handleTokensPerMinuteBlur()"
          />
          <span class="text-sm text-[var(--el-text-color-secondary)]">
            {{ t('intelligence.config.rateLimit.tokensUnit') }}
          </span>
        </div>
      </template>
    </TuffBlockInput>

    <!-- Info Message -->
    <TuffBlockSlot
      :title="t('intelligence.config.rateLimit.infoMessage')"
      description=""
      default-icon="i-carbon-information"
      active-icon="i-carbon-information"
      :active="true"
    />
  </div>
</template>

<script lang="ts" name="IntelligenceRateLimitConfig" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

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

const localRequestsPerMinute = ref<number | undefined>(
  props.modelValue.rateLimit?.requestsPerMinute
)
const localTokensPerMinute = ref<number | undefined>(
  props.modelValue.rateLimit?.tokensPerMinute
)
const requestsPerMinuteError = ref('')
const tokensPerMinuteError = ref('')

// Watch for external changes
watch(
  () => props.modelValue.rateLimit?.requestsPerMinute,
  (newValue) => {
    localRequestsPerMinute.value = newValue
  }
)

watch(
  () => props.modelValue.rateLimit?.tokensPerMinute,
  (newValue) => {
    localTokensPerMinute.value = newValue
  }
)

function validateRequestsPerMinute(value: number | undefined): boolean {
  requestsPerMinuteError.value = ''
  
  if (value !== undefined && (isNaN(value) || value < 0)) {
    requestsPerMinuteError.value = t('intelligence.config.rateLimit.invalidValue')
    return false
  }
  
  return true
}

function validateTokensPerMinute(value: number | undefined): boolean {
  tokensPerMinuteError.value = ''
  
  if (value !== undefined && (isNaN(value) || value < 0)) {
    tokensPerMinuteError.value = t('intelligence.config.rateLimit.invalidValue')
    return false
  }
  
  return true
}

function handleRequestsPerMinuteBlur() {
  if (validateRequestsPerMinute(localRequestsPerMinute.value)) {
    emitUpdate()
  } else {
    // Reset to previous valid value
    localRequestsPerMinute.value = props.modelValue.rateLimit?.requestsPerMinute
  }
}

function handleRequestsPerMinuteClear() {
  localRequestsPerMinute.value = undefined
  emitUpdate()
}

function handleTokensPerMinuteBlur() {
  if (validateTokensPerMinute(localTokensPerMinute.value)) {
    emitUpdate()
  } else {
    // Reset to previous valid value
    localTokensPerMinute.value = props.modelValue.rateLimit?.tokensPerMinute
  }
}

function handleTokensPerMinuteClear() {
  localTokensPerMinute.value = undefined
  emitUpdate()
}

function emitUpdate() {
  const updated = {
    ...props.modelValue,
    rateLimit: {
      ...props.modelValue.rateLimit,
      requestsPerMinute: localRequestsPerMinute.value,
      tokensPerMinute: localTokensPerMinute.value
    }
  }
  emits('update:modelValue', updated)
  emits('change')
}
</script>

<style lang="scss" scoped>
.aisdk-ratelimit-config {
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.3s ease;
  }

  .form-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    transition: color 0.3s ease;
    
    .form-group:focus-within & {
      color: var(--el-color-primary);
    }
  }

  .form-error {
    font-size: 12px;
    color: var(--el-color-error);
    margin: 0;
    animation: slideInLeft 0.3s ease;
  }

  .form-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin: 0;
    transition: color 0.3s ease;
    
    .form-group:hover & {
      color: var(--el-text-color-regular);
    }
  }

  .info-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    background-color: var(--el-color-info-light-9);
    border: 1px solid var(--el-color-info-light-7);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeInUp 0.4s ease;

    i {
      font-size: 16px;
      margin-top: 2px;
      flex-shrink: 0;
      transition: transform 0.3s ease;
    }

    p {
      margin: 0;
      line-height: 1.5;
    }
    
    &:hover {
      background-color: var(--el-color-info-light-8);
      border-color: var(--el-color-info-light-6);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      
      i {
        transform: scale(1.1) rotate(5deg);
      }
    }
  }
  
  :deep(.el-input) {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    
    &:hover {
      transform: translateY(-1px);
    }
    
    &.is-focus {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
