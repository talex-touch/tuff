import { ref, reactive, computed, watch } from 'vue'
import type { TranslationRequest, TranslationResponse, TranslationResult, HistoryItem, TranslationProviderRequest } from '../types/translation'
import { useTranslationProvider } from './useTranslationProvider'

const HISTORY_STORAGE_KEY = 'translation_history'
const MAX_HISTORY_ITEMS = 10

// 全局状态
const currentRequest = ref<TranslationRequest | null>(null)
const currentResponse = reactive<TranslationResponse>({
  request: {} as TranslationRequest,
  results: new Map(),
  errors: new Map(),
  isLoading: false,
  isComplete: false
})
const history = ref<HistoryItem[]>([])

export function useTranslation() {
  const { enabledProviders, getProvider } = useTranslationProvider()

  // 初始化历史记录
  const initHistory = () => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (saved) {
        history.value = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load translation history:', error)
      history.value = []
    }
  }

  // 保存历史记录
  const saveHistory = () => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.value))
    } catch (error) {
      console.error('Failed to save translation history:', error)
    }
  }

  // 监听历史记录变化并保存
  watch(history, saveHistory, { deep: true })

  // 添加到历史记录
  const addToHistory = (text: string, results?: TranslationResult[]) => {
    if (!text.trim()) return

    const existingIndex = history.value.findIndex(item => item.text === text)
    const historyItem: HistoryItem = {
      id: Date.now(),
      text: text.trim(),
      timestamp: Date.now(),
      results
    }

    if (existingIndex > -1) {
      // 更新现有项目并移到顶部
      history.value.splice(existingIndex, 1)
    }

    history.value.unshift(historyItem)

    // 限制历史记录数量
    if (history.value.length > MAX_HISTORY_ITEMS) {
      history.value = history.value.slice(0, MAX_HISTORY_ITEMS)
    }
  }

  // 从历史记录中删除项目
  const removeFromHistory = (id: number) => {
    const index = history.value.findIndex(item => item.id === id)
    if (index > -1) {
      history.value.splice(index, 1)
    }
  }

  // 清空历史记录
  const clearHistory = () => {
    history.value = []
  }

  // 翻译文本
  const translate = async (
    text: string,
    targetLanguage = 'zh',
    sourceLanguage = 'auto',
    providerIds?: string[]
  ): Promise<TranslationResponse> => {
    if (!text.trim()) {
      throw new Error('翻译文本不能为空')
    }

    // 准备请求
    const request: TranslationRequest = {
      text: text.trim(),
      targetLanguage,
      sourceLanguage,
      providers: providerIds || enabledProviders.value.map(p => p.id)
    }

    // 重置响应状态
    currentRequest.value = request
    currentResponse.request = request
    currentResponse.results.clear()
    currentResponse.errors.clear()
    currentResponse.isLoading = true
    currentResponse.isComplete = false

    const providers = request.providers
      .map(id => getProvider(id))
      .filter(p => p !== undefined)

    if (providers.length === 0) {
      currentResponse.isLoading = false
      currentResponse.isComplete = true
      throw new Error('没有可用的翻译提供者')
    }

    // 并行执行所有翻译
    const promises = providers.map(async (provider) => {
      try {
        const result = await provider.translate({
          text: request.text,
          targetLanguage: request.targetLanguage,
          sourceLanguage: request.sourceLanguage
        })
        currentResponse.results.set(provider.id, result)
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error('翻译失败')
        currentResponse.errors.set(provider.id, err)
        console.error(`Provider ${provider.id} failed:`, err)
        return null
      }
    })

    // 等待所有翻译完成
    const results = await Promise.allSettled(promises)
    
    currentResponse.isLoading = false
    currentResponse.isComplete = true

    // 收集成功的翻译结果
    const successfulResults: TranslationResult[] = []
    currentResponse.results.forEach(result => {
      if (result) {
        successfulResults.push(result)
      }
    })

    // 添加到历史记录
    if (successfulResults.length > 0) {
      addToHistory(request.text, successfulResults)
    }

    return { ...currentResponse }
  }

  // 重试翻译（针对失败的提供者）
  const retryTranslation = async (providerIds?: string[]): Promise<void> => {
    if (!currentRequest.value) {
      throw new Error('没有当前翻译请求可以重试')
    }

    const failedProviders = providerIds || 
      Array.from(currentResponse.errors.keys())

    if (failedProviders.length === 0) {
      return
    }

    currentResponse.isLoading = true

    const promises = failedProviders.map(async (providerId) => {
      const provider = getProvider(providerId)
      if (!provider) return

      try {
        // 清除之前的错误
        currentResponse.errors.delete(providerId)
        
        const result = await provider.translate({
          text: currentRequest.value!.text,
          targetLanguage: currentRequest.value!.targetLanguage,
          sourceLanguage: currentRequest.value!.sourceLanguage
        })
        currentResponse.results.set(providerId, result)
      } catch (error) {
        const err = error instanceof Error ? error : new Error('重试翻译失败')
        currentResponse.errors.set(providerId, err)
      }
    })

    await Promise.allSettled(promises)
    currentResponse.isLoading = false
  }

  // 取消当前翻译
  const cancelTranslation = () => {
    currentRequest.value = null
    currentResponse.isLoading = false
    currentResponse.isComplete = true
  }

  // 计算属性
  const hasResults = computed(() => currentResponse.results.size > 0)
  const hasErrors = computed(() => currentResponse.errors.size > 0)
  const isTranslating = computed(() => currentResponse.isLoading)
  const translationResults = computed(() => Array.from(currentResponse.results.values()))
  const translationErrors = computed(() => Array.from(currentResponse.errors.entries()))

  // 初始化
  initHistory()

  return {
    // 状态
    currentRequest: computed(() => currentRequest.value),
    currentResponse: computed(() => currentResponse),
    history: computed(() => history.value),
    hasResults,
    hasErrors,
    isTranslating,
    translationResults,
    translationErrors,

    // 方法
    translate,
    retryTranslation,
    cancelTranslation,
    addToHistory,
    removeFromHistory,
    clearHistory,
    initHistory
  }
}