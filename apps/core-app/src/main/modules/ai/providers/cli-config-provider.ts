import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { parseConfig, parseModelProviders } from '../ai-import-config-parser'
import type { IntelligenceProvider } from '../runtime/base-provider'
import { AnthropicProvider } from './anthropic-provider'
import {
  createNetworkServiceFetch,
  type OpenAiClientFetch,
  OpenAiCompatibleLangChainProvider
} from './langchain-openai-compatible-provider'
import { codexDir, ompAgentDir } from './pi-model-catalog'

export type ThirdPartyCli = 'codex' | 'claude' | 'omp'

export const CODEX_CONFIG_PROVIDER_ID = 'codex-config'
export const CLAUDE_CONFIG_PROVIDER_ID = 'claude-config'
export const OMP_CONFIG_PROVIDER_ID = 'omp-config'

/** A model endpoint read from a CLI's own config, callable without starting that CLI. */
export interface ReusedEndpoint {
  /** Reported as the run's provider, so the message meta names the endpoint that answered. */
  providerId: string
  /** The model id the endpoint expects. */
  modelId: string
  provider: IntelligenceProvider
}

export function resolveCliConfigEndpoint(
  cli: ThirdPartyCli,
  requestedModel: string | undefined
): ReusedEndpoint | null {
  if (cli === 'codex') {
    const config = buildCodexEndpointConfig(readFile(join(codexDir(), 'config.toml')))
    const modelId = requestedModel || config?.defaultModel
    return config && modelId
      ? { providerId: config.id, modelId, provider: endpointProvider(config) }
      : null
  }
  if (!requestedModel) return null
  if (cli === 'claude') {
    const config = buildClaudeEndpointConfig(
      readFile(join(claudeConfigDir(), 'settings.json')),
      requestedModel
    )
    return config
      ? { providerId: config.id, modelId: requestedModel, provider: endpointProvider(config) }
      : null
  }
  const found = buildOmpEndpoint(readOmpModelConfig(), requestedModel)
  return found
    ? {
        providerId: found.config.id,
        modelId: found.modelId,
        provider: endpointProvider(found.config)
      }
    : null
}

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** The same files, in the same order, that the OMP model catalog reads. */
const OMP_MODEL_FILES = ['models.yml', 'models.yaml', 'models.json'] as const

function readOmpModelConfig(): Record<string, unknown> | null {
  for (const name of OMP_MODEL_FILES) {
    const content = readFile(join(ompAgentDir(), name))
    const config = content === null ? null : parseConfig(content, extname(name))
    if (config) return config
  }
  return null
}

function buildCodexEndpointConfig(content: string | null): IntelligenceProviderConfig | null {
  const parsed = content ? parseConfig(content, '.toml') : null
  if (!parsed || typeof parsed.model_provider !== 'string') return null
  const activeId = `codex-${parsed.model_provider.trim()}`
  const active = parseModelProviders(parsed).find(
    (provider) => provider.source === 'codex' && provider.id === activeId
  )
  if (!active?.baseUrl) return null
  const configuredModel = typeof parsed.model === 'string' ? parsed.model.trim() : ''
  return {
    id: CODEX_CONFIG_PROVIDER_ID,
    type: IntelligenceProviderType.CUSTOM,
    name: active.name,
    enabled: true,
    priority: 5,
    apiKey: active.apiKey,
    baseUrl: active.baseUrl,
    models: active.models.map((model) => ({ id: model.id, alias: model.name })),
    defaultModel: configuredModel || undefined,
    timeout: 120000,
    capabilities: ['text.chat'],
    metadata: {
      headers: active.headers,
      ...(active.api === 'openai-responses' ? { transport: 'responses' } : {})
    }
  }
}

function buildClaudeEndpointConfig(
  content: string | null,
  model: string
): IntelligenceProviderConfig | null {
  const env = content ? parseConfig(content, '.json')?.env : undefined
  if (!env || typeof env !== 'object') return null
  const { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: token } = env as Record<
    string,
    unknown
  >
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null
  return {
    id: CLAUDE_CONFIG_PROVIDER_ID,
    type: IntelligenceProviderType.ANTHROPIC,
    name: 'Claude settings',
    enabled: true,
    priority: 5,
    apiKey: typeof token === 'string' && token.trim() ? token.trim() : undefined,
    baseUrl: baseUrl.trim(),
    models: [{ id: model }],
    defaultModel: model,
    timeout: 120000,
    capabilities: ['text.chat']
  }
}

/** OMP names a model `provider/model`; the endpoint expects the part after the first slash. */
function buildOmpEndpoint(
  modelConfig: Record<string, unknown> | null,
  requestedModel: string
): { config: IntelligenceProviderConfig; modelId: string } | null {
  const providers = modelConfig?.providers
  if (!providers || typeof providers !== 'object') return null
  const slash = requestedModel.indexOf('/')
  if (slash <= 0) return null
  const providerKey = requestedModel.slice(0, slash)
  const modelId = requestedModel.slice(slash + 1)
  const entry = (providers as Record<string, unknown>)[providerKey]
  if (!modelId || !entry || typeof entry !== 'object') return null
  const { baseUrl, api, apiKey, headers } = entry as Record<string, unknown>
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null
  const rawApi = typeof api === 'string' ? api.trim() : 'openai-completions'
  return {
    modelId,
    config: {
      id: OMP_CONFIG_PROVIDER_ID,
      type:
        rawApi === 'anthropic-messages'
          ? IntelligenceProviderType.ANTHROPIC
          : IntelligenceProviderType.CUSTOM,
      name: `OMP ${providerKey}`,
      enabled: true,
      priority: 5,
      apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined,
      baseUrl: baseUrl.trim(),
      models: [{ id: modelId }],
      defaultModel: modelId,
      timeout: 120000,
      capabilities: ['text.chat'],
      metadata: {
        headers: headers && typeof headers === 'object' ? headers : {},
        ...(rawApi === 'openai-responses' ? { transport: 'responses' } : {})
      }
    }
  }
}

function endpointProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return config.type === IntelligenceProviderType.ANTHROPIC
    ? new AnthropicProvider(config)
    : new CliConfigProvider(config)
}

export function withExtraHeaders(
  base: OpenAiClientFetch,
  extra: Record<string, string>,
  options: { replaceAuthorization?: boolean } = {}
): OpenAiClientFetch {
  const entries = Object.entries(extra)
  if (entries.length === 0) return base
  return (url, init) => {
    const headers = new Headers(init?.headers)
    for (const [name, value] of entries) {
      const replace =
        options.replaceAuthorization === true && name.toLowerCase() === 'authorization'
      if (replace || !headers.has(name)) headers.set(name, value)
    }
    return base(url, { ...init, headers })
  }
}

export class CliConfigProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.CUSTOM
  protected readonly defaultBaseUrl = 'https://api.openai.com/v1'
  protected readonly defaultChatModel = 'gpt-4o-mini'
  /** These endpoints answer without the key the SDK asks for. */
  protected readonly requireApiKey = false

  protected override resolveFetch(): OpenAiClientFetch {
    const headers = this.config.metadata?.headers
    // The SDK's placeholder bearer stands in only when no key is configured.
    return withExtraHeaders(
      createNetworkServiceFetch(),
      headers && typeof headers === 'object' ? (headers as Record<string, string>) : {},
      { replaceAuthorization: !this.config.apiKey }
    )
  }
}
