<template>
  <transition name="fade-slide">
    <div
      v-if="visible"
      class="aisdk-test-results mt-6 p-4 rounded-lg border transition-all duration-300"
      :class="resultClass"
    >
      <div class="flex items-start gap-3">
        <!-- Icon -->
        <div class="flex-shrink-0 mt-0.5">
          <i
            class="text-2xl"
            :class="result.success ? 'i-carbon-checkmark-filled text-green-500' : 'i-carbon-error-filled text-red-500'"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <h4 class="font-semibold text-base mb-1" :class="titleClass">
            {{ result.success ? t('aisdk.test.success.title') : t('aisdk.test.error.title') }}
          </h4>
          
          <p class="text-sm opacity-90 mb-2" :class="messageClass">
            {{ result.message || defaultMessage }}
          </p>

          <!-- Latency Display -->
          <div v-if="result.success && result.latency !== undefined" class="flex items-center gap-2 text-xs opacity-75">
            <i class="i-carbon-time text-base" />
            <span>{{ t('aisdk.test.latency') }}: {{ result.latency }}ms</span>
          </div>
        </div>

        <!-- Close Button -->
        <FlatButton
          class="test-results-dismiss flex-shrink-0"
          mini
          :aria-label="t('common.close')"
          @click="handleDismiss"
        >
          <i class="i-carbon-close text-lg opacity-60 hover:opacity-100" />
        </FlatButton>
      </div>
    </div>
  </transition>
</template>

<script lang="ts" name="IntelligenceTestResults" setup>
/**
 * AISDKTestResults Component
 * 
 * Displays the results of an AI provider connection test with success/error states.
 * Features:
 * - Success state with green styling and latency display
 * - Error state with red styling and error message
 * - Auto-dismiss functionality (configurable)
 * - Smooth fade-slide animations
 * - Manual dismiss button
 * - Dark mode support
 * 
 * @example
 * ```vue
 * <AISDKTestResults
 *   :result="testResult"
 *   :auto-dismiss="true"
 *   :dismiss-timeout="5000"
 *   @dismiss="handleDismiss"
 * />
 * ```
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import type { TestResult } from '@talex-touch/utils/types/intelligence'

const props = withDefaults(
  defineProps<{
    result: TestResult
    autoDismiss?: boolean
    dismissTimeout?: number
  }>(),
  {
    autoDismiss: true,
    dismissTimeout: 5000
  }
)

const emits = defineEmits<{
  dismiss: []
}>()

const { t } = useI18n()
const visible = ref(false)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

// Computed classes based on success/error state
const resultClass = computed(() => {
  return props.result.success
    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
})

const titleClass = computed(() => {
  return props.result.success
    ? 'text-green-900 dark:text-green-100'
    : 'text-red-900 dark:text-red-100'
})

const messageClass = computed(() => {
  return props.result.success
    ? 'text-green-800 dark:text-green-200'
    : 'text-red-800 dark:text-red-200'
})

const defaultMessage = computed(() => {
  return props.result.success
    ? t('aisdk.test.success.message')
    : t('aisdk.test.error.message')
})

// Show the component with animation
onMounted(() => {
  // Small delay to trigger transition
  setTimeout(() => {
    visible.value = true
  }, 10)

  // Set up auto-dismiss if enabled
  if (props.autoDismiss) {
    setupAutoDismiss()
  }
})

// Watch for result changes to reset auto-dismiss timer
watch(
  () => props.result,
  () => {
    if (props.autoDismiss) {
      clearAutoDismiss()
      setupAutoDismiss()
    }
  },
  { deep: true }
)

function setupAutoDismiss() {
  dismissTimer = setTimeout(() => {
    handleDismiss()
  }, props.dismissTimeout)
}

function clearAutoDismiss() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

function handleDismiss() {
  visible.value = false
  clearAutoDismiss()
  
  // Wait for transition to complete before emitting
  setTimeout(() => {
    emits('dismiss')
  }, 300)
}

// Cleanup on unmount
onMounted(() => {
  return () => {
    clearAutoDismiss()
  }
})
</script>

<style lang="scss" scoped>
.aisdk-test-results {
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.test-results-dismiss {
  min-width: 32px;
  min-height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 4px;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }

  :deep(> div) {
    padding: 0;
  }
}
</style>
