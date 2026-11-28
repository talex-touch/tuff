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
import { validateProviderApiUrl } from '../utils/url-validation'

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

  const saveProviderSecrets = async (
    providerId: string,
    config: Record<string, any>,
  ): Promise<{ success: boolean, error?: string }> => {
    const fields = (PROVIDER_SECRET_FIELDS[providerId] || []).filter(field => field in config)
    const entries = fields.map((field) => {
      const value = typeof config[field] === 'string' ? config[field] : ''
      return { key: getProviderSecretKey(providerId, field), value: value.trim() ? value : null }
    })
    if (entries.length === 0) {
      return { success: true }
    }
    try {
      const result = await secret.setMany(entries)
      if (!result?.success) {
        return { success: false, error: result?.error || '密钥保存失败，配置未更新' }
      }
      for (const field of fields) {
        delete pendingLegacyCredentials[providerId]?.[field]
      }
      return { success: true }
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : '密钥保存失败，配置未更新',
      }
    }
  }

  const deleteAllProviderSecrets = async (): Promise<{ success: boolean, error?: string }> => {
    const entries = Object.entries(PROVIDER_SECRET_FIELDS).flatMap(([providerId, fields]) =>
      fields.map(field => ({ key: getProviderSecretKey(providerId, field), value: null })),
    )
    try {
      const result = await secret.setMany(entries)
      if (!result?.success) {
        return { success: false, error: result?.error || '密钥清理失败，配置未重置' }
      }
      pendingLegacyCredentials = {}
      return { success: true }
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : '密钥清理失败，配置未重置',
      }
    }
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

  // 更新提供者配置（原子化提交：先写新密钥并快照旧密钥，配置持久化失败时回滚安全存储与内存配置；
  // 清理旧密钥在配置持久化之后或失败回滚时恢复）
  const updateProviderConfig = async (
    id: string,
    config: Record<string, any>,
  ): Promise<{ success: boolean, error?: string }> => {
    const provider = providers.get(id)
    if (!provider || !provider.config) {
      return { success: false, error: '未找到对应的翻译源配置' }
    }

    if (typeof config.apiUrl === 'string' && config.apiUrl.trim().length > 0) {
      const urlCheck = validateProviderApiUrl(config.apiUrl)
      if (!urlCheck.valid) {
        return { success: false, error: urlCheck.error || '翻译源 API URL 无效' }
      }
    }

    const previousConfig = { ...provider.config }
    const previousLegacy = pendingLegacyCredentials[id] ? { ...pendingLegacyCredentials[id] } : undefined
    const secretFields = (PROVIDER_SECRET_FIELDS[id] || []).filter(field => field in config)
    const hasSecrets = secretFields.length > 0

    const previousVaultSnapshot: Array<{ key: string, value: string | null }> = []
    if (hasSecrets) {
      for (const field of secretFields) {
        const key = getProviderSecretKey(id, field)
        let existing: string | null = null
        try {
          const stored = await secret.get(key)
          existing = typeof stored === 'string' && stored.trim() ? stored : null
        }
        catch {
          const fallback = previousConfig[field]
          existing = typeof fallback === 'string' && fallback.trim() ? fallback : null
        }
        previousVaultSnapshot.push({ key, value: existing })
      }
    }

    const nonClearingEntries = secretFields
      .map((field) => {
        const value = typeof config[field] === 'string' ? config[field] : ''
        return { field, key: getProviderSecretKey(id, field), value: value.trim() ? value : null }
      })
    const onlyClearingSecrets = hasSecrets && nonClearingEntries.every(entry => entry.value === null)

    if (hasSecrets && !onlyClearingSecrets) {
      const secretResult = await saveProviderSecrets(id, config)
      if (!secretResult.success) {
        return secretResult
      }
    }

    const metadataConfig = stripProviderSecrets(id, config)
    const nextConfig = { ...previousConfig, ...metadataConfig }
    provider.config = nextConfig

    try {
      await saveProvidersConfig()
      if (onlyClearingSecrets) {
        const clearResult = await saveProviderSecrets(id, config)
        if (!clearResult.success) {
          provider.config = previousConfig
          if (previousLegacy) {
            pendingLegacyCredentials[id] = previousLegacy
          }
          await saveProvidersConfig().catch(() => undefined)
          return clearResult
        }
      }
      if (hasSecrets) {
        provider.config = await mergeProviderSecrets(id, stripProviderSecrets(id, nextConfig))
      }
      return { success: true }
    }
    catch (error) {
      provider.config = previousConfig
      if (previousLegacy) {
        pendingLegacyCredentials[id] = previousLegacy
      }
      if (hasSecrets && !onlyClearingSecrets && previousVaultSnapshot.length > 0) {
        try {
          await secret.setMany(previousVaultSnapshot)
        }
        catch {
          // Best-effort vault rollback
        }
      }
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : '保存翻译源配置失败',
      }
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

  // 重置所有提供者配置（fail-closed：清理密钥失败则中止；配置持久化失败则回滚安全存储与内存配置）
  const resetProvidersConfig = async (): Promise<{ success: boolean, error?: string }> => {
    const snapshots = new Map<string, { enabled: boolean, config?: Record<string, any> }>()
    providers.forEach((provider, id) => {
      snapshots.set(id, {
        enabled: provider.enabled,
        config: provider.config ? { ...provider.config } : undefined,
      })
    })
    const previousLegacy: PendingLegacyCredentials = Object.fromEntries(
      Object.entries(pendingLegacyCredentials).map(([id, creds]) => [id, { ...creds }]),
    )

    const previousVaultEntries: Array<{ key: string, value: string | null }> = []
    for (const [providerId, fields] of Object.entries(PROVIDER_SECRET_FIELDS)) {
      for (const field of fields) {
        const key = getProviderSecretKey(providerId, field)
        let storedValue: string | null = null
        try {
          const value = await secret.get(key)
          storedValue = typeof value === 'string' && value.trim() ? value : null
        }
        catch {
          const fallback = snapshots.get(providerId)?.config?.[field]
          storedValue = typeof fallback === 'string' && fallback.trim() ? fallback : null
        }
        if (storedValue !== null) {
          previousVaultEntries.push({ key, value: storedValue })
        }
      }
    }

    const secretResult = await deleteAllProviderSecrets()
    if (!secretResult.success) {
      return secretResult
    }

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

    try {
      await saveProvidersConfig()
      return { success: true }
    }
    catch (error) {
      snapshots.forEach((snapshot, id) => {
        const provider = providers.get(id)
        if (!provider)
          return
        provider.enabled = snapshot.enabled
        if (snapshot.config) {
          provider.config = snapshot.config
        }
      })
      pendingLegacyCredentials = previousLegacy
      if (previousVaultEntries.length > 0) {
        try {
          await secret.setMany(previousVaultEntries)
        }
        catch {
          // Best-effort vault rollback
        }
      }
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : '重置翻译源配置失败',
      }
    }
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
