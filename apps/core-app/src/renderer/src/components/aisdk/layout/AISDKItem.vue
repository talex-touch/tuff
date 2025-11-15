<template>
  <div
    class="aisdk-item my-4 group relative flex items-center h-20 p-2 cursor-pointer rounded-xl border-2 border-transparent overflow-hidden transition-all duration-250 ease-in-out fake-background"
    :class="{ 
      selected: isSelected,
      enabled: provider.enabled,
      'has-error': hasConfigError
    }"
    @click="handleClick"
  >
    <!-- Error Badge -->
    <i
      v-if="hasConfigError"
      class="i-ri-error-warning-line issue-badge absolute top-1.5 right-1.5 text-red-500/80 text-xl z-10 cursor-help"
      :title="t('aisdk.item.configError')"
    />

    <!-- Provider Icon -->
    <div class="provider-icon flex-shrink-0">
      {{ getProviderIcon(provider.type) }}
    </div>

    <!-- Provider Info -->
    <div class="main-content flex-1 ml-4 flex flex-col justify-center overflow-hidden">
      <p class="font-semibold text-base truncate">{{ provider.name }}</p>
      <p class="text-xs text-gray-400 mt-1 truncate">
        {{ provider.type }}
      </p>
    </div>

    <!-- Status Indicator & Toggle -->
    <div class="ml-auto flex items-center gap-2">
      <div 
        class="status-dot w-2 h-2 rounded-full"
        :class="provider.enabled ? 'bg-green-500' : 'bg-gray-400'"
      />
      <el-switch
        v-model="localEnabled"
        size="small"
        @click.stop
        @change="handleToggle"
      />
    </div>
  </div>
</template>

<script lang="ts" name="AISDKItem" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElSwitch } from 'element-plus'

enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
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

const emits = defineEmits<{
  toggle: [provider: AiProviderConfig]
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

function getProviderIcon(type: string): string {
  const icons: Record<string, string> = {
    [AiProviderType.OPENAI]: '🤖',
    [AiProviderType.ANTHROPIC]: '🧠',
    [AiProviderType.DEEPSEEK]: '🔍',
    [AiProviderType.LOCAL]: '💻',
    [AiProviderType.CUSTOM]: '⚙️'
  }
  return icons[type] || '🤖'
}

function handleClick() {
  // Click event is handled by parent
}

function handleToggle() {
  const updatedProvider = {
    ...props.provider,
    enabled: localEnabled.value
  }
  emits('toggle', updatedProvider)
}
</script>

<style lang="scss" scoped>
.aisdk-item {
  &:hover {
    border-color: var(--el-border-color);
    --fake-inner-opacity: 0.25;
  }

  &.selected {
    border-color: var(--el-color-primary-light-3);
    --fake-opacity: 0.5;
    --fake-inner-opacity: 0.5;
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
    }
  }
}

.provider-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 48px;
  height: 48px;
  font-size: 32px;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-sizing: border-box;
  z-index: 1;
}

.main-content {
  z-index: 1;
}

.status-dot {
  transition: background-color 0.3s ease;
}
</style>
