import type { SecureStoreHealthResponse } from '@talex-touch/utils/transport/events/types'
import type { TranslationProvider } from '../types/translation'
import type { PendingLegacyCredentials } from '../utils/provider-credential-migration'
import {
  applyProviderPresentation,
  getEnabledProviderIds,
  isDefaultEnabledProvider,
  TRANSLATION_PROVIDER_ORDER,
} from '@talex-touch/utils/plugin'
import { usePluginSecret, usePluginStorage } from '@talex-touch/utils/plugin/sdk'
import { computed, reactive, ref } from 'vue'
import { BaiduTranslateProvider } from '../providers/baidu-translate'
import { BingTranslateProvider } from '../providers/bing-translate'
import { CustomTranslateProvider } from '../providers/custom-translate'
import { DeepLTranslateProvider } from '../providers/deepl-translate'
import { GoogleTranslateProvider } from '../providers/google-translate'
import { MyMemoryTranslateProvider } from '../providers/mymemory-translate'
import { TencentTranslateProvider } from '../providers/tencent-translate'
import { TuffIntelligenceTranslateProvider } from '../providers/tuffintelligence-translate'
import { migrateLegacyProviderCredentials } from '../utils/provider-credential-migration'

const providers = reactive<Map<string, TranslationProvider>>(new Map())
const isInitialized = ref(false)
let pendingLegacyCredentials: PendingLegacyCredentials = {}

export const PROVIDER_SECRET_FIELDS: Record<string, string[]> = {
  deepl: ['apiKey'],
  bing: ['apiKey'],
  custom: ['apiKey'],
  baidu: ['secretKey'],
  tencent: ['secretId', 'secretKey'],
  caiyun: ['token'],
}

export function hasProviderSecretDefinition(providerId: string): boolean {
  return (PROVIDER_SECRET_FIELDS[providerId] || []).length > 0
}

export function canPersistProviderSecrets(
  providerId: string,
  health: SecureStoreHealthResponse | null | undefined,
): boolean {
  if (!hasProviderSecretDefinition(providerId)) {
    return true
  }
  return Boolean(health?.available)
}

export function getProviderSecretKey(providerId: string, field: string): string {
  return `providers.${providerId}.${field}`
}

export function stripProviderSecrets(providerId: string, config: Record<string, any>): Record<string, any> {
  const secretFields = PROVIDER_SECRET_FIELDS[providerId] || []
  const next = { ...config }
  for (const field of secretFields) {
    delete next[field]
  }
  return next
}

function hasProviderSecretFields(providerId: string, config: Record<string, any>): boolean {
  return (PROVIDER_SECRET_FIELDS[providerId] || []).some(field => field in config)
}

export function useTranslationProvider() {
  const storage = usePluginStorage()
  const secret = usePluginSecret()

  // The vault wins; a legacy plaintext value only stands in while its migration is still pending.
  const readProviderSecret = async (providerId: string, field: string): Promise<string | null> => {
    const legacy = pendingLegacyCredentials[providerId]?.[field] ?? null
    try {
      return (await secret.get(getProviderSecretKey(providerId, field))) || legacy
    }
    catch (error) {
      if (legacy) {
        return legacy
      }
      throw error
    }
  }

  const mergeProviderSecrets = async (
    providerId: string,
    config: Record<string, any>,
  ): Promise<Record<string, any>> => {
    const next = { ...config }
    const secretFields = PROVIDER_SECRET_FIELDS[providerId] || []
    for (const field of secretFields) {
      const stored = await readProviderSecret(providerId, field)
      if (stored) {
        next[field] = stored
      }
    }
    return next
  }

  const saveProviderSecrets = async (providerId: string, config: Record<string, any>): Promise<boolean> => {
    const fields = (PROVIDER_SECRET_FIELDS[providerId] || []).filter(field => field in config)
    const entries = fields.map((field) => {
      const value = typeof config[field] === 'string' ? config[field] : ''
      return { key: getProviderSecretKey(providerId, field), value: value.trim() ? value : null }
    })
    if (entries.length === 0) {
      return true
    }
    const result = await secret.setMany(entries)
    if (result.success) {
      for (const field of fields) {
        delete pendingLegacyCredentials[providerId]?.[field]
      }
    }
    return result.success
  }

  const deleteAllProviderSecrets = async (): Promise<boolean> => {
    const entries = Object.entries(PROVIDER_SECRET_FIELDS).flatMap(([providerId, fields]) =>
      fields.map(field => ({ key: getProviderSecretKey(providerId, field), value: null })),
    )
    const result = await secret.setMany(entries)
    if (result.success) {
      pendingLegacyCredentials = {}
    }
    return result.success
  }

  async function persistProviderConfig(providerId: string, config: Record<string, any>) {
    if (hasProviderSecretFields(providerId, config) && !(await saveProviderSecrets(providerId, config))) {
      return
    }
    await saveProvidersConfig()
  }

  // 初始化所有提供者
  const initializeProviders = async () => {
    if (isInitialized.value)
      return

    const providerMap: Record<string, TranslationProvider> = {
      tuffintelligence: new TuffIntelligenceTranslateProvider(),
      google: new GoogleTranslateProvider(),
      deepl: new DeepLTranslateProvider(),
      bing: new BingTranslateProvider(),
      custom: new CustomTranslateProvider(),
      baidu: new BaiduTranslateProvider(),
      tencent: new TencentTranslateProvider(),
      mymemory: new MyMemoryTranslateProvider(),
    }

    for (const providerId of TRANSLATION_PROVIDER_ORDER as string[]) {
      const provider = providerMap[providerId]
      if (!provider)
        continue

      applyProviderPresentation(provider)
      provider.enabled = isDefaultEnabledProvider(providerId)
      providers.set(provider.id, provider)
    }

    await loadProvidersConfig()

    isInitialized.value = true
  }

  // 保存提供者配置到 localStorage
  async function saveProvidersConfig() {
    const config: Record<string, any> = {}
    providers.forEach((provider, id) => {
      config[id] = {
        enabled: provider.enabled,
        config: stripProviderSecrets(id, provider.config || {}),
      }
    })
    // Legacy plaintext the vault never took stays on disk, so saving other settings cannot destroy the only copy.
    for (const [id, credentials] of Object.entries(pendingLegacyCredentials)) {
      config[id] = { enabled: false, ...config[id], config: { ...config[id]?.config, ...credentials } }
    }
    // 兼容新版本：使用 setFile 代替 setItem
    await storage.setFile('providers_config', config)
  }

  // 从 localStorage 加载提供者配置
  async function loadProvidersConfig() {
    try {
      // 兼容新版本：使用 getFile 代替 getItem
      const saved = await storage.getFile('providers_config')
      if (saved && typeof saved === 'object' && saved !== null) {
        pendingLegacyCredentials = await migrateLegacyProviderCredentials({
          saved,
          fields: PROVIDER_SECRET_FIELDS,
          secretKey: getProviderSecretKey,
          vault: secret,
          persistConfig: sanitized => storage.setFile('providers_config', sanitized),
        })
        const config = saved as Record<string, { enabled?: boolean, config?: Record<string, any> }>
        const enabledIds = getEnabledProviderIds(config) as string[]
        await Promise.all(
          Array.from(providers.entries()).map(async ([id, provider]) => {
            provider.enabled = enabledIds.includes(id)
            if (config[id]?.config && provider.config) {
              const metadataConfig = stripProviderSecrets(id, config[id].config)
              provider.config = {
                ...provider.config,
                ...metadataConfig,
                ...(await mergeProviderSecrets(id, metadataConfig)),
              }
            }
          }),
        )
      }
    }
    catch (error) {
      void error
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
      // 异步保存，不阻塞 UI
      saveProvidersConfig().catch((err) => {
        void err
      })
    }
  }

  // 更新提供者配置
  const updateProviderConfig = (id: string, config: Record<string, any>) => {
    const provider = providers.get(id)
    if (provider && provider.config) {
      const metadataConfig = stripProviderSecrets(id, config)
      provider.config = { ...provider.config, ...metadataConfig }
      persistProviderConfig(id, config)
        .then(async () => {
          if (hasProviderSecretFields(id, config)) {
            provider.config = await mergeProviderSecrets(id, provider.config || {})
          }
        })
        .catch((err) => {
          void err
        })
    }
  }

  // 注册新的提供者
  const registerProvider = (provider: TranslationProvider) => {
    providers.set(provider.id, provider)
    // 异步保存，不阻塞 UI
    saveProvidersConfig().catch((err) => {
      void err
    })
  }

  // 注销提供者
  const unregisterProvider = (id: string) => {
    providers.delete(id)
    // 异步保存，不阻塞 UI
    saveProvidersConfig().catch((err) => {
      void err
    })
  }

  // 重置所有提供者配置
  const resetProvidersConfig = () => {
    providers.forEach((provider) => {
      provider.enabled = isDefaultEnabledProvider(provider.id)
      if (provider.config) {
        if (provider.id === 'deepl') {
          ;(provider as DeepLTranslateProvider).config = {
            apiKey: '',
            apiUrl: 'https://api-free.deepl.com/v2/translate',
          }
        }
        else if (provider.id === 'bing') {
          ;(provider as BingTranslateProvider).config = {
            apiKey: '',
            region: 'global',
            apiUrl: 'https://api.cognitive.microsofttranslator.com/translate',
          }
        }
        else if (provider.id === 'custom') {
          ;(provider as CustomTranslateProvider).config = {
            apiUrl: '',
            apiKey: '',
            model: 'gpt-3.5-turbo',
            prompt: '请将以下文本翻译成目标语言，只返回译文。',
          }
        }
        else if (provider.id === 'baidu') {
          ;(provider as BaiduTranslateProvider).config = {
            appId: '',
            secretKey: '',
            apiUrl: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
          }
        }
        else if (provider.id === 'tencent') {
          ;(provider as TencentTranslateProvider).config = {
            secretId: '',
            secretKey: '',
            region: 'ap-beijing',
            apiUrl: 'https://tmt.tencentcloudapi.com',
          }
        }
        else if (provider.id === 'mymemory') {
          ;(provider as MyMemoryTranslateProvider).config = {
            apiUrl: 'https://api.mymemory.translated.net/get',
            email: '',
          }
        }
      }
    })
    deleteAllProviderSecrets()
      .then((success) => {
        if (success) {
          return saveProvidersConfig()
        }
      })
      .catch((err) => {
        void err
      })
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
    saveProvidersConfig,
  }
}
