<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 overflow-y-auto">
        <!-- 遮罩层 -->
        <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
        
        <!-- 模态框 -->
        <div class="flex min-h-full items-center justify-center p-4">
          <div class="relative w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
            <!-- 头部 -->
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                配置 {{ provider?.name }}
              </h3>
              <button
                class="rounded-full p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                @click="closeModal"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <!-- 配置表单 -->
            <div class="space-y-4">
              <!-- Google 翻译 -->
              <div v-if="provider?.id === 'google'" class="text-sm text-gray-600 dark:text-gray-400">
                <p class="mb-2">Google 翻译使用免费 API，无需配置。</p>
                <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span class="text-green-700 dark:text-green-400 font-medium">服务可用</span>
                  </div>
                </div>
              </div>

              <!-- DeepL 配置 -->
              <div v-else-if="provider?.id === 'deepl'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API Key
                </label>
                <input
                  v-model="configForm.apiKey"
                  type="password"
                  placeholder="输入 DeepL API Key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  获取 API Key: <a href="https://www.deepl.com/pro-api" target="_blank" class="text-blue-500 hover:underline">DeepL API</a>
                </p>

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  API URL
                </label>
                <input
                  v-model="configForm.apiUrl"
                  type="url"
                  placeholder="https://api-free.deepl.com/v2/translate"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>

              <!-- Bing 配置 -->
              <div v-else-if="provider?.id === 'bing'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API Key
                </label>
                <input
                  v-model="configForm.apiKey"
                  type="password"
                  placeholder="输入 Azure Cognitive Services Key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  区域
                </label>
                <input
                  v-model="configForm.region"
                  type="text"
                  placeholder="例如: eastus, global"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  获取密钥: <a href="https://portal.azure.com/" target="_blank" class="text-blue-500 hover:underline">Azure Portal</a>
                </p>
              </div>

              <!-- 自定义 AI 配置 -->
              <div v-else-if="provider?.id === 'custom'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API URL
                </label>
                <input
                  v-model="configForm.apiUrl"
                  type="url"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  API Key
                </label>
                <input
                  v-model="configForm.apiKey"
                  type="password"
                  placeholder="输入 API Key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  模型
                </label>
                <input
                  v-model="configForm.model"
                  type="text"
                  placeholder="gpt-3.5-turbo"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  翻译提示词
                </label>
                <textarea
                  v-model="configForm.prompt"
                  rows="3"
                  placeholder="请将以下文本翻译成中文，只返回翻译结果："
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <!-- 百度翻译配置 -->
              <div v-else-if="provider?.id === 'baidu'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  APP ID
                </label>
                <input
                  v-model="configForm.appId"
                  type="text"
                  placeholder="输入百度翻译 APP ID"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  密钥
                </label>
                <input
                  v-model="configForm.secretKey"
                  type="password"
                  placeholder="输入百度翻译密钥"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  API URL
                </label>
                <input
                  v-model="configForm.apiUrl"
                  type="url"
                  placeholder="https://fanyi-api.baidu.com/api/trans/vip/translate"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  获取密钥: <a href="https://fanyi-api.baidu.com/" target="_blank" class="text-blue-500 hover:underline">百度翻译开放平台</a>
                </p>
              </div>

              <!-- 腾讯翻译配置 -->
              <div v-else-if="provider?.id === 'tencent'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Secret ID
                </label>
                <input
                  v-model="configForm.secretId"
                  type="text"
                  placeholder="输入腾讯云 Secret ID"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  Secret Key
                </label>
                <input
                  v-model="configForm.secretKey"
                  type="password"
                  placeholder="输入腾讯云 Secret Key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4">
                  区域
                </label>
                <select
                  v-model="configForm.region"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ap-beijing">北京</option>
                  <option value="ap-shanghai">上海</option>
                  <option value="ap-guangzhou">广州</option>
                  <option value="ap-chengdu">成都</option>
                </select>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  获取密钥: <a href="https://console.cloud.tencent.com/" target="_blank" class="text-blue-500 hover:underline">腾讯云控制台</a>
                </p>
              </div>

              <!-- MyMemory 配置 -->
              <div v-else-if="provider?.id === 'mymemory'">
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <p class="mb-2">MyMemory 是免费的翻译服务，无需 API Key。</p>
                  <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span class="text-blue-700 dark:text-blue-400 font-medium">免费服务</span>
                    </div>
                  </div>
                </div>

                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  邮箱 (可选)
                </label>
                <input
                  v-model="configForm.email"
                  type="email"
                  placeholder="输入邮箱以提高配额限制"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  提供邮箱可以获得更高的 API 调用限制
                </p>
              </div>
            </div>

            <!-- 按钮组 -->
            <div class="flex justify-end gap-3 mt-6">
              <button
                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
                @click="closeModal"
              >
                取消
              </button>
              <button
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                @click="saveConfig"
                :disabled="provider?.id === 'google'"
              >
                保存
              </button>
            </div>

            <!-- 测试连接 -->
            <div v-if="provider?.id !== 'google'" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                class="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                @click="testConnection"
                :disabled="isTestingConnection"
              >
                <span v-if="isTestingConnection" class="flex items-center justify-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  测试连接中...
                </span>
                <span v-else>测试连接</span>
              </button>
              <p v-if="testResult" class="mt-2 text-xs" :class="testResult.success ? 'text-green-600' : 'text-red-600'">
                {{ testResult.message }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { TranslationProvider } from '../types/translation'
import { DeepLTranslateProvider } from '../providers/deepl-translate'
import { BingTranslateProvider } from '../providers/bing-translate'
import { CustomTranslateProvider } from '../providers/custom-translate'
import { BaiduTranslateProvider } from '../providers/baidu-translate'
import { TencentTranslateProvider } from '../providers/tencent-translate'

interface Props {
  show: boolean
  provider: TranslationProvider | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  save: [providerId: string, config: Record<string, any>]
}>()

const configForm = reactive({
  apiKey: '',
  apiUrl: '',
  region: 'global',
  model: 'gpt-3.5-turbo',
  prompt: '请将以下文本翻译成中文，只返回翻译结果：',
})

const isTestingConnection = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// 监听 provider 变化，初始化表单
watch(() => props.provider, (provider) => {
  if (provider?.config) {
    Object.assign(configForm, provider.config)
  }
  testResult.value = null
}, { immediate: true })

function closeModal() {
  emit('close')
}

function saveConfig() {
  if (!props.provider) return
  
  const config: Record<string, any> = {}
  
  if (props.provider.id === 'deepl') {
    config.apiKey = configForm.apiKey
    config.apiUrl = configForm.apiUrl
  } else if (props.provider.id === 'bing') {
    config.apiKey = configForm.apiKey
    config.region = configForm.region
  } else if (props.provider.id === 'custom') {
    config.apiUrl = configForm.apiUrl
    config.apiKey = configForm.apiKey
    config.model = configForm.model
    config.prompt = configForm.prompt
  }
  
  emit('save', props.provider.id, config)
  closeModal()
}

async function testConnection() {
  if (!props.provider) return

  const requiredFields = getRequiredFields()
  const missingFields = requiredFields.filter(field => !configForm[field as keyof typeof configForm])
  
  if (missingFields.length > 0) {
    testResult.value = { success: false, message: `请填写必填项: ${missingFields.join(', ')}` }
    return
  }

  isTestingConnection.value = true
  testResult.value = null

  try {
    const providerMap = {
      'deepl': DeepLTranslateProvider,
      'bing': BingTranslateProvider,
      'custom': CustomTranslateProvider,
      'baidu': BaiduTranslateProvider,
      'tencent': TencentTranslateProvider,
    }

    const ProviderClass = providerMap[props.provider.id as keyof typeof providerMap]
    if (!ProviderClass) {
      testResult.value = { success: true, message: '该翻译源无需测试' }
      return
    }
    
    const tempProvider = new ProviderClass()
    tempProvider.config = { ...tempProvider.config, ...configForm }

    await tempProvider.translate({ text: 'test', to: 'zh' })

    testResult.value = { success: true, message: '连接成功！' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    testResult.value = { success: false, message: `连接失败: ${errorMessage}` }
  } finally {
    isTestingConnection.value = false
  }
}

function getRequiredFields(): string[] {
  if (!props.provider) return []
  
  switch (props.provider.id) {
    case 'deepl':
      return [] // apiKey is optional for mock mode
    case 'bing':
    case 'custom':
      return ['apiKey']
    case 'baidu':
      return ['appId', 'secretKey']
    case 'tencent':
      return ['secretId', 'secretKey']
    case 'mymemory':
      return [] // No required fields
    default:
      return []
  }
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: all 0.3s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>