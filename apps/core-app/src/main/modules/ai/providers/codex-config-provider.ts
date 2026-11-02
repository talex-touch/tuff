import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { parseConfig, parseModelProviders } from '../ai-import-config-parser'
import type { IntelligenceProvider } from '../runtime/base-provider'
import {
  createNetworkServiceFetch,
  type OpenAiClientFetch,
  OpenAiCompatibleLangChainProvider
} from './langchain-openai-compatible-provider'
import { codexDir } from './pi-model-catalog'

export const CODEX_CONFIG_PROVIDER_ID = 'codex-config'

/**
 * The model provider `~/.codex/config.toml` activates, described the way the Codex CLI would call
 * it: same base URL, wire API and headers, without the CLI process.
 */
export function buildCodexConfigProviderConfig(content: string): IntelligenceProviderConfig | null {
  const parsed = parseConfig(content, '.toml')
  if (!parsed) return null
  const active = parseModelProviders(parsed).find(
    (provider) => provider.source === 'codex' && provider.baseUrl && provider.defaultModel
  )
  if (!active?.baseUrl || !active.defaultModel) return null
  return {
    id: CODEX_CONFIG_PROVIDER_ID,
    type: IntelligenceProviderType.CUSTOM,
    name: active.name,
    enabled: true,
    priority: 5,
    apiKey: active.apiKey,
    baseUrl: active.baseUrl,
    models: active.models.map((model) => ({ id: model.id, alias: model.name })),
    defaultModel: active.defaultModel,
    timeout: 120000,
    capabilities: ['text.chat'],
    metadata: {
      headers: active.headers,
      ...(active.api === 'openai-responses' ? { transport: 'responses' } : {})
    }
  }
}

export function withExtraHeaders(
  base: OpenAiClientFetch,
  extra: Record<string, string>
): OpenAiClientFetch {
  const entries = Object.entries(extra)
  if (entries.length === 0) return base
  return (url, init) => {
    const headers = new Headers(init?.headers)
    for (const [name, value] of entries) {
      if (!headers.has(name)) headers.set(name, value)
    }
    return base(url, { ...init, headers })
  }
}

export class CodexConfigProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.CUSTOM
  protected readonly defaultBaseUrl = 'https://api.openai.com/v1'
  protected readonly defaultChatModel = 'gpt-4o-mini'
  /** The Codex config's endpoint is a relay that answers without the key the SDK asks for. */
  protected readonly requireApiKey = false

  protected override resolveFetch(): OpenAiClientFetch {
    const headers = this.config.metadata?.headers
    return withExtraHeaders(
      createNetworkServiceFetch(),
      headers && typeof headers === 'object' ? (headers as Record<string, string>) : {}
    )
  }
}

let cachedProvider: { signature: string; provider: IntelligenceProvider | null } | null = null

/** The provider for the Codex model config as it is on disk now; rebuilt when the file changes. */
export function resolveCodexConfigProvider(): IntelligenceProvider | null {
  const path = join(codexDir(), 'config.toml')
  const signature = configSignature(path)
  if (cachedProvider?.signature === signature) return cachedProvider.provider
  cachedProvider = { signature, provider: loadCodexConfigProvider(path) }
  return cachedProvider.provider
}

function configSignature(path: string): string {
  try {
    const stat = statSync(path)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return 'missing'
  }
}

function loadCodexConfigProvider(path: string): IntelligenceProvider | null {
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const config = buildCodexConfigProviderConfig(content)
  return config ? new CodexConfigProvider(config) : null
}
