import { ref, reactive, computed } from 'vue'
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk'
import type { TranslationProvider } from '../types/translation'
import { GoogleTranslateProvider } from '../providers/google-translate'
import { DeepLTranslateProvider } from '../providers/deepl-translate'
import { BingTranslateProvider } from '../providers/bing-translate'
import { CustomTranslateProvider } from '../providers/custom-translate'
import { BaiduTranslateProvider } from '../providers/baidu-translate'
import { TencentTranslateProvider } from '../providers/tencent-translate'
import { MyMemoryTranslateProvider } from '../providers/mymemory-translate'

// 全局状态
const providers = reactive<Map<string, TranslationProvider>>(new Map())
const isInitialized = ref(false)

export function useTranslationProvider() {
  const storage = usePluginStorage()

  // 初始化所有提供者
  const initializeProviders = async () => {
    if (isInitialized.value) return

    // 创建提供者实例
    const googleProvider = new GoogleTranslateProvider()
    const deeplProvider = new DeepLTranslateProvider()
    const bingProvider = new BingTranslateProvider()
    const customProvider = new CustomTranslateProvider()
    const baiduProvider = new BaiduTranslateProvider()
    const tencentProvider = new TencentTranslateProvider()
    const mymemoryProvider = new MyMemoryTranslateProvider()

    // 注册提供者
    providers.set(googleProvider.id, googleProvider)
    providers.set(deeplProvider.id, deeplProvider)
    providers.set(bingProvider.id, bingProvider)
    providers.set(customProvider.id, customProvider)
    providers.set(baiduProvider.id, baiduProvider)
    providers.set(tencentProvider.id, tencentProvider)
    providers.set(mymemoryProvider.id, mymemoryProvider)

    // 从 localStorage 恢复配置
    await loadProvidersConfig()

    isInitialized.value = true
  }

  // 保存提供者配置到 localStorage
  const saveProvidersConfig = () => {
    const config: Record<string, any> = {}
    providers.forEach((provider, id) => {
      config[id] = {
        enabled: provider.enabled,
        config: provider.config || {}
      }
    })
    storage.setItem('providers_config', config)
  }

  // 从 localStorage 加载提供者配置
  const loadProvidersConfig = async () => {
    try {
      const saved = await storage.getItem('providers_config')
      if (saved) {
        const config = saved
        providers.forEach((provider, id) => {
          if (config[id]) {
            provider.enabled = config[id].enabled ?? provider.enabled
            if (config[id].config && provider.config) {
              provider.config = { ...provider.config, ...config[id].config }
            }
          }
        })
      }
    } catch (error) {
      console.error('Failed to load providers config:', error)
    }
  }

  // 获取所有提供者
  const getAllProviders = computed(() => {
    return Array.from(providers.values())
  })

  // 获取启用的提供者
  const getEnabledProviders = computed(() => {
    return Array.from(providers.values()).filter(p => p.enabled)
  })

  // 获取特定提供者
  const getProvider = (id: string): TranslationProvider | undefined => {
    return providers.get(id)
  }

  // 启用/禁用提供者
  const toggleProvider = (id: string, enabled?: boolean) => {
    const provider = providers.get(id)
    if (provider) {
      provider.enabled = enabled ?? !provider.enabled
      saveProvidersConfig()
    }
  }

  // 更新提供者配置
  const updateProviderConfig = (id: string, config: Record<string, any>) => {
    const provider = providers.get(id)
    if (provider && provider.config) {
      provider.config = { ...provider.config, ...config }
      saveProvidersConfig()
    }
  }

  // 注册新的提供者
  const registerProvider = (provider: TranslationProvider) => {
    providers.set(provider.id, provider)
    saveProvidersConfig()
  }

  // 注销提供者
  const unregisterProvider = (id: string) => {
    providers.delete(id)
    saveProvidersConfig()
  }

  // 重置所有提供者配置
  const resetProvidersConfig = () => {
    providers.forEach(provider => {
      // 默认只启用 Google 翻译
      provider.enabled = provider.id === 'google'
      if (provider.config) {
        // 重置为默认配置
        if (provider.id === 'deepl') {
          (provider as DeepLTranslateProvider).config = {
            apiKey: '',
            apiUrl: 'https://api-free.deepl.com/v2/translate'
          }
        } else if (provider.id === 'bing') {
          (provider as BingTranslateProvider).config = {
            apiKey: '',
            region: 'global'
          }
        } else if (provider.id === 'custom') {
          (provider as CustomTranslateProvider).config = {
            apiUrl: '',
            apiKey: '',
            model: 'gpt-3.5-turbo',
            prompt: '请将以下文本翻译成中文，只返回翻译结果：'
          }
        } else if (provider.id === 'baidu') {
          (provider as BaiduTranslateProvider).config = {
            appId: '',
            secretKey: '',
            apiUrl: 'https://fanyi-api.baidu.com/api/trans/vip/translate'
          }
        } else if (provider.id === 'tencent') {
          (provider as TencentTranslateProvider).config = {
            secretId: '',
            secretKey: '',
            region: 'ap-beijing',
            apiUrl: 'https://tmt.tencentcloudapi.com'
          }
        } else if (provider.id === 'mymemory') {
          (provider as MyMemoryTranslateProvider).config = {
            apiUrl: 'https://api.mymemory.translated.net/get',
            email: ''
          }
        }
      }
    })
    saveProvidersConfig()
  }

  // 自动初始化
  if (!isInitialized.value) {
    initializeProviders()
  }

  return {
    providers: getAllProviders,
    enabledProviders: getEnabledProviders,
    isInitialized,
    getProvider,
    toggleProvider,
    updateProviderConfig,
    registerProvider,
    unregisterProvider,
    resetProvidersConfig,
    saveProvidersConfig
  }
}