<template>
  <div
    class="aisdk-item my-2 group relative flex items-center h-20 p-2 cursor-pointer rounded-xl border-2 border-transparent overflow-hidden transition-all duration-250 ease-in-out fake-background"
    :class="{
      selected: isSelected,
      enabled: provider.enabled,
      'has-error': hasConfigError
    }"
    role="button"
    :tabindex="0"
    :aria-label="t('intelligence.item.selectProvider', { name: provider.name })"
    :aria-pressed="isSelected"
    :aria-describedby="hasConfigError ? `error-${provider.id}` : undefined"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <!-- Error Badge -->
    <div
      v-if="hasConfigError"
      :id="`error-${provider.id}`"
      class="issue-badge absolute top-1.5 right-1.5 z-10"
      role="status"
      :aria-label="t('intelligence.item.configError')"
    >
      <i
        class="i-ri-error-warning-line text-red-500/80 text-xl cursor-help"
        aria-hidden="true"
      />
    </div>

    <!-- Provider Icon -->
    <div class="provider-icon flex-shrink-0" aria-hidden="true">
      <i :class="getProviderIconClass(provider.type)" />
    </div>

    <!-- Provider Info -->
    <div class="main-content flex-1 ml-4 flex flex-col justify-center overflow-hidden">
      <p class="font-semibold text-base truncate">{{ provider.name }}</p>
      <p class="text-xs text-gray-400 mt-1 truncate">
        {{ provider.type }}
      </p>
    </div>

    <!-- Status Indicator -->
    <div class="ml-auto flex items-center gap-2">
      <div
        class="status-dot w-2 h-2 rounded-full"
        :class="localEnabled ? 'bg-green-500' : 'bg-gray-400'"
        role="status"
        :aria-label="localEnabled ? t('intelligence.status.enabled') : t('intelligence.status.disabled')"
      />
    </div>
  </div>
</template>

<script lang="ts" name="IntelligenceItem" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

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
  provider: AiProviderConfig
  isSelected: boolean
}>()

const { t } = useI18n()
const localEnabled = ref(props.provider.enabled)

// Watch for external changes to provider.enabled
watch(
  () => props.provider.enabled,
  (newValue) => {
    localEnabled.value = newValue
  }
)

// Check if provider has configuration errors
const hasConfigError = computed(() => {
  if (!props.provider.enabled) return false

  // Check for missing API key (except for local models)
  if (props.provider.type !== AiProviderType.LOCAL && !props.provider.apiKey) {
    return true
  }

  // Check for missing models
  if (!props.provider.models || props.provider.models.length === 0) {
    return true
  }

  // Check for missing default model
  if (!props.provider.defaultModel) {
    return true
  }

  return false
})

function getProviderIconClass(type: string): string {
  const iconClasses: Record<string, string> = {
    [AiProviderType.OPENAI]: 'i-simple-icons-openai text-green-600',
    [AiProviderType.ANTHROPIC]: 'i-simple-icons-anthropic text-orange-500',
    [AiProviderType.DEEPSEEK]: 'i-carbon-search-advanced text-blue-600',
    [AiProviderType.SILICONFLOW]: 'i-carbon-ibm-watson-machine-learning text-purple-600',
    [AiProviderType.LOCAL]: 'i-carbon-bare-metal-server text-gray-600',
    [AiProviderType.CUSTOM]: 'i-carbon-settings text-gray-500'
  }
  return iconClasses[type] || 'i-carbon-ibm-watson-machine-learning text-gray-400'
}

function handleClick() {
  // Click event is handled by parent
}
</script>

<style lang="scss" scoped>
.aisdk-item {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: var(--el-border-color);
    --fake-inner-opacity: 0.25;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  }

  &:focus-visible {
    outline: 3px solid var(--el-color-primary);
    outline-offset: 2px;
    border-color: var(--el-color-primary-light-5);
  }

  &.selected {
    border-color: var(--el-color-primary-light-3);
    --fake-opacity: 0.5;
    --fake-inner-opacity: 0.5;
    box-shadow: 0 2px 12px rgba(var(--el-color-primary-rgb), 0.15);

    &:hover {
      box-shadow: 0 4px 16px rgba(var(--el-color-primary-rgb), 0.2);
    }
  }

  &.has-error {
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border: 1px solid var(--el-color-error-light-5);
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.3;
      animation: pulse-error 2s ease-in-out infinite;
    }
  }
}

@keyframes pulse-error {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.5;
  }
}

.provider-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-sizing: border-box;
  z-index: 1;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

  i {
    font-size: 24px;
    transition: transform 0.3s ease;
  }

  .aisdk-item:hover & {
    background-color: var(--el-fill-color-light);
    transform: scale(1.05);

    i {
      transform: scale(1.1);
    }
  }

  .aisdk-item.selected & {
    background: linear-gradient(135deg, var(--el-fill-color-light) 0%, var(--el-fill-color) 100%);
  }
}

.main-content {
  z-index: 1;
  transition: all 0.3s ease;

  p {
    transition: color 0.3s ease;
  }

  .aisdk-item:hover & p:first-child {
    color: var(--el-color-primary);
  }
}

.status-dot {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 0 2px var(--el-fill-color-blank);

  &.bg-green-500 {
    animation: pulse-success 2s ease-in-out infinite;
  }
}

@keyframes pulse-success {
  0%, 100% {
    box-shadow: 0 0 0 2px var(--el-fill-color-blank), 0 0 0 4px rgba(34, 197, 94, 0.2);
  }
  50% {
    box-shadow: 0 0 0 2px var(--el-fill-color-blank), 0 0 0 6px rgba(34, 197, 94, 0.1);
  }
}

.issue-badge {
  transition: all 0.3s ease;
  animation: shake 0.5s ease-in-out;

  &:hover {
    transform: scale(1.2);
  }
}

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
}
</style>
