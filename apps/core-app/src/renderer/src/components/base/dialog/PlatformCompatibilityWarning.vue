<template>
  <div
    :class="{ close: isClosing }"
    class="PlatformCompatibilityWarning-Wrapper absolute left-0 top-0 w-full h-full flex justify-center items-center z-10000 bg-black/30"
    role="dialog"
    aria-modal="true"
    aria-labelledby="warning-title"
    aria-describedby="warning-message"
  >
    <div
      class="PlatformCompatibilityWarning-Container fake-background relative p-6 w-400px max-w-80% max-h-80% rounded-2xl box-border overflow-hidden"
      style="backdrop-filter: blur(10px) saturate(180%) brightness(1.5)"
    >
      <!-- 警告图标 -->
      <div class="flex justify-center mb-4">
        <div class="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>

      <!-- 标题 -->
      <h2 id="warning-title" class="text-1.5rem font-600 text-center mb-4 text-gray-800">
        平台兼容性提醒
      </h2>

      <!-- 消息内容 -->
      <div
        id="warning-message"
        class="PlatformCompatibilityWarning-Content relative mb-6 text-center text-gray-700 leading-1.5rem"
      >
        <p class="mb-3">{{ warningMessage }}</p>
        <p class="text-sm text-gray-500">
          如果您遇到任何问题，请通过 GitHub 反馈给我们。
        </p>
      </div>

      <!-- 按钮 -->
      <div class="flex justify-center gap-3">
        <button
          v-wave
          class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer select-none"
          @click="handleContinue"
        >
          我知道了，继续使用
        </button>
        <button
          v-wave
          class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors cursor-pointer select-none"
          @click="handleDontShowAgain"
        >
          不再提醒
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="PlatformCompatibilityWarning" setup>
import { ref } from 'vue'

/**
 * Props for the PlatformCompatibilityWarning component
 */
interface Props {
  /** Warning message to display */
  warningMessage: string
  /** Callback when user clicks continue */
  onContinue?: () => void
  /** Callback when user clicks don't show again */
  onDontShowAgain?: () => void
}

/**
 * Component props with default values
 */
const props = withDefaults(defineProps<Props>(), {
  warningMessage: '',
  onContinue: undefined,
  onDontShowAgain: undefined
})

/** Reactive reference to control dialog closing state */
const isClosing = ref(false)

/**
 * Handle continue button click
 */
function handleContinue() {
  isClosing.value = true
  setTimeout(() => {
    props.onContinue?.()
  }, 300)
}

/**
 * Handle don't show again button click
 */
function handleDontShowAgain() {
  isClosing.value = true
  setTimeout(() => {
    props.onDontShowAgain?.()
  }, 300)
}
</script>

<style lang="scss" scoped>
.PlatformCompatibilityWarning-Wrapper {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  
  &.close {
    opacity: 0;
    transform: scale(0.9);
  }
}

.PlatformCompatibilityWarning-Container {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.PlatformCompatibilityWarning-Content {
  max-height: 200px;
  overflow-y: auto;
}

// 按钮悬停效果
button {
  transition: all 0.2s ease-in-out;
  
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
  
  &:active {
    transform: translateY(0);
  }
}
</style>
