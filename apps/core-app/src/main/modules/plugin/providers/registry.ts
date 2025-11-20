import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginProviderContext,
  PluginProviderType,
} from '@talex-touch/utils/plugin/providers'
import type { RiskPromptHandler } from '@talex-touch/utils/plugin/risk'
import { defaultRiskPromptHandler } from '@talex-touch/utils/plugin/risk'
import { FilePluginProvider } from './file-provider'
import { GithubPluginProvider } from './github-provider'
import { createProviderLogger, providerRegistryLog } from './logger'
import { NpmPluginProvider } from './npm-provider'
import { TpexPluginProvider } from './tpex-provider'

interface ProviderEntry {
  provider: PluginProvider
  log: ReturnType<typeof createProviderLogger>
}

const registeredProviders = new Map<PluginProviderType, ProviderEntry>()
let defaultsRegistered = false

function resolveRiskPrompt(handler?: RiskPromptHandler): RiskPromptHandler {
  return handler ?? defaultRiskPromptHandler
}

export function registerProvider(provider: PluginProvider): void {
  const existing = registeredProviders.get(provider.type)
  if (existing) {
    providerRegistryLog.warn('Provider already registered, skip duplicate', {
      meta: { provider: provider.type },
    })
    return
  }

  const entry: ProviderEntry = {
    provider,
    log: createProviderLogger(provider.type),
  }

  registeredProviders.set(provider.type, entry)
  providerRegistryLog.debug('Registered plugin provider', {
    meta: { provider: provider.type },
  })
}

const DEFAULT_PROVIDER_FACTORIES: Array<() => PluginProvider> = [
  () => new GithubPluginProvider(),
  () => new NpmPluginProvider(),
  () => new TpexPluginProvider(),
  () => new FilePluginProvider(),
]

export function ensureDefaultProvidersRegistered(): void {
  if (defaultsRegistered)
    return

  for (const createProvider of DEFAULT_PROVIDER_FACTORIES) {
    const provider = createProvider()
    registerProvider(provider)
  }

  defaultsRegistered = true
}

export function getRegisteredProviders(): PluginProvider[] {
  return Array.from(registeredProviders.values(), entry => entry.provider)
}

export async function installFromRegistry(
  request: PluginInstallRequest,
  context: PluginProviderContext = {},
): Promise<PluginInstallResult | undefined> {
  ensureDefaultProvidersRegistered()

  providerRegistryLog.debug('Resolving provider for request', {
    meta: { source: request.source, hint: request.hintType },
  })

  let selected: ProviderEntry | undefined

  for (const entry of registeredProviders.values()) {
    let handled = false
    try {
      handled = entry.provider.canHandle(request)
    }
    catch (error) {
      entry.log.error('canHandle() 抛出异常', {
        meta: { source: request.source },
        error,
      })
      handled = false
    }

    entry.log.debug('Provider capability check', {
      meta: {
        source: request.source,
        handled: handled ? 'true' : 'false',
      },
    })

    if (handled) {
      selected = entry
      break
    }
  }

  if (!selected) {
    providerRegistryLog.warn('没有找到可处理该请求的插件 provider', {
      meta: { source: request.source, hint: request.hintType },
    })
    return undefined
  }

  const timer = selected.log.time('install')
  const resolvedContext: PluginProviderContext = {
    ...context,
    riskPrompt: resolveRiskPrompt(context.riskPrompt),
  }

  try {
    selected.log.info('开始安装插件资源', {
      meta: { source: request.source },
    })

    const result = await selected.provider.install(request, resolvedContext)

    selected.log.success('插件资源安装完成', {
      meta: {
        provider: selected.provider.type,
        official: result.official ? 'true' : 'false',
        filePath: result.filePath ?? 'N/A',
      },
    })

    timer.end('install')
    return result
  }
  catch (error) {
    selected.log.error('插件资源安装失败', {
      meta: {
        source: request.source,
        provider: selected.provider.type,
      },
      error,
    })
    timer.end('install', { level: 'error' as any })
    throw error
  }
}
