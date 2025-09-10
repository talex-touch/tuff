<template>
  <div class="relative p-4 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 h-full flex flex-col">
    <div class="flex justify-between items-center mb-2">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold text-md text-blue-500 dark:text-blue-400">
          {{ result?.provider || providerId }}
        </h3>
        <span v-if="result?.sourceLanguage && result.sourceLanguage !== 'auto'" class="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
          {{ result.sourceLanguage }} → {{ result.targetLanguage }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="error"
          class="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-red-500"
          @click="$emit('retry', providerId)"
          title="重试翻译"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </button>
        <button
          v-if="result?.text"
          class="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          @click="copyResult"
          title="复制翻译结果"
        >
          <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- 翻译结果 -->
    <div v-if="result?.text" class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap flex-grow">
      {{ result.text }}
    </div>
    
    <!-- 加载状态 -->
    <div v-else-if="isLoading" class="flex items-center justify-center flex-grow text-gray-500">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      <span class="ml-2">翻译中...</span>
    </div>
    
    <!-- 错误状态 -->
    <div v-else-if="error" class="flex flex-col items-center justify-center flex-grow text-red-500">
      <svg class="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span class="text-sm text-center">{{ error.message }}</span>
    </div>
    
    <!-- 等待状态 -->
    <div v-else class="flex items-center justify-center flex-grow text-gray-400">
      等待翻译...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TranslationResult } from '../types/translation'

interface Props {
  providerId: string
  result?: TranslationResult
  error?: Error
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  result: undefined,
  error: undefined,
  isLoading: false
})

const emit = defineEmits<{
  retry: [providerId: string]
}>()

async function copyResult() {
  if (props.result?.text) {
    try {
      await navigator.clipboard.writeText(props.result.text)
      // TODO: 可以添加一个成功提示
      console.log('翻译结果已复制到剪贴板')
    } catch (err) {
      console.error('复制失败:', err)
    }
  }
}
</script>