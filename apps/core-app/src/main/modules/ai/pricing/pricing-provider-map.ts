/**
 * Static maps from Tuff channels and model names to models.dev provider ids.
 *
 * Parent design §2.3 (`docs/engineering/workflow/handoffs/10-03-intelligence-audit-rebuild/design.md`), steps 2 and 4.
 * Provider ids are the top-level keys of https://models.dev/api.json, checked on 2026-10-03.
 *
 * Pricing never searches the whole catalog for a model id: the same id is listed by many resellers
 * at different prices (`gpt-4o` by 10 providers, `gemini-2.5-pro` by 15), so a price is only taken
 * from the provider these tables name, or from the one whose API host the channel points at.
 */

/** The SiliconFlow channel type: two separately priced services, told apart by the channel host. */
export const SILICONFLOW_CHANNEL_TYPE = 'siliconflow'

/** `api.siliconflow.cn` — the China service, and the built-in channel's default base URL. */
export const SILICONFLOW_CN_CATALOG_PROVIDER = 'siliconflow-cn'

/** `api.siliconflow.com` — the international service. */
export const SILICONFLOW_GLOBAL_CATALOG_PROVIDER = 'siliconflow'

/** Host assumed when a SiliconFlow channel has no base URL (`providers/siliconflow-provider.ts`). */
export const SILICONFLOW_DEFAULT_HOST = 'api.siliconflow.cn'

/**
 * Built-in channel types that always talk to one first-party API.
 *
 * `siliconflow` is resolved by host (see above); `custom` is matched by base URL instead; `local`
 * never reaches the catalog. Keys are `IntelligenceProviderType` values.
 */
export const CHANNEL_TYPE_CATALOG_PROVIDERS: Readonly<Record<string, string>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  deepseek: 'deepseek'
}

export interface ModelFamilyRule {
  /** models.dev provider id of the model's maker. */
  readonly provider: string
  /** Matched against the lower-cased model id with any `org/` path removed. */
  readonly prefixes: readonly string[]
}

/**
 * Model family → the maker's own models.dev provider, used when the channel names no provider
 * (an unknown gateway, a deleted channel) or that provider does not list the model.
 *
 * First match wins. `qwen` maps to the China service because Tuff's DashScope users are on it;
 * `kimi` / `moonshot` likewise to `moonshotai-cn`.
 */
export const MODEL_FAMILY_CATALOG_PROVIDERS: readonly ModelFamilyRule[] = [
  {
    provider: 'openai',
    prefixes: ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-', 'text-embedding-']
  },
  { provider: 'anthropic', prefixes: ['claude-'] },
  { provider: 'google', prefixes: ['gemini-'] },
  { provider: 'deepseek', prefixes: ['deepseek-'] },
  { provider: 'alibaba-cn', prefixes: ['qwen'] },
  { provider: 'zhipuai', prefixes: ['glm-'] },
  { provider: 'moonshotai-cn', prefixes: ['kimi-', 'moonshot-'] },
  { provider: 'xai', prefixes: ['grok-'] },
  { provider: 'mistral', prefixes: ['mistral-', 'codestral-'] }
]
