<script setup lang="ts">
import { computed, ref } from 'vue'
import TranslationCard from '../components/TranslationCard.vue'
import { useTranslation } from '../composables/useTranslation'
import { useTranslationProvider } from '../composables/useTranslationProvider'

const query = ref('')
const showSettings = ref(false)

// 使用新的 hooks
const {
  translate: performTranslation,
  currentResponse,
  history,
  isTranslating,
  hasResults,
  removeFromHistory,
  retryTranslation,
} = useTranslation()

const {
  providers,
  enabledProviders,
  toggleProvider,
} = useTranslationProvider()

// 计算属性
const translationResults = computed(() => {
  const results = new Map()
  const errors = new Map()

  currentResponse.value.results.forEach((result, providerId) => {
    results.set(providerId, result)
  })

  currentResponse.value.errors.forEach((error, providerId) => {
    errors.set(providerId, error)
  })

  return { results, errors }
})

// 方法
function toggleSettings() {
  showSettings.value = !showSettings.value
}

async function translate() {
  const textToTranslate = query.value.trim()
  if (!textToTranslate) {
    return
  }

  showSettings.value = false

  try {
    await performTranslation(textToTranslate, 'zh', 'auto')
  }
  catch (error) {
    console.error('翻译失败:', error)
  }
}

function useHistoryItem(text: string) {
  query.value = text
  translate()
}

function handleRetry(providerId: string) {
  retryTranslation([providerId])
}
</script>

<template>
  <div class="p-4 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex justify-center">
    <div class="w-full max-w-2xl flex flex-col gap-3">
      <h1 class="text-2xl font-bold text-center mb-2">
        多源翻译
      </h1>

      <!-- 输入区域 -->
      <div class="relative">
        <textarea
          v-model="query"
          rows="5"
          placeholder="输入要翻译的文本..."
          class="w-full p-3 pr-10 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          :disabled="isTranslating"
        />

        <!-- 设置按钮 -->
        <button
          class="absolute top-2 right-2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          @click="toggleSettings"
        >
          <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>

        <!-- 设置面板 -->
        <div v-if="showSettings" class="absolute top-12 right-0 z-10 w-48 p-3 bg-white dark:bg-gray-800 border rounded-md shadow-lg border-gray-300 dark:border-gray-600">
          <h3 class="text-md font-semibold mb-2">
            翻译源
          </h3>
          <div v-for="provider in providers" :key="provider.id" class="flex items-center gap-2 mb-1">
            <input
              :id="provider.id"
              :checked="provider.enabled"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              @change="toggleProvider(provider.id)"
            >
            <label :for="provider.id" class="text-sm">{{ provider.name }}</label>
            <span v-if="provider.type === 'ai'" class="text-xs bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 px-1 rounded">AI</span>
            <span v-else-if="provider.type === 'web'" class="text-xs bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-1 rounded">Web</span>
          </div>
        </div>
      </div>

      <!-- 翻译按钮 -->
      <button
        class="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="translate"
        :disabled="isTranslating || !query.trim()"
      >
        <span v-if="isTranslating" class="flex items-center justify-center">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          翻译中...
        </span>
        <span v-else>翻译</span>
      </button>

      <!-- 历史记录 -->
      <div v-if="history.length > 0" class="pt-2">
        <h3 class="text-md font-semibold mb-2">
          历史记录
        </h3>
        <div class="flex flex-wrap gap-2">
          <div v-for="item in history" :key="item.id" class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-sm">
            <span class="cursor-pointer hover:text-blue-500 truncate max-w-32" @click="useHistoryItem(item.text)" :title="item.text">
              {{ item.text }}
            </span>
            <button class="ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" @click="removeFromHistory(item.id)">
              &times;
            </button>
          </div>
        </div>
      </div>

      <!-- 翻译结果 -->
      <div class="pt-2">
        <div v-if="!hasResults && !isTranslating" class="text-center text-gray-500 mt-6">
          翻译结果将显示在这里
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TranslationCard
            v-for="provider in enabledProviders"
            :key="provider.id"
            :provider-id="provider.id"
            :result="translationResults.results.get(provider.id)"
            :error="translationResults.errors.get(provider.id)"
            :is-loading="isTranslating && !translationResults.results.has(provider.id) && !translationResults.errors.has(provider.id)"
            @retry="handleRetry"
          />
        </div>
      </div>
    </div>
  </div>
</template>
