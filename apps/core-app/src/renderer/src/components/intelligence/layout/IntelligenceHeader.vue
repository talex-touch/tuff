<template>
  <header
    class="aisdk-header flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    role="banner"
  >
    <div class="flex items-center gap-3">
      <!-- Provider Icon -->
      <div class="provider-icon-large" aria-hidden="true">
        {{ getProviderIcon(provider.type) }}
      </div>

      <!-- Provider Info -->
      <div class="min-w-0 flex-1">
        <h1 id="provider-name" class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ provider.name }}
        </h1>
        <p id="provider-type" class="text-sm text-gray-600 dark:text-gray-400">
          {{ provider.type }}
        </p>
        <div class="flex gap-2 mt-1" role="group" aria-label="Provider status">
          <span
            class="badge"
            :class="provider.enabled ? 'badge-success' : 'badge-gray'"
            role="status"
            :aria-label="`Status: ${provider.enabled ? t('aisdk.status.enabled') : t('aisdk.status.disabled')}`"
          >
            <i
              :class="provider.enabled ? 'i-carbon-checkmark' : 'i-carbon-close'"
              aria-hidden="true"
            />
            {{ provider.enabled ? t('aisdk.status.enabled') : t('aisdk.status.disabled') }}
          </span>
          <span
            v-if="provider.priority"
            class="badge badge-info"
            role="status"
            :aria-label="`${t('aisdk.priority.label')}: ${getPriorityLabel(provider.priority)}`"
          >
            {{ t('aisdk.priority.label') }}: {{ getPriorityLabel(provider.priority) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-3" role="group" aria-label="Provider actions">
      <button
        v-if="provider.enabled && provider.apiKey"
        type="button"
        class="test-button"
        :class="{ testing: isTesting }"
        :disabled="isTesting"
        :aria-label="isTesting ? t('aisdk.test.testing') : t('aisdk.test.button')"
        :aria-busy="isTesting"
        @click="handleTest"
      >
        <i v-if="isTesting" class="i-carbon-renew animate-spin" aria-hidden="true" />
        <i v-else class="i-carbon-play-filled" aria-hidden="true" />
        <span>{{ isTesting ? t('aisdk.test.testing') : t('aisdk.test.button') }}</span>
      </button>

      <TSwitch
        v-model="localEnabled"
        :aria-label="`Toggle ${provider.name}`"
        @change="handleToggle"
      />
    </div>
  </header>
</template>

<script lang="ts" name="IntelligenceHeader" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TSwitch from '@comp/base/switch/TSwitch.vue'

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
  isTesting?: boolean
}>()

const emits = defineEmits<{
  toggle: []
  test: []
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

function getProviderIcon(type: string): string {
  const icons: Record<string, string> = {
    [AiProviderType.OPENAI]: '🤖',
    [AiProviderType.ANTHROPIC]: '🧠',
    [AiProviderType.DEEPSEEK]: '🔍',
    [AiProviderType.SILICONFLOW]: '⚡️',
    [AiProviderType.LOCAL]: '💻',
    [AiProviderType.CUSTOM]: '⚙️'
  }
  return icons[type] || '🤖'
}

function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: t('aisdk.priority.high'),
    2: t('aisdk.priority.medium'),
    3: t('aisdk.priority.low')
  }
  return labels[priority] || String(priority)
}

function handleToggle() {
  emits('toggle')
}

function handleTest() {
  emits('test')
}
</script>

<style lang="scss" scoped>
.aisdk-header {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);
}

.provider-icon-large {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 56px;
  height: 56px;
  font-size: 40px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--el-fill-color-light) 0%, var(--el-fill-color) 100%);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: scale(1.05) rotate(5deg);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  i {
    font-size: 14px;
    transition: transform 0.3s ease;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);

    i {
      transform: scale(1.1);
    }
  }

  &.badge-success {
    background-color: var(--el-color-success-light-9);
    color: var(--el-color-success);
    border: 1px solid var(--el-color-success-light-7);

    &:hover {
      background-color: var(--el-color-success-light-8);
      border-color: var(--el-color-success-light-6);
    }
  }

  &.badge-gray {
    background-color: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    border: 1px solid var(--el-border-color-lighter);

    &:hover {
      background-color: var(--el-fill-color);
      border-color: var(--el-border-color);
    }
  }

  &.badge-info {
    background-color: var(--el-color-info-light-9);
    color: var(--el-color-info);
    border: 1px solid var(--el-color-info-light-7);

    &:hover {
      background-color: var(--el-color-info-light-8);
      border-color: var(--el-color-info-light-6);
    }
  }
}

.test-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background-color: var(--el-color-primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;

  i {
    font-size: 16px;
    transition: transform 0.3s ease;
  }

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    transform: translate(-50%, -50%);
    transition:
      width 0.6s,
      height 0.6s;
  }

  &:hover:not(:disabled) {
    background-color: var(--el-color-primary-light-3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);

    i {
      transform: scale(1.1);
    }

    &::before {
      width: 300px;
      height: 300px;
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:focus-visible {
    outline: 3px solid var(--el-color-primary-light-7);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    background-color: var(--el-color-primary-light-5);
  }

  &.testing {
    background-color: var(--el-color-primary-light-3);

    i {
      animation: spin 1s linear infinite;
    }
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
