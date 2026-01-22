import type {
  AppPreviewChannel,
  CustomUpdateConfig,
  UpdateCheckResult,
  UpdateSourceConfig
} from '@talex-touch/utils'
import type { UpdateProvider } from './UpdateProvider'
import { UpdateProviderType } from '@talex-touch/utils'
import { CustomUpdateProvider } from './CustomUpdateProvider'
import { GithubUpdateProvider } from './GithubUpdateProvider'
import { OfficialUpdateProvider } from './OfficialUpdateProvider'
// Note: GitHubRelease, UpdateError, UpdateErrorType are imported in other files if needed

export class UpdateProviderManager {
  private providers: UpdateProvider[] = []
  private activeProvider: UpdateProvider | null = null
  private customProviders: Map<string, CustomUpdateProvider> = new Map()

  constructor() {
    // 注册默认Provider
    this.registerDefaultProviders()
  }

  // 注册默认Provider
  private registerDefaultProviders(): void {
    // GitHub Provider（默认启用）
    const githubProvider = new GithubUpdateProvider()
    this.registerProvider(githubProvider)

    // Official Provider（预留，暂不启用）
    const officialProvider = new OfficialUpdateProvider()
    this.registerProvider(officialProvider)
  }

  // 注册Provider
  registerProvider(provider: UpdateProvider): void {
    if (!this.providers.find((p) => p.type === provider.type)) {
      this.providers.push(provider)
      console.log(`[UpdateProviderManager] Registered provider: ${provider.name}`)
    }
  }

  // 注册自定义Provider
  registerCustomProvider(config: CustomUpdateConfig): CustomUpdateProvider {
    const provider = new CustomUpdateProvider(config)
    this.customProviders.set(config.url, provider)
    this.registerProvider(provider)
    console.log(`[UpdateProviderManager] Registered custom provider: ${config.name}`)
    return provider
  }

  // 移除自定义Provider
  removeCustomProvider(url: string): boolean {
    const provider = this.customProviders.get(url)
    if (provider) {
      this.providers = this.providers.filter((p) => p !== provider)
      this.customProviders.delete(url)
      console.log(`[UpdateProviderManager] Removed custom provider: ${url}`)
      return true
    }
    return false
  }

  // 根据配置选择Provider
  selectProvider(config: UpdateSourceConfig): UpdateProvider | null {
    if (!config.enabled) {
      console.log('[UpdateProviderManager] Provider disabled, skipping')
      return null
    }

    // 查找匹配的Provider
    const provider = this.providers.find((p) => p.canHandle(config))

    if (provider) {
      this.activeProvider = provider
      console.log(`[UpdateProviderManager] Selected provider: ${provider.name}`)
      return provider
    }

    console.warn(`[UpdateProviderManager] No provider found for config:`, config)
    return null
  }

  // 检查更新
  async checkUpdate(
    channel: AppPreviewChannel,
    config?: UpdateSourceConfig
  ): Promise<UpdateCheckResult> {
    try {
      // 使用指定的配置或当前激活的Provider
      let provider: UpdateProvider | null = null

      if (config) {
        const selectedProvider = this.selectProvider(config)
        if (selectedProvider) {
          provider = selectedProvider
        }
      } else if (this.activeProvider) {
        provider = this.activeProvider
      } else {
        // 使用默认的GitHub Provider
        const githubProvider = this.providers.find((p) => p.type === UpdateProviderType.GITHUB)
        if (githubProvider) {
          provider = githubProvider
          this.activeProvider = githubProvider
        }
      }

      if (!provider) {
        throw new Error('No update provider available')
      }

      console.log(`[UpdateProviderManager] Checking updates with provider: ${provider.name}`)

      const release = await provider.fetchLatestRelease(channel)

      return {
        hasUpdate: true,
        release,
        source: provider.name
      }
    } catch (error) {
      console.error('[UpdateProviderManager] Update check failed:', error)

      let errorMessage = 'Unknown error occurred'
      let source = 'Unknown'

      if (error instanceof Error) {
        errorMessage = error.message
      }

      if (this.activeProvider) {
        source = this.activeProvider.name
      }

      return {
        hasUpdate: false,
        error: errorMessage,
        source
      }
    }
  }

  // 获取所有可用的Provider
  getAvailableProviders(): UpdateProvider[] {
    return [...this.providers]
  }

  // 获取自定义Provider列表
  getCustomProviders(): CustomUpdateProvider[] {
    return Array.from(this.customProviders.values())
  }

  // 获取当前激活的Provider
  getActiveProvider(): UpdateProvider | null {
    return this.activeProvider
  }

  // 检查Provider健康状态
  async checkProviderHealth(provider: UpdateProvider): Promise<boolean> {
    try {
      if (provider.healthCheck) {
        return await provider.healthCheck()
      }
      return true
    } catch (error) {
      console.error(`[UpdateProviderManager] Health check failed for ${provider.name}:`, error)
      return false
    }
  }

  // 检查所有Provider的健康状态
  async checkAllProvidersHealth(): Promise<Map<string, boolean>> {
    const healthStatus = new Map<string, boolean>()

    for (const provider of this.providers) {
      const isHealthy = await this.checkProviderHealth(provider)
      healthStatus.set(provider.name, isHealthy)
    }

    return healthStatus
  }

  // 获取推荐的Provider
  getRecommendedProvider(): UpdateProvider | null {
    // 优先级：GitHub > Custom > Official
    const githubProvider = this.providers.find((p) => p.type === UpdateProviderType.GITHUB)
    if (githubProvider) {
      return githubProvider
    }

    const customProviders = this.getCustomProviders()
    if (customProviders.length > 0) {
      return customProviders[0]
    }

    const officialProvider = this.providers.find((p) => p.type === UpdateProviderType.OFFICIAL)
    return officialProvider || null
  }

  // 验证自定义Provider配置
  validateCustomProviderConfig(config: CustomUpdateConfig): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!config.name || config.name.trim() === '') {
      errors.push('Provider name is required')
    }

    if (!config.url || config.url.trim() === '') {
      errors.push('API URL is required')
    } else {
      try {
        new URL(config.url)
      } catch {
        errors.push('Invalid API URL format')
      }
    }

    if (!config.apiFormat || !['github', 'custom'].includes(config.apiFormat)) {
      errors.push('API format must be either "github" or "custom"')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 测试自定义Provider
  async testCustomProvider(config: CustomUpdateConfig): Promise<{
    success: boolean
    message: string
    provider?: CustomUpdateProvider
  }> {
    const validation = this.validateCustomProviderConfig(config)

    if (!validation.valid) {
      return {
        success: false,
        message: `Configuration validation failed: ${validation.errors.join(', ')}`
      }
    }

    try {
      const provider = new CustomUpdateProvider(config)
      const testResult = await provider.testConnection()

      if (testResult.success) {
        return {
          success: true,
          message: testResult.message,
          provider
        }
      } else {
        return {
          success: false,
          message: testResult.message
        }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  // 重置管理器状态
  reset(): void {
    this.activeProvider = null
    this.customProviders.clear()
    this.providers = []
    this.registerDefaultProviders()
  }

  // 获取管理器状态
  getStatus(): {
    totalProviders: number
    customProviders: number
    activeProvider: string | null
    availableTypes: string[]
  } {
    return {
      totalProviders: this.providers.length,
      customProviders: this.customProviders.size,
      activeProvider: this.activeProvider?.name || null,
      availableTypes: this.providers.map((p) => p.type)
    }
  }
}
