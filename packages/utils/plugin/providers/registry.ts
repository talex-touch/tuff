import type { PluginInstallRequest, PluginInstallResult, PluginProvider, PluginProviderContext } from './types'
import { defaultRiskPromptHandler } from '../risk'

class ProviderRegistry {
  private providers: PluginProvider[] = []

  register(provider: PluginProvider): void {
    if (this.providers.some(item => item.type === provider.type)) {
      throw new Error(`Plugin provider '${provider.type}' already registered`)
    }
    this.providers.push(provider)
  }

  unregister(type: PluginProvider['type']): void {
    this.providers = this.providers.filter(item => item.type !== type)
  }

  clear(): void {
    this.providers = []
  }

  resolve(request: PluginInstallRequest): PluginProvider | undefined {
    return this.providers.find(provider => provider.canHandle(request))
  }

  async install(
    request: PluginInstallRequest,
    context: PluginProviderContext = {},
  ): Promise<PluginInstallResult | undefined> {
    const provider = this.resolve(request)
    if (!provider)
      return undefined

    const composedContext: PluginProviderContext = {
      riskPrompt: defaultRiskPromptHandler,
      ...context,
    }

    if (!composedContext.riskPrompt) {
      composedContext.riskPrompt = defaultRiskPromptHandler
    }

    return provider.install(request, composedContext)
  }
}

export const pluginProviderRegistry = new ProviderRegistry()
export type { PluginProvider } from './types'
