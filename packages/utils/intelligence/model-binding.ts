/**
 * Model bindings — the one resolution of `(providerId, modelId)` that Settings, the Home picker,
 * the Agent model bridge and Main's provider adapters all read.
 *
 * Storage is `IntelligenceProviderConfig.models: IntelligenceModelBinding[]`: a stable wire id plus
 * optional alias, limits with provenance, thinking ladder/protocol/default and an image override.
 * The rules that turn a binding and a catalog record into effective values are PI-Desktop's own
 * (`@talex-touch/pi-desktop-reuse`, LGPL-3.0, pinned 3b036cc): limit provenance
 * (`effectiveContextWindow` / `effectiveMaxTokens`), the image override (`bindingSupportsImages`),
 * the published thinking ladder and the default-level legality check. What is Tuff's own is kept
 * conservative on purpose: an unknown model claims no window, no reasoning and no image input, and
 * a configured default only seeds a NEW session preference — never Tuff's `auto`.
 */
import type {
  ModelInfo,
  SessionThinkingLevel,
  ThinkingLevel,
} from '@talex-touch/pi-desktop-reuse/types/models'
import type {
  IntelligenceEffectiveModel,
  IntelligenceEffectiveModelLimit,
  IntelligenceModelBinding,
  IntelligenceModelLimitSource,
  IntelligenceProviderConfig,
  IntelligenceSessionThinkingLevel,
  IntelligenceThinkingLevel,
  IntelligenceThinkingProtocol,
} from '../types/intelligence'
import type { ReasoningEffortSetting } from './reasoning-effort'
import {
  bindingSupportsImages,
  effectiveContextWindow,
  effectiveMaxTokens,
  sortThinkingLevels,
} from '@talex-touch/pi-desktop-reuse/model-catalog'
import {
  bindingDefaultThinkingMenuLevels,
  isSessionThinkingLevel,
  publishedThinkingLevels,
} from '@talex-touch/pi-desktop-reuse/thinking-levels'
import {
  modelWireIdsEqual,
  THINKING_LEVELS,
  THINKING_PROTOCOLS,
} from '@talex-touch/pi-desktop-reuse/types/models'
import { TUFF_NEXUS_PROVIDER_ID, TUFF_NEXUS_PROVIDER_ORIGIN } from './nexus-provider'
import { REASONING_CLI_ROUTES, resolveReasoningEffortSupport } from './reasoning-effort'

export type { IntelligenceEffectiveModel, IntelligenceModelBinding }

/** Longest id or alias a binding keeps; anything longer is not a model name. */
const MAX_MODEL_TEXT = 200
/** Largest token count accepted as a limit (10M); anything past it is a typo, not a model. */
const MAX_TOKEN_LIMIT = 10_000_000

/**
 * A model record a catalog Main actually reads publishes (today: the local `pi` / `omp` CLI
 * catalogues). Only these capability fields cross the boundary; nothing credential-bearing does.
 */
export interface IntelligenceModelCatalogEntry {
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
  thinkingLevelMap?: Partial<Record<IntelligenceThinkingLevel, string | null>>
  thinkingProtocol?: IntelligenceThinkingProtocol
  /** Input modalities, e.g. `['text', 'image']`; absent when the catalog does not say. */
  input?: readonly string[]
}

/**
 * What a provider adapter really does with a request. A capability a binding claims but the
 * adapter cannot transport is reported, never silently honoured.
 */
export interface IntelligenceModelAdapterTraits {
  /** The adapter transports chat image attachments. */
  imageInput: boolean
  /**
   * The far end checks image input itself (a local CLI or Tuff Nexus resolves the model it runs),
   * so an unknown model may still be sent images; a direct API adapter needs an explicit yes.
   */
  imageInputSelfChecked: boolean
  /** The adapter sends the output cap with the request. */
  outputCap: boolean
}

type ProviderIdentity = Pick<IntelligenceProviderConfig, 'id' | 'type' | 'metadata'>

function originOf(provider: ProviderIdentity): string | undefined {
  const origin = provider.metadata?.origin
  return typeof origin === 'string' ? origin : undefined
}

/**
 * The adapter Main builds for a provider config (`provider-factory.ts`): Nexus, a local agent CLI,
 * Ollama/local, or one of the LangChain API adapters.
 */
export function modelAdapterTraits(provider: ProviderIdentity): IntelligenceModelAdapterTraits {
  const origin = originOf(provider)
  if (provider.id === TUFF_NEXUS_PROVIDER_ID || origin === TUFF_NEXUS_PROVIDER_ORIGIN)
    return { imageInput: true, imageInputSelfChecked: true, outputCap: true }
  if (provider.id === REASONING_CLI_ROUTES.claude.id || origin === REASONING_CLI_ROUTES.claude.origin)
    return { imageInput: false, imageInputSelfChecked: false, outputCap: false }
  for (const route of [REASONING_CLI_ROUTES.pi, REASONING_CLI_ROUTES.omp, REASONING_CLI_ROUTES.codex]) {
    if (provider.id === route.id || origin === route.origin)
      return { imageInput: true, imageInputSelfChecked: true, outputCap: false }
  }
  switch (String(provider.type)) {
    case 'openai':
    case 'anthropic':
    case 'deepseek':
    case 'siliconflow':
    case 'custom':
      return { imageInput: true, imageInputSelfChecked: false, outputCap: true }
    // Ollama's native chat endpoint is sent text only.
    default:
      return { imageInput: false, imageInputSelfChecked: false, outputCap: true }
  }
}

function boundedText(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const text = value.trim()
  return text && text.length <= MAX_MODEL_TEXT ? text : undefined
}

function tokenLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= MAX_TOKEN_LIMIT
    ? Math.round(value)
    : undefined
}

function limitSource(value: unknown): IntelligenceModelLimitSource | undefined {
  return value === 'catalog' || value === 'user' ? value : undefined
}

function isThinkingLevel(value: unknown): value is IntelligenceThinkingLevel {
  return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value)
}

/**
 * One stored entry as a binding, or `null` when it names no model. A legacy string id becomes a
 * bare binding — nothing about it was known, so nothing is invented. A limit stored without its
 * provenance keeps its value as the user's (PI-Desktop's rule for older records).
 */
export function normalizeModelBinding(value: unknown): IntelligenceModelBinding | null {
  if (typeof value === 'string') {
    const id = boundedText(value)
    return id ? { id } : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as Record<string, unknown>
  const id = boundedText(record.id)
  if (!id)
    return null
  const binding: IntelligenceModelBinding = { id }
  const alias = boundedText(record.alias)
  if (alias && alias !== id)
    binding.alias = alias
  const contextWindow = tokenLimit(record.contextWindow)
  if (contextWindow !== undefined) {
    binding.contextWindow = contextWindow
    binding.contextWindowSource = limitSource(record.contextWindowSource) ?? 'user'
  }
  const maxTokens = tokenLimit(record.maxTokens)
  if (maxTokens !== undefined) {
    binding.maxTokens = maxTokens
    binding.maxTokensSource = limitSource(record.maxTokensSource) ?? 'user'
  }
  if (Array.isArray(record.thinkingLevels))
    binding.thinkingLevels = sortThinkingLevels(record.thinkingLevels.filter(isThinkingLevel))
  if (record.defaultThinkingLevel === null) {
    binding.defaultThinkingLevel = null
  }
  else if (isSessionThinkingLevel(record.defaultThinkingLevel)) {
    binding.defaultThinkingLevel = record.defaultThinkingLevel
  }
  if ((THINKING_PROTOCOLS as readonly unknown[]).includes(record.thinkingProtocol))
    binding.thinkingProtocol = record.thinkingProtocol as IntelligenceThinkingProtocol
  if (typeof record.supportsImages === 'boolean')
    binding.supportsImages = record.supportsImages
  return binding
}

/**
 * A stored `models` value as bindings: legacy string lists, bindings, or a mix, in their stored
 * order, first entry per id kept. Anything that is not a list is no models.
 */
export function normalizeModelBindings(values: unknown): IntelligenceModelBinding[] {
  if (!Array.isArray(values))
    return []
  const seen = new Set<string>()
  const bindings: IntelligenceModelBinding[] = []
  for (const value of values) {
    const binding = normalizeModelBinding(value)
    if (!binding || seen.has(binding.id))
      continue
    seen.add(binding.id)
    bindings.push(binding)
  }
  return bindings
}

/** Whether a stored `models` value still needs the one-time migration to bindings. */
export function needsModelBindingMigration(values: unknown): boolean {
  if (values === undefined)
    return false
  if (!Array.isArray(values))
    return true
  const normalized = normalizeModelBindings(values)
  return normalized.length !== values.length
    || values.some((value, index) => JSON.stringify(value) !== JSON.stringify(normalized[index]))
}

/** The provider's model ids, in binding order. */
export function providerModelIds(provider: Pick<IntelligenceProviderConfig, 'models'>): string[] {
  return (provider.models ?? []).map(binding => binding.id)
}

/** The binding for a model id: exact first, then the same wire id ignoring case and whitespace. */
export function findModelBinding(
  provider: Pick<IntelligenceProviderConfig, 'models'>,
  modelId: string | undefined | null,
): IntelligenceModelBinding | undefined {
  if (!modelId)
    return undefined
  const bindings = provider.models ?? []
  return bindings.find(binding => binding.id === modelId)
    ?? bindings.find(binding => modelWireIdsEqual(binding.id, modelId))
}

/**
 * A refreshed endpoint/catalog listing merged into the stored bindings. Existing bindings — every
 * user value on them included — are kept exactly; only ids the list did not have are appended, as
 * bare (unknown) bindings.
 */
export function mergeDiscoveredModelIds(
  bindings: readonly IntelligenceModelBinding[],
  ids: readonly string[],
): IntelligenceModelBinding[] {
  const merged = [...bindings]
  const known = new Set(bindings.map(binding => binding.id))
  for (const raw of ids) {
    const id = boundedText(raw)
    if (!id || known.has(id))
      continue
    known.add(id)
    merged.push({ id })
  }
  return merged
}

/**
 * A provider's endpoint listing taken as the new model list: listed ids in the endpoint's order,
 * each keeping its stored binding; an unlisted model the user configured (any field beyond its id)
 * stays, appended, rather than losing the user's values to a refresh. Unlisted bare ids drop.
 */
export function replaceDiscoveredModelIds(
  bindings: readonly IntelligenceModelBinding[],
  ids: readonly string[],
): IntelligenceModelBinding[] {
  const stored = new Map(bindings.map(binding => [binding.id, binding]))
  const listed = mergeDiscoveredModelIds([], ids).map(binding => stored.get(binding.id) ?? binding)
  const listedIds = new Set(listed.map(binding => binding.id))
  const configured = bindings.filter(
    binding => !listedIds.has(binding.id) && Object.keys(binding).length > 1,
  )
  return [...listed, ...configured]
}

/** The bindings with one model's fields replaced; `undefined` in the patch clears a field. */
export function patchModelBinding(
  bindings: readonly IntelligenceModelBinding[],
  modelId: string,
  patch: Partial<Omit<IntelligenceModelBinding, 'id'>>,
): IntelligenceModelBinding[] {
  return bindings.map((binding) => {
    if (binding.id !== modelId)
      return binding
    const next: Record<string, unknown> = { ...binding, ...patch }
    for (const key of Object.keys(next)) {
      if (next[key] === undefined)
        delete next[key]
    }
    return normalizeModelBinding(next) ?? binding
  })
}

/** A catalog record in PI-Desktop's `ModelInfo` shape, so its published-value helpers apply. */
function toModelInfo(
  providerId: string,
  modelId: string,
  entry: IntelligenceModelCatalogEntry,
): ModelInfo {
  const input = entry.input?.filter(
    (modality): modality is 'text' | 'image' | 'audio' | 'video' | 'pdf' =>
      ['text', 'image', 'audio', 'video', 'pdf'].includes(modality),
  )
  return {
    modelId,
    displayName: modelId,
    providerId,
    capabilities: [],
    source: 'bundled',
    catalogSource: 'pi',
    ...(entry.reasoning !== undefined ? { reasoning: entry.reasoning } : {}),
    ...(entry.thinkingLevelMap ? { thinkingLevelMap: entry.thinkingLevelMap } : {}),
    ...(entry.thinkingProtocol ? { thinkingProtocol: entry.thinkingProtocol } : {}),
    ...(tokenLimit(entry.contextWindow) ? { contextWindow: tokenLimit(entry.contextWindow) } : {}),
    ...(tokenLimit(entry.maxTokens) ? { maxTokens: tokenLimit(entry.maxTokens) } : {}),
    ...(input ? { modalities: { input, output: ['text'] } } : {}),
  }
}

/**
 * One limit through PI-Desktop's provenance rule: a `user` value is pinned, a `catalog` value
 * follows the published record, and a value without either is unknown.
 */
function resolveLimit(
  published: number | undefined,
  configured: number | undefined,
  source: IntelligenceModelLimitSource | undefined,
  resolve: typeof effectiveContextWindow,
): IntelligenceEffectiveModelLimit {
  const value = resolve(published, configured, source)
  if (value === undefined)
    return { source: 'unknown' }
  const pinned = configured !== undefined && source !== 'catalog' && value === configured
  return { value, source: pinned ? 'user' : 'catalog' }
}

/** Tuff's composer settings are `auto` plus four levels; anything else is not a session value. */
function toReasoningSetting(level: SessionThinkingLevel): ReasoningEffortSetting | undefined {
  if (level === 'omit')
    return 'auto'
  return level === 'low' || level === 'medium' || level === 'high' || level === 'max' ? level : undefined
}

/**
 * The effective configuration of one model on one provider.
 *
 * `catalog` is the record Main read for this model, when any; the renderer receives the result
 * through `getProviderModelOptions` rather than resolving it again.
 */
export function resolveEffectiveModel(
  provider: Pick<IntelligenceProviderConfig, 'id' | 'type' | 'metadata' | 'models'>,
  modelId: string,
  catalog?: IntelligenceModelCatalogEntry | null,
): IntelligenceEffectiveModel {
  const binding = findModelBinding(provider, modelId)
  const info = catalog ? toModelInfo(provider.id, modelId, catalog) : null
  const traits = modelAdapterTraits(provider)

  const contextWindow = resolveLimit(
    info?.contextWindow,
    binding?.contextWindow,
    binding?.contextWindowSource,
    effectiveContextWindow,
  )
  const maxOutputTokens = resolveLimit(
    info?.maxTokens,
    binding?.maxTokens,
    binding?.maxTokensSource,
    effectiveMaxTokens,
  )

  // The user's ladder wins; otherwise the catalog's published ladder; otherwise the route table.
  const publishedLevels = info && (info.reasoning !== undefined || info.thinkingLevelMap)
    ? publishedThinkingLevels(info)
    : undefined
  const thinkingLevels = binding?.thinkingLevels ?? publishedLevels
  const thinkingProtocol = binding?.thinkingProtocol ?? info?.thinkingProtocol
  const support = resolveReasoningEffortSupport({
    providerType: provider.type,
    providerId: provider.id,
    origin: originOf(provider),
    model: modelId,
    ...(thinkingLevels || thinkingProtocol
      ? {
          binding: {
            ...(thinkingLevels ? { thinkingLevels } : {}),
            ...(thinkingProtocol ? { thinkingProtocol } : {}),
            source: binding?.thinkingLevels ? 'user' as const : 'catalog' as const,
          },
        }
      : {}),
  })
  // Only an explicit, still-legal default counts; PI-Desktop's "strongest level" fallback for an
  // unset default is deliberately not applied, so an unconfigured model keeps Tuff's auto.
  const storedDefault = binding?.defaultThinkingLevel
  const enabledLadder: ThinkingLevel[] = [...support.levels]
  const defaultSetting = storedDefault && support.wire
    && bindingDefaultThinkingMenuLevels(enabledLadder).includes(storedDefault)
    ? toReasoningSetting(storedDefault)
    : undefined

  const override = typeof binding?.supportsImages === 'boolean' ? binding.supportsImages : null
  const catalogKnowsImages = Boolean(info?.modalities)
  const imageState: IntelligenceEffectiveModel['imageInput']['state'] = !traits.imageInput
    ? 'unsupported'
    : override !== null || catalogKnowsImages
      ? (bindingSupportsImages({ supportsImages: override }, info) ? 'supported' : 'unsupported')
      : 'unknown'
  const imageAccepted = imageState === 'supported'
    || (imageState === 'unknown' && traits.imageInputSelfChecked)

  return {
    providerId: provider.id,
    modelId,
    ...(binding?.alias ? { alias: binding.alias } : {}),
    label: binding?.alias ?? modelId,
    contextWindow,
    maxOutputTokens: { ...maxOutputTokens, enforced: traits.outputCap },
    thinking: {
      wire: support.wire,
      levels: [...support.levels],
      ...(support.unsupported ? { unsupported: support.unsupported } : {}),
      source: support.source,
      ...(thinkingProtocol && (support.wire === 'anthropic-adaptive' || support.wire === 'anthropic-budget')
        ? { protocol: thinkingProtocol }
        : {}),
      ...(defaultSetting ? { defaultSetting } : {}),
    },
    imageInput: {
      state: imageState,
      override,
      adapter: traits.imageInput,
      accepted: imageAccepted,
    },
  }
}

/**
 * The reasoning setting a NEW session preference starts at for a visibly selected model: its
 * explicit per-model default, or `undefined` (stay on auto). Callers apply it only where no
 * session/app value was ever stored — a stored value, including an explicit `auto`, always wins.
 */
export function initialReasoningSettingForNewSession(
  binding?: Pick<IntelligenceEffectiveModel, 'thinking'> | null,
): ReasoningEffortSetting | undefined {
  return binding?.thinking.defaultSetting
}

/** The binding default choices Settings offers for a ladder: `omit` (auto) first when it reasons. */
export function bindingDefaultThinkingChoices(
  levels: readonly IntelligenceThinkingLevel[] | undefined,
): IntelligenceSessionThinkingLevel[] {
  return bindingDefaultThinkingMenuLevels(levels ? [...levels] : undefined)
    .filter(level => level === 'omit' || toReasoningSetting(level) !== undefined)
}
