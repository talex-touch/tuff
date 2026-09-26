/**
 * Reasoning effort — the composer's 自动 / 低 / 中 / 高 / 极高 — from setting to wire.
 *
 * One file that the renderer, main and the Nexus server all import, because the three have to
 * agree: the renderer reads this table to decide whether the model menu's effort row is live and
 * what the pill says, main reads it to decide what each provider is sent, and Nexus reads it to map
 * the same level onto whichever upstream it routes to. A private copy on any side would let the
 * pill promise "高" on a route main then sends nothing to.
 *
 * Standalone and dependency-free, like `nexus-provider.ts`: every consumer takes it without the
 * intelligence client, and the translation helpers return plain objects instead of importing
 * LangChain.
 */
import type {
  IntelligenceReasoningEffort,
  IntelligenceReasoningEffortDecision,
  IntelligenceReasoningEffortStatus,
  IntelligenceReasoningLevel,
} from '../types/intelligence'
import { TUFF_NEXUS_PROVIDER_ID, TUFF_NEXUS_PROVIDER_ORIGIN } from './nexus-provider'

export type {
  IntelligenceReasoningEffort,
  IntelligenceReasoningEffortDecision,
  IntelligenceReasoningEffortStatus,
  IntelligenceReasoningLevel,
}

// ============================================================================
// The setting
// ============================================================================

/** The composer's choices, in menu order. `auto` sends no reasoning parameter at all. */
export const REASONING_EFFORT_SETTINGS = ['auto', 'low', 'medium', 'high', 'max'] as const
export type ReasoningEffortSetting = typeof REASONING_EFFORT_SETTINGS[number]

/**
 * Auto by default: it is the only choice under which an upgraded install keeps every route's cost,
 * latency and CLI-configured strength exactly as it was.
 */
export const DEFAULT_REASONING_EFFORT_SETTING: ReasoningEffortSetting = 'auto'

/** The levels a request can carry, weakest first. */
export const REASONING_EFFORTS: readonly IntelligenceReasoningEffort[] = ['low', 'medium', 'high', 'max']

export function normalizeReasoningEffortSetting(value: unknown): ReasoningEffortSetting {
  return typeof value === 'string' && (REASONING_EFFORT_SETTINGS as readonly string[]).includes(value)
    ? (value as ReasoningEffortSetting)
    : DEFAULT_REASONING_EFFORT_SETTING
}

/** What a request carries: a level, or `undefined` for auto and for anything unrecognised. */
export function normalizeReasoningEffort(value: unknown): IntelligenceReasoningEffort | undefined {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value)
    ? (value as IntelligenceReasoningEffort)
    : undefined
}

// ============================================================================
// Levels and decisions
// ============================================================================

/** Every level any route spells, weakest first — the order clamping walks. */
export const REASONING_LEVELS: readonly IntelligenceReasoningLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

export const REASONING_EFFORT_STATUSES: readonly IntelligenceReasoningEffortStatus[] = [
  'applied',
  'clamped',
  'unsupported-model',
  'unsupported-provider',
  'forwarded',
]

export function isReasoningLevel(value: unknown): value is IntelligenceReasoningLevel {
  return typeof value === 'string' && (REASONING_LEVELS as readonly string[]).includes(value)
}

export function isReasoningEffortStatus(value: unknown): value is IntelligenceReasoningEffortStatus {
  return typeof value === 'string' && (REASONING_EFFORT_STATUSES as readonly string[]).includes(value)
}

/**
 * A decision read off the wire (a Nexus frame) or out of storage, or `undefined` when it is not one.
 *
 * The two halves have to agree: `applied` and `clamped` are the only statuses under which something
 * was sent, so they need a level and every other status needs `null`. A record that contradicts
 * itself is dropped rather than repaired — guessing which half is wrong would put a claim in the
 * turn info that nobody made.
 */
export function normalizeReasoningEffortDecision(
  value: unknown,
): IntelligenceReasoningEffortDecision | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const record = value as Record<string, unknown>
  const requested = normalizeReasoningEffort(record.requested)
  const status = record.status
  if (!requested || !isReasoningEffortStatus(status))
    return undefined
  const applied = record.applied ?? null
  if (applied !== null && !isReasoningLevel(applied))
    return undefined
  const sent = status === 'applied' || status === 'clamped'
  if (sent !== (applied !== null))
    return undefined
  return { requested, applied, status }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * How a provider spells a level on the wire. Main hands each provider a plan and the provider only
 * translates it; which wire applies is decided here, once.
 */
export type ReasoningEffortWire =
  /** OpenAI Chat Completions `reasoning_effort`. */
  | 'openai-reasoning-effort'
  /** DeepSeek V4: `thinking: { type: 'enabled' }` plus `reasoning_effort`. */
  | 'deepseek-thinking'
  /** Anthropic adaptive thinking: `thinking: { type: 'adaptive' }` plus `output_config.effort`. */
  | 'anthropic-adaptive'
  /** Anthropic extended thinking with a token budget. */
  | 'anthropic-budget'
  /** pi / omp `--thinking <level>`; the CLI clamps to what its model offers. */
  | 'cli-thinking'
  /** Codex `-c model_reasoning_effort="<level>"`. */
  | 'codex-config'
  /** Claude Code `--effort <level>`. */
  | 'claude-effort'
  /** Tuff Nexus: the requested level is forwarded and the server maps it per upstream. */
  | 'nexus'

/**
 * Ids and `metadata.origin` markers of the four local CLI routes, which share one provider type
 * (`local`) and are told apart only by these. Owned by `pi-cli-runtime.ts` in core-app; restated
 * here because the renderer has to reach the same answer, and a core-app test pins the two
 * together.
 */
export const REASONING_CLI_ROUTES = {
  pi: { id: 'pi-cli-default', origin: 'pi-cli' },
  omp: { id: 'omp-cli', origin: 'omp-cli' },
  codex: { id: 'codex-cli', origin: 'codex-cli' },
  claude: { id: 'claude-cli', origin: 'claude-cli' },
} as const

type ReasoningRoute =
  | 'nexus'
  | keyof typeof REASONING_CLI_ROUTES
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'custom'
  | 'none'

export interface ReasoningEffortTarget {
  /** `IntelligenceProviderType` value of the provider config. */
  providerType: string
  providerId?: string
  /** `metadata.origin`, when the caller holds the provider config; the renderer has only the id. */
  origin?: string
  /** The model the provider will run. On a model-table route, absent means nothing is sent. */
  model?: string
}

function routeOf(target: ReasoningEffortTarget): ReasoningRoute {
  const { providerId, origin } = target
  if (providerId === TUFF_NEXUS_PROVIDER_ID || origin === TUFF_NEXUS_PROVIDER_ORIGIN)
    return 'nexus'
  for (const [route, identity] of Object.entries(REASONING_CLI_ROUTES)) {
    if (providerId === identity.id || origin === identity.origin)
      return route as keyof typeof REASONING_CLI_ROUTES
  }
  switch (target.providerType) {
    case 'openai':
      return 'openai'
    case 'anthropic':
      return 'anthropic'
    case 'deepseek':
      return 'deepseek'
    case 'custom':
      return 'custom'
    // SiliconFlow, Ollama and anything unknown: no parameter this code can vouch for.
    default:
      return 'none'
  }
}

interface ModelFamily {
  /** Lower-case id prefixes. The first family with a match wins, so narrower prefixes go first. */
  readonly prefixes: readonly string[]
  /** Levels the family takes, weakest first; empty for a known id that takes none. */
  readonly levels: readonly IntelligenceReasoningLevel[]
}

interface WiredModelFamily extends ModelFamily {
  readonly wire: ReasoningEffortWire
}

/**
 * OpenAI's reasoning line (served by the OpenAI provider, OpenAI-compatible endpoints and Codex),
 * from the pi-ai 0.85.1 catalogue. Anything that matches nothing — `gpt-4o`, `gpt-4.1`, a
 * fine-tune — is not a reasoning model, and sending it `reasoning_effort` is a 400.
 */
const OPENAI_FAMILIES: readonly ModelFamily[] = [
  // The chat snapshots of the line: most take no effort, and the one that does takes two.
  { prefixes: ['gpt-5.2-chat'], levels: ['medium', 'xhigh'] },
  { prefixes: ['gpt-5-chat', 'gpt-5.3-chat'], levels: [] },
  { prefixes: ['gpt-5-pro'], levels: ['high'] },
  { prefixes: ['gpt-5.2-pro', 'gpt-5.4-pro', 'gpt-5.5-pro'], levels: ['medium', 'high', 'xhigh'] },
  { prefixes: ['gpt-5.3-codex-spark'], levels: ['low', 'medium', 'high', 'xhigh'] },
  { prefixes: ['gpt-6', 'gpt-5.6'], levels: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { prefixes: ['gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.5'], levels: ['low', 'medium', 'high', 'xhigh'] },
  { prefixes: ['gpt-5.1'], levels: ['low', 'medium', 'high'] },
  { prefixes: ['gpt-5'], levels: ['minimal', 'low', 'medium', 'high'] },
  // Both predate `reasoning_effort` and reject it.
  { prefixes: ['o1-mini', 'o1-preview'], levels: [] },
  { prefixes: ['o1', 'o3', 'o4'], levels: ['low', 'medium', 'high'] },
]

/**
 * DeepSeek V4 (pi-ai catalogue). The older ids are listed on purpose: on them the model *is* the
 * level — `deepseek-reasoner` always thinks, `deepseek-chat` never does — so nothing is sent.
 */
const DEEPSEEK_FAMILIES: readonly ModelFamily[] = [
  { prefixes: ['deepseek-v4-pro'], levels: ['high', 'max'] },
  { prefixes: ['deepseek-v4'], levels: ['low', 'high', 'max'] },
  { prefixes: ['deepseek-chat', 'deepseek-reasoner'], levels: [] },
]

/**
 * Anthropic, split by how thinking is switched on (pi-ai `forceAdaptiveThinking`). Adaptive models
 * take an effort, so their levels are the effort values; the 4.5 generation takes a token budget,
 * and its levels only pick one. Older ids are left out rather than guessed at.
 */
const ANTHROPIC_FAMILIES: readonly WiredModelFamily[] = [
  {
    prefixes: ['claude-opus-4-6', 'claude-sonnet-4-6'],
    levels: ['low', 'medium', 'high', 'max'],
    wire: 'anthropic-adaptive',
  },
  {
    prefixes: ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5'],
    levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    wire: 'anthropic-adaptive',
  },
  {
    prefixes: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    levels: ['low', 'medium', 'high'],
    wire: 'anthropic-budget',
  },
]

/** What Claude Code's `--effort` accepts (2.1.280 `--help`). */
const CLAUDE_CLI_EFFORT_LEVELS: readonly IntelligenceReasoningLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * Claude Code models whose strongest level is `high`: the budget-thinking generation, by alias or by
 * id. Everything else gets the full range and Claude Code resolves it for the model.
 */
const CLAUDE_CLI_FAMILIES: readonly ModelFamily[] = [
  {
    prefixes: ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
    levels: ['low', 'medium', 'high'],
  },
]

function findFamily<F extends ModelFamily>(
  families: readonly F[],
  model: string | undefined,
): F | undefined {
  const id = model?.trim().toLowerCase()
  if (!id)
    return undefined
  return families.find(family => family.prefixes.some(prefix => id.startsWith(prefix)))
}

export interface ReasoningEffortSupport {
  /** How the route spells a level; `null` when nothing can be sent. */
  wire: ReasoningEffortWire | null
  /** Levels the model accepts, weakest first; empty whenever `wire` is `null`. */
  levels: readonly IntelligenceReasoningLevel[]
  /** Why nothing can be sent: the route never takes an effort, or this model does not. */
  unsupported?: 'provider' | 'model'
}

const UNSUPPORTED_MODEL: ReasoningEffortSupport = { wire: null, levels: [], unsupported: 'model' }
const UNSUPPORTED_PROVIDER: ReasoningEffortSupport = { wire: null, levels: [], unsupported: 'provider' }

function fromFamily(family: WiredModelFamily | undefined): ReasoningEffortSupport {
  return family && family.levels.length > 0
    ? { wire: family.wire, levels: family.levels }
    : UNSUPPORTED_MODEL
}

function withWire(
  families: readonly ModelFamily[],
  wire: ReasoningEffortWire,
): readonly WiredModelFamily[] {
  return families.map(family => ({ ...family, wire }))
}

const OPENAI_WIRED = withWire(OPENAI_FAMILIES, 'openai-reasoning-effort')
const CODEX_WIRED = withWire(OPENAI_FAMILIES, 'codex-config')
const DEEPSEEK_WIRED = withWire(DEEPSEEK_FAMILIES, 'deepseek-thinking')
/**
 * An OpenAI-compatible endpoint of the user's own: only an id that names a known family as-is. A
 * channel-prefixed id (`openai/gpt-5.5` on a gateway) is left alone, since whether the gateway
 * forwards `reasoning_effort` is exactly what this code cannot know.
 */
const CUSTOM_WIRED = [...OPENAI_WIRED, ...DEEPSEEK_WIRED]

/** What the route can take for this model — the menu's row state and the plan's input. */
export function resolveReasoningEffortSupport(target: ReasoningEffortTarget): ReasoningEffortSupport {
  switch (routeOf(target)) {
    case 'nexus':
      return { wire: 'nexus', levels: REASONING_LEVELS }
    case 'pi':
    case 'omp':
      return { wire: 'cli-thinking', levels: REASONING_LEVELS }
    case 'claude':
      return {
        wire: 'claude-effort',
        levels: findFamily(CLAUDE_CLI_FAMILIES, target.model)?.levels ?? CLAUDE_CLI_EFFORT_LEVELS,
      }
    case 'codex':
      return fromFamily(findFamily(CODEX_WIRED, target.model))
    case 'openai':
      return fromFamily(findFamily(OPENAI_WIRED, target.model))
    case 'deepseek':
      return fromFamily(findFamily(DEEPSEEK_WIRED, target.model))
    case 'anthropic':
      return fromFamily(findFamily(ANTHROPIC_FAMILIES, target.model))
    case 'custom':
      return fromFamily(findFamily(CUSTOM_WIRED, target.model))
    default:
      return UNSUPPORTED_PROVIDER
  }
}

// ============================================================================
// Plans
// ============================================================================

/** Main's decision for one provider attempt, and the wire the provider must express it on. */
export interface ReasoningEffortPlan {
  decision: IntelligenceReasoningEffortDecision
  /** How `decision.applied` goes out; `null` when nothing is sent. */
  wire: ReasoningEffortWire | null
}

/**
 * `max` takes the model's strongest level. Any other level the model lacks goes to the nearest one
 * it has, stronger first — the same walk pi's own `clampThinkingLevel` makes, so a pinned pi model
 * and a direct provider round the same way.
 */
function resolveLevel(
  requested: IntelligenceReasoningEffort,
  levels: readonly IntelligenceReasoningLevel[],
): IntelligenceReasoningLevel {
  if (requested === 'max')
    return levels[levels.length - 1]!
  if (levels.includes(requested))
    return requested
  const start = REASONING_LEVELS.indexOf(requested)
  for (let index = start + 1; index < REASONING_LEVELS.length; index += 1) {
    const level = REASONING_LEVELS[index]!
    if (levels.includes(level))
      return level
  }
  for (let index = start - 1; index >= 0; index -= 1) {
    const level = REASONING_LEVELS[index]!
    if (levels.includes(level))
      return level
  }
  return levels[0]!
}

export function planReasoningEffort(
  requested: IntelligenceReasoningEffort,
  target: ReasoningEffortTarget,
): ReasoningEffortPlan {
  const support = resolveReasoningEffortSupport(target)
  if (!support.wire || support.levels.length === 0) {
    return {
      wire: null,
      decision: {
        requested,
        applied: null,
        status: support.unsupported === 'provider' ? 'unsupported-provider' : 'unsupported-model',
      },
    }
  }
  if (support.wire === 'nexus')
    return { wire: 'nexus', decision: { requested, applied: null, status: 'forwarded' } }
  const applied = resolveLevel(requested, support.levels)
  return {
    wire: support.wire,
    decision: {
      requested,
      applied,
      status: requested === 'max' || applied === requested ? 'applied' : 'clamped',
    },
  }
}

// ============================================================================
// LangChain translation (core-app providers and the Nexus adapters run the same versions)
// ============================================================================

/** What a LangChain `ChatOpenAI` takes for a plan. */
export interface LangChainOpenAiReasoningFields {
  /**
   * Sent verbatim as `reasoning_effort`. A plain level rather than the SDK's type: the OpenAI types
   * LangChain 0.4 ships stop at `high`, while the API also takes `minimal`, `xhigh` and `max`.
   */
  reasoningEffort: IntelligenceReasoningLevel
  /** DeepSeek V4 thinks only when told to; `modelKwargs` is spread into the request body. */
  modelKwargs?: { thinking: { type: 'enabled' } }
}

/** `null` for no plan or nothing to send: the caller then builds exactly the model it always did. */
export function toLangChainOpenAiReasoningFields(
  plan: ReasoningEffortPlan | undefined,
): LangChainOpenAiReasoningFields | null {
  const applied = plan?.decision.applied
  if (!plan || !applied)
    return null
  if (plan.wire === 'openai-reasoning-effort')
    return { reasoningEffort: applied }
  if (plan.wire === 'deepseek-thinking')
    return { reasoningEffort: applied, modelKwargs: { thinking: { type: 'enabled' } } }
  return null
}

/**
 * What a LangChain `ChatAnthropic` (0.3.x) takes for a plan.
 *
 * LangChain validates only `thinking.type === 'enabled'`: with it, it requires `temperature === 1`
 * and default `topK` / `topP`, and then sends no temperature, `top_k` or `top_p` at all — which is
 * what extended and adaptive thinking both need. Its `invocationKwargs` are spread last into the
 * request, so an adaptive model is built on the `enabled` branch and the kwargs replace `thinking`
 * with `{ type: 'adaptive' }` and add `output_config.effort` on the wire.
 */
export interface LangChainAnthropicThinkingFields {
  temperature: 1
  /** Thinking and answer share this ceiling. */
  maxTokens: number
  thinking: { type: 'enabled', budget_tokens: number }
  invocationKwargs?: {
    thinking: { type: 'adaptive' }
    output_config: { effort: IntelligenceReasoningLevel }
  }
}

export interface AnthropicThinkingOptions {
  /** Room kept for the answer itself: the caller's own output cap, or the provider's default. */
  answerTokens: number
  /**
   * Whether the request streams. `@anthropic-ai/sdk` refuses a non-streaming request whose
   * `max_tokens` implies more than ten minutes, so those ceilings are capped.
   */
  streaming: boolean
}

/** Extended thinking's floor, and the least the answer keeps under a shared ceiling. */
const ANTHROPIC_MIN_THINKING_TOKENS = 1024

/** pi-ai's default budgets (`simple-options.js`); budget models never go past `high`. */
const ANTHROPIC_THINKING_BUDGETS: Record<IntelligenceReasoningLevel, number> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 16384,
  max: 16384,
}

/**
 * Head-room for adaptive thinking. It has no budget — thinking simply counts against `max_tokens` —
 * so the ceiling has to leave the model room to think at the level asked for, or the answer is cut
 * off mid-thought.
 */
const ANTHROPIC_ADAPTIVE_ROOM: Record<IntelligenceReasoningLevel, number> = {
  minimal: 2048,
  low: 4096,
  medium: 8192,
  high: 16384,
  xhigh: 24576,
  max: 32768,
}

/**
 * The largest non-streaming `max_tokens` `@anthropic-ai/sdk` 0.65 accepts without its own timeout:
 * it assumes 128k tokens an hour and refuses anything past ten minutes.
 */
export const ANTHROPIC_NON_STREAMING_MAX_TOKENS = 21_333

/** `null` for no plan or nothing to send: the caller then builds exactly the model it always did. */
export function toLangChainAnthropicThinkingFields(
  plan: ReasoningEffortPlan | undefined,
  options: AnthropicThinkingOptions,
): LangChainAnthropicThinkingFields | null {
  const applied = plan?.decision.applied
  if (!plan || !applied)
    return null
  const answerTokens = Number.isFinite(options.answerTokens) && options.answerTokens >= 1
    ? Math.floor(options.answerTokens)
    : ANTHROPIC_MIN_THINKING_TOKENS
  const ceiling = (total: number): number =>
    options.streaming ? total : Math.min(total, ANTHROPIC_NON_STREAMING_MAX_TOKENS)

  if (plan.wire === 'anthropic-budget') {
    const budget = ANTHROPIC_THINKING_BUDGETS[applied]
    const maxTokens = ceiling(answerTokens + budget)
    // The API wants `ANTHROPIC_MIN_THINKING_TOKENS <= budget_tokens < max_tokens`; a capped ceiling
    // shrinks the budget before it squeezes the answer below the same floor.
    const budgetTokens = Math.max(
      ANTHROPIC_MIN_THINKING_TOKENS,
      Math.min(budget, maxTokens - ANTHROPIC_MIN_THINKING_TOKENS),
    )
    return { temperature: 1, maxTokens, thinking: { type: 'enabled', budget_tokens: budgetTokens } }
  }

  if (plan.wire === 'anthropic-adaptive') {
    return {
      temperature: 1,
      maxTokens: ceiling(answerTokens + ANTHROPIC_ADAPTIVE_ROOM[applied]),
      thinking: { type: 'enabled', budget_tokens: ANTHROPIC_MIN_THINKING_TOKENS },
      invocationKwargs: { thinking: { type: 'adaptive' }, output_config: { effort: applied } },
    }
  }

  return null
}
