/**
 * Model pricing on the models.dev catalog: which price applies to a `(channel, model)` pair, and
 * the estimated cost of one call.
 *
 * Parent design §2.3–§2.4 (`.trellis/tasks/10-03-intelligence-audit-rebuild/design.md`).
 *
 * Import rule: this module reads live channel configs through `intelligence-sdk`, and the SDK
 * statically imports the audit logger. Neither the SDK nor the logger (nor anything they import
 * statically) may import `pricing/**` statically — the logger reaches pricing through a dynamic
 * `import()`. A static edge would close the cycle logger → pricing → sdk → logger, which shows up
 * as a boot-time "Cannot access … before initialization", not as a type error.
 *
 * Known transitional limitation: until the usage-ledger task records the selected channel's config
 * id in every audit row (R-A4), Nexus rows carry the Nexus server's provider id. That id matches no
 * local channel, so such rows fall through to model-family pricing in USD instead of `credits`.
 * Rows written after R-A4 carry `tuff-nexus-default` and resolve as `credits`.
 */
import type {
  CompactCatalog,
  CompactCatalogModel,
  CompactCatalogProvider
} from './models-dev-catalog'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { isNexusManagedProvider } from '@talex-touch/utils/intelligence/nexus-provider'
import { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import { getMainConfig, isMainStorageReady } from '../../storage'
import { getIntelligenceProviderManager } from '../intelligence-sdk'
import {
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_PROVIDER_ID,
  PI_CLI_PROVIDER_ID
} from '../providers/pi-cli-runtime'
import { getLoadedPricingCatalog } from './models-dev-catalog'
import {
  CHANNEL_TYPE_CATALOG_PROVIDERS,
  MODEL_FAMILY_CATALOG_PROVIDERS,
  SILICONFLOW_CHANNEL_TYPE,
  SILICONFLOW_CN_CATALOG_PROVIDER,
  SILICONFLOW_DEFAULT_HOST,
  SILICONFLOW_GLOBAL_CATALOG_PROVIDER
} from './pricing-provider-map'

/**
 * - `priced`: models.dev lists a non-zero input or output price.
 * - `free`: models.dev lists the model at 0 / 0.
 * - `local`: runs on this machine (local channels, system OCR, local CLIs).
 * - `credits`: billed in Nexus credits, which are not converted to USD.
 * - `unpriced`: no catalog, no matching provider or model, or a listed model without a price.
 */
export type PricingStatus = 'priced' | 'free' | 'local' | 'credits' | 'unpriced'

export type PricingResolution = 'channel-type' | 'base-url' | 'model-family'

export interface ModelPricing {
  status: PricingStatus
  resolvedVia: PricingResolution | null
  catalogProvider: string | null
  catalogModel: string | null
  /** USD per 1M input tokens. */
  inputPerMTokens: number | null
  /** USD per 1M output tokens. */
  outputPerMTokens: number | null
  contextTokens: number | null
  outputLimitTokens: number | null
}

export interface ModelPricingInput {
  /** The audit row's `provider`: a channel config id, or a channel type on older rows. */
  providerId: string
  model: string
}

/** The channel fields pricing reads. Never carries credentials. */
export interface PricingChannel {
  id: string
  type: string | null
  baseUrl: string | null
  metadata: Record<string, unknown> | null
}

export type PricingChannelLookup = (providerId: string) => PricingChannel | undefined

export interface ResolveModelPricingOptions {
  /** Defaults to the catalog in memory; `null` resolves as if none had been downloaded. */
  catalog?: CompactCatalog | null
  /** Defaults to the live provider manager, then the persisted channel list. */
  lookupChannel?: PricingChannelLookup
}

export interface CostEstimateInput extends ModelPricingInput {
  usage?: { promptTokens?: number; completionTokens?: number; cost?: number } | null
  /** An explicit cost wins over everything else. */
  estimatedCost?: number | null
}

/**
 * Mirrors `INTERNAL_SYSTEM_OCR_PROVIDER_ID` in `intelligence-config.ts`. Not imported: several
 * suites mock that module without the constant, and the logger loads this module during flushes.
 * `model-pricing.test.ts` pins the two values together.
 */
export const SYSTEM_OCR_PROVIDER_ID = 'local-system-ocr'

/** Runtime-injected channels that always execute on this machine. */
const LOCAL_RUNTIME_PROVIDER_IDS: ReadonlySet<string> = new Set([
  SYSTEM_OCR_PROVIDER_ID,
  PI_CLI_PROVIDER_ID,
  OMP_CLI_PROVIDER_ID,
  CODEX_CLI_PROVIDER_ID,
  CLAUDE_CLI_PROVIDER_ID
])

/** Older audit rows store the channel type in `provider` instead of a channel id. */
const KNOWN_CHANNEL_TYPES: ReadonlySet<string> = new Set(Object.values(IntelligenceProviderType))

const DATE_SUFFIX = /-(?:\d{4}-\d{2}-\d{2}|\d{8})$/
const LATEST_SUFFIX = /:latest$/
const MAX_MEMO_ENTRIES = 2048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function emptyPricing(status: PricingStatus): ModelPricing {
  return {
    status,
    resolvedVia: null,
    catalogProvider: null,
    catalogModel: null,
    inputPerMTokens: null,
    outputPerMTokens: null,
    contextTokens: null,
    outputLimitTokens: null
  }
}

// ── Channel lookup ──────────────────────────────────────────────────────────────────────────────

function toPricingChannel(config: unknown): PricingChannel | undefined {
  if (!isRecord(config) || typeof config.id !== 'string') return undefined
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
  return {
    id: config.id,
    type: typeof config.type === 'string' ? config.type : null,
    baseUrl: baseUrl || null,
    metadata: isRecord(config.metadata) ? config.metadata : null
  }
}

function readRuntimeChannel(providerId: string): unknown {
  try {
    return getIntelligenceProviderManager().get(providerId)?.getConfig()
  } catch {
    // The manager is not injected yet (early start, isolated tests): use the persisted list.
    return undefined
  }
}

function readPersistedChannel(providerId: string): unknown {
  try {
    if (!isMainStorageReady()) return undefined
    const stored: unknown = getMainConfig(StorageList.IntelligenceConfig)
    const providers = isRecord(stored) && Array.isArray(stored.providers) ? stored.providers : []
    return providers.find((provider: unknown) => isRecord(provider) && provider.id === providerId)
  } catch {
    return undefined
  }
}

function lookupPricingChannel(providerId: string): PricingChannel | undefined {
  return (
    toPricingChannel(readRuntimeChannel(providerId)) ??
    toPricingChannel(readPersistedChannel(providerId))
  )
}

function channelType(providerId: string, channel: PricingChannel | undefined): string | null {
  if (channel) return channel.type
  return KNOWN_CHANNEL_TYPES.has(providerId) ? providerId : null
}

function classifyChannel(
  providerId: string,
  channel: PricingChannel | undefined
): 'credits' | 'local' | null {
  if (isNexusManagedProvider(channel ?? { id: providerId })) return 'credits'
  if (LOCAL_RUNTIME_PROVIDER_IDS.has(providerId)) return 'local'
  return channelType(providerId, channel) === IntelligenceProviderType.LOCAL ? 'local' : null
}

// ── Catalog provider selection ──────────────────────────────────────────────────────────────────

interface ApiBase {
  /** Lower-cased host with any non-default port, `www.` removed. */
  host: string
  hostname: string
  segments: string[]
}

function parseApiBase(url: string | null | undefined): ApiBase | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const normalize = (value: string): string => value.toLowerCase().replace(/^www\./, '')
  return {
    host: normalize(parsed.host),
    hostname: normalize(parsed.hostname),
    segments: parsed.pathname.split('/').filter(Boolean)
  }
}

interface HostCandidate {
  providerId: string
  segments: string[]
}

const hostIndexCache = new WeakMap<object, Map<string, HostCandidate[]>>()

function hostIndex(catalog: CompactCatalog): Map<string, HostCandidate[]> {
  const cached = hostIndexCache.get(catalog.providers)
  if (cached) return cached
  const index = new Map<string, HostCandidate[]>()
  for (const [providerId, provider] of Object.entries(catalog.providers)) {
    const api = parseApiBase(provider.api)
    if (!api) continue
    const candidates = index.get(api.host) ?? []
    candidates.push({ providerId, segments: api.segments })
    index.set(api.host, candidates)
  }
  hostIndexCache.set(catalog.providers, index)
  return index
}

function isPathPrefix(prefix: string[], path: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])
}

/**
 * Exact host (with port) match against each provider's `api`. Several providers can share a host
 * — `open.bigmodel.cn` serves both `zhipuai-coding-plan` (priced at 0) and `zhipuai`, in that
 * catalog order — so the longest `api` path that prefixes the channel's path wins, and only a
 * remaining tie falls back to catalog order.
 */
function matchProviderByBaseUrl(catalog: CompactCatalog, baseUrl: string | null): string | null {
  const target = parseApiBase(baseUrl)
  if (!target) return null
  const candidates = hostIndex(catalog).get(target.host)
  if (!candidates || candidates.length === 0) return null
  let best: HostCandidate | null = null
  for (const candidate of candidates) {
    if (!isPathPrefix(candidate.segments, target.segments)) continue
    if (!best || candidate.segments.length > best.segments.length) best = candidate
  }
  return (best ?? candidates[0])?.providerId ?? null
}

interface CatalogTarget {
  providerId: string
  via: PricingResolution
}

function selectCatalogProvider(
  providerId: string,
  channel: PricingChannel | undefined,
  catalog: CompactCatalog
): CatalogTarget | null {
  const type = channelType(providerId, channel)
  if (!type) return null
  if (type === SILICONFLOW_CHANNEL_TYPE) {
    const hostname = parseApiBase(channel?.baseUrl)?.hostname ?? SILICONFLOW_DEFAULT_HOST
    return {
      providerId: hostname.endsWith('.cn')
        ? SILICONFLOW_CN_CATALOG_PROVIDER
        : SILICONFLOW_GLOBAL_CATALOG_PROVIDER,
      via: 'channel-type'
    }
  }
  if (Object.hasOwn(CHANNEL_TYPE_CATALOG_PROVIDERS, type)) {
    return { providerId: CHANNEL_TYPE_CATALOG_PROVIDERS[type], via: 'channel-type' }
  }
  const matched = matchProviderByBaseUrl(catalog, channel?.baseUrl ?? null)
  return matched ? { providerId: matched, via: 'base-url' } : null
}

// ── Model lookup ────────────────────────────────────────────────────────────────────────────────

interface CatalogHit {
  providerId: string
  modelId: string
  model: CompactCatalogModel
}

const lowerCaseIndexCache = new WeakMap<object, Map<string, string>>()

function lowerCaseIndex(provider: CompactCatalogProvider): Map<string, string> {
  const cached = lowerCaseIndexCache.get(provider.models)
  if (cached) return cached
  const index = new Map<string, string>()
  for (const modelId of Object.keys(provider.models)) {
    const key = modelId.toLowerCase()
    if (!index.has(key)) index.set(key, modelId)
  }
  lowerCaseIndexCache.set(provider.models, index)
  return index
}

function withoutOrg(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf('/') + 1)
}

/** Case-insensitive forms after the exact id: as is, without `org/`, without a date, without `:latest`. */
function relaxedModelIds(model: string): string[] {
  const lowered = model.toLowerCase()
  const withoutOrgPrefix = withoutOrg(lowered)
  const withoutDate = withoutOrgPrefix.replace(DATE_SUFFIX, '')
  const withoutLatest = withoutDate.replace(LATEST_SUFFIX, '')
  return [...new Set([lowered, withoutOrgPrefix, withoutDate, withoutLatest])].filter(Boolean)
}

function findCatalogModel(
  catalog: CompactCatalog,
  catalogProviderId: string,
  model: string
): CatalogHit | null {
  if (!Object.hasOwn(catalog.providers, catalogProviderId)) return null
  const provider = catalog.providers[catalogProviderId]
  if (Object.hasOwn(provider.models, model)) {
    return { providerId: catalogProviderId, modelId: model, model: provider.models[model] }
  }
  const index = lowerCaseIndex(provider)
  for (const candidate of relaxedModelIds(model)) {
    const modelId = index.get(candidate)
    if (modelId !== undefined) {
      return { providerId: catalogProviderId, modelId, model: provider.models[modelId] }
    }
  }
  return null
}

function matchModelFamily(model: string): string | null {
  const name = withoutOrg(model.toLowerCase())
  for (const rule of MODEL_FAMILY_CATALOG_PROVIDERS) {
    if (rule.prefixes.some((prefix) => name.startsWith(prefix))) return rule.provider
  }
  return null
}

function pricingFromHit(hit: CatalogHit, via: PricingResolution): ModelPricing {
  const { model } = hit
  const input = finiteOrNull(model.input)
  const output = finiteOrNull(model.output)
  const status: PricingStatus = !model.priced
    ? 'unpriced'
    : (input ?? 0) === 0 && (output ?? 0) === 0
      ? 'free'
      : 'priced'
  return {
    status,
    resolvedVia: via,
    catalogProvider: hit.providerId,
    catalogModel: hit.modelId,
    inputPerMTokens: input,
    outputPerMTokens: output,
    contextTokens: finiteOrNull(model.context),
    outputLimitTokens: finiteOrNull(model.outputLimit)
  }
}

function resolveFromCatalog(
  providerId: string,
  model: string,
  channel: PricingChannel | undefined,
  catalog: CompactCatalog
): ModelPricing {
  const target = selectCatalogProvider(providerId, channel, catalog)
  if (target) {
    const hit = findCatalogModel(catalog, target.providerId, model)
    if (hit) return pricingFromHit(hit, target.via)
  }
  // Only the maker's own listing: never a reseller's price, never a fuzzy match.
  const family = matchModelFamily(model)
  if (family && family !== target?.providerId) {
    const hit = findCatalogModel(catalog, family, model)
    if (hit) return pricingFromHit(hit, 'model-family')
  }
  return emptyPricing('unpriced')
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────────

let memoCatalogSha: string | null = null
const memo = new Map<string, ModelPricing>()

/**
 * Resolves which models.dev price applies to one channel and model (parent design §2.3):
 * Nexus → `credits`, local → `local`; otherwise the channel type's provider (or, for custom
 * channels, the provider whose API host the base URL points at), then the model maker's provider;
 * anything else is `unpriced`. Synchronous: reads the catalog already in memory, so callers that
 * need it should `await loadPricingCatalog()` first.
 *
 * Results are memoized per catalog hash, channel id, model and channel type/base URL (so editing a
 * channel is not hidden by the memo), and returned frozen.
 */
export function resolveModelPricing(
  input: ModelPricingInput,
  options: ResolveModelPricingOptions = {}
): ModelPricing {
  const providerId = typeof input.providerId === 'string' ? input.providerId : ''
  const model = typeof input.model === 'string' ? input.model : ''
  const lookup = options.lookupChannel ?? lookupPricingChannel
  let channel: PricingChannel | undefined
  try {
    channel = providerId ? lookup(providerId) : undefined
  } catch {
    channel = undefined
  }

  const category = classifyChannel(providerId, channel)
  if (category) return emptyPricing(category)

  const catalog = options.catalog === undefined ? getLoadedPricingCatalog() : options.catalog
  if (!catalog || !model) return emptyPricing('unpriced')

  if (memoCatalogSha !== catalog.sha256) {
    memo.clear()
    memoCatalogSha = catalog.sha256
  }
  const key = JSON.stringify([providerId, model, channel?.type ?? null, channel?.baseUrl ?? null])
  const cached = memo.get(key)
  if (cached) return cached

  const resolved = Object.freeze(resolveFromCatalog(providerId, model, channel, catalog))
  if (memo.size >= MAX_MEMO_ENTRIES) memo.clear()
  memo.set(key, resolved)
  return resolved
}

function roundUsd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(6)) : 0
}

function tokenCount(value: unknown): number {
  const count = finiteOrNull(value)
  return count !== null && count > 0 ? count : 0
}

/**
 * Estimated cost of one call in USD, rounded to 6 decimals (parent design §2.4):
 *
 * 1. an explicit `estimatedCost`;
 * 2. the cost the provider reported (`usage.cost` — Pi CLI, local runtimes);
 * 3. `(promptTokens × input + completionTokens × output) / 1e6` when the model resolves `priced`;
 * 4. otherwise 0 — `free`, `local`, `credits` and `unpriced` alike.
 *
 * Base prices only: usage carries no cache, reasoning or audio token split, and tiered or
 * long-context prices are not applied.
 */
export function estimateCostUsd(input: CostEstimateInput, pricing?: ModelPricing): number {
  const explicit = finiteOrNull(input.estimatedCost)
  if (explicit !== null) return roundUsd(explicit)
  const reported = finiteOrNull(input.usage?.cost)
  if (reported !== null) return roundUsd(reported)

  const resolved = pricing ?? resolveModelPricing(input)
  if (resolved.status !== 'priced') return 0
  const prompt = tokenCount(input.usage?.promptTokens)
  const completion = tokenCount(input.usage?.completionTokens)
  return roundUsd(
    (prompt * (resolved.inputPerMTokens ?? 0) + completion * (resolved.outputPerMTokens ?? 0)) /
      1_000_000
  )
}
