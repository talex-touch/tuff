<script setup lang="ts">
import type { TranslationProvider } from '../types/translation'

import { onCoreBoxInputChange } from '@talex-touch/utils'
import ProviderConfigModal from '../components/ProviderConfigModal.vue'
import TranslationCard from '../components/TranslationCard.vue'
import { useTranslation } from '../composables/useTranslation'
import { useTranslationProvider } from '../composables/useTranslationProvider'

const query = ref('')
const showSettings = ref(false)

onMounted(() => {
  onCoreBoxInputChange(({ query: newQuery }) => {
    query.value = newQuery
  })
})

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
  updateProviderConfig,
} = useTranslationProvider()

// 配置模态框状态
const showConfigModal = ref(false)
const currentConfigProvider = ref<TranslationProvider | null>(null)

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

function enableAllProviders() {
  providers.value.forEach((provider) => {
    if (!provider.enabled) {
      toggleProvider(provider.id)
    }
  })
}

function disableAllProviders() {
  providers.value.forEach((provider) => {
    if (provider.enabled) {
      toggleProvider(provider.id)
    }
  })
}

// 配置模态框相关方法
function openConfigModal(provider: TranslationProvider) {
  currentConfigProvider.value = provider
  showConfigModal.value = true
}

function closeConfigModal() {
  showConfigModal.value = false
  currentConfigProvider.value = null
}

function saveProviderConfig(providerId: string, config: Record<string, any>) {
  updateProviderConfig(providerId, config)
}

// 检查提供者是否已配置
function isProviderConfigured(provider: TranslationProvider): boolean {
  if (provider.id === 'google') {
    return true
  }

  const config = provider.config as any
  if (!config) {
    return false
  }

  switch (provider.id) {
    case 'deepl':
    case 'bing':
    case 'custom':
      return !!config.apiKey
    case 'baidu':
      return !!(config.appId && config.secretKey)
    case 'tencent':
      return !!(config.secretId && config.secretKey)
    case 'mymemory':
      return true
    default:
      return false
  }
}
</script>

<template>
  <div class="relative h-full overflow-hidden bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
    <!-- 主内容区域 -->
    <div class="h-full flex justify-center overflow-y-auto p-4 transition-all duration-300" :class="{ 'mr-80': showSettings }">
      <div class="max-w-2xl w-full flex flex-col gap-3">
        <div class="mb-2 flex items-center justify-between">
          <h1 class="text-2xl font-bold">
            多源翻译
          </h1>
          <!-- 设置按钮 -->
          <button
            class="rounded-full p-2 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
            :class="{ 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400': showSettings }"
            @click="toggleSettings"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <!-- 输入区域 -->
        <div class="relative">
          <textarea
            v-model="query"
            rows="5"
            placeholder="输入要翻译的文本..."
            class="w-full border border-gray-300 rounded-md bg-white p-3 transition-all dark:border-gray-600 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            :disabled="isTranslating"
          />
        </div>

        <!-- 翻译按钮 -->
        <button
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-semibold disabled:cursor-not-allowed hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          :disabled="isTranslating || !query.trim()"
          @click="translate"
        >
          <span v-if="isTranslating" class="flex items-center justify-center">
            <div class="mr-2 h-4 w-4 animate-spin border-b-2 border-white rounded-full" />
            翻译中...
          </span>
          <span v-else>翻译</span>
        </button>

        <!-- 历史记录 -->
        <div v-if="history.length > 0" class="pt-2">
          <h3 class="text-md mb-2 font-semibold">
            历史记录
          </h3>
          <div class="flex flex-wrap gap-2">
            <div v-for="item in history" :key="item.id" class="flex items-center rounded-full bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700">
              <span class="max-w-32 cursor-pointer truncate hover:text-blue-500" :title="item.text" @click="useHistoryItem(item.text)">
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
          <div v-if="!hasResults && !isTranslating" class="mt-6 text-center text-gray-500">
            翻译结果将显示在这里
          </div>
          <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
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

    <!-- 右侧抽屉式设置面板 -->
    <Transition name="slide-fade">
      <div
        v-if="showSettings"
        class="fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto border-l border-gray-300 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800"
      >
        <!-- 面板头部 -->
        <div class="sticky top-0 border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">
              翻译源配置
            </h2>
            <button
              class="rounded-full p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
              @click="toggleSettings"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 面板内容 -->
        <div class="p-4 space-y-4">
          <!-- 翻译源列表 -->
          <div class="space-y-3">
            <h3 class="text-md text-gray-700 font-medium dark:text-gray-300">
              可用翻译源
            </h3>
            <div v-for="provider in providers" :key="provider.id" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <input
                    :id="provider.id"
                    :checked="provider.enabled"
                    type="checkbox"
                    class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                    @change="toggleProvider(provider.id)"
                  >
                  <label :for="provider.id" class="font-medium">{{ provider.name }}</label>
                </div>
                <div class="flex gap-1">
                  <span v-if="provider.type === 'ai'" class="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-600 dark:bg-purple-900 dark:text-purple-400">AI</span>
                  <span v-else-if="provider.type === 'web'" class="rounded-full bg-green-100 px-2 py-1 text-xs text-green-600 dark:bg-green-900 dark:text-green-400">Web</span>
                  <span v-else class="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900 dark:text-blue-400">API</span>
                </div>
              </div>

              <!-- 提供者描述和配置按钮 -->
              <div class="mb-2 flex items-start justify-between">
                <p class="flex-1 text-xs text-gray-600 dark:text-gray-400">
                  <span v-if="provider.id === 'google'">免费的 Google 翻译服务，支持多种语言</span>
                  <span v-else-if="provider.id === 'deepl'">高质量的 DeepL 翻译，需要 API Key</span>
                  <span v-else-if="provider.id === 'bing'">微软必应翻译，需要 Azure API Key</span>
                  <span v-else-if="provider.id === 'custom'">自定义 AI 翻译，支持 OpenAI 兼容 API</span>
                  <span v-else-if="provider.id === 'baidu'">百度翻译服务，需要 APP ID 和密钥</span>
                  <span v-else-if="provider.id === 'tencent'">腾讯云机器翻译，需要 Secret ID 和 Key</span>
                  <span v-else-if="provider.id === 'mymemory'">免费的 MyMemory 翻译服务</span>
                </p>
                <button
                  class="ml-2 text-xs text-blue-600 transition-colors dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  @click="openConfigModal(provider)"
                >
                  配置
                </button>
              </div>

              <!-- 配置状态 -->
              <div class="flex items-center gap-2 text-xs">
                <div v-if="isProviderConfigured(provider)" class="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <div class="h-2 w-2 rounded-full bg-green-500" />
                  <span>已配置</span>
                </div>
                <div v-else class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <div class="h-2 w-2 rounded-full bg-gray-400" />
                  <span>未配置</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/30">
            <h3 class="mb-2 text-sm text-blue-800 font-medium dark:text-blue-200">
              统计信息
            </h3>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div class="text-blue-600 font-medium dark:text-blue-400">
                  {{ enabledProviders.length }}
                </div>
                <div class="text-blue-700 dark:text-blue-300">
                  已启用
                </div>
              </div>
              <div>
                <div class="text-blue-600 font-medium dark:text-blue-400">
                  {{ providers.length }}
                </div>
                <div class="text-blue-700 dark:text-blue-300">
                  总数量
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-md bg-gray-200 px-3 py-2 text-xs transition-colors dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              @click="enableAllProviders"
            >
              全部启用
            </button>
            <button
              class="flex-1 rounded-md bg-gray-200 px-3 py-2 text-xs transition-colors dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              @click="disableAllProviders"
            >
              全部禁用
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 遮罩层 -->
    <Transition name="fade">
      <div
        v-if="showSettings"
        class="fixed inset-0 z-40 bg-black bg-opacity-30"
        @click="toggleSettings"
      />
    </Transition>

    <!-- 配置模态框 -->
    <ProviderConfigModal
      :show="showConfigModal"
      :provider="currentConfigProvider"
      @close="closeConfigModal"
      @save="saveProviderConfig"
    />
  </div>
</template>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
