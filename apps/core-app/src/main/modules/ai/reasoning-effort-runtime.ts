import type {
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig,
  IntelligenceReasoningEffortDecision
} from '@talex-touch/tuff-intelligence'
import type { ReasoningEffortPlan } from '@talex-touch/utils/intelligence/reasoning-effort'
import {
  normalizeReasoningEffort,
  planReasoningEffort
} from '@talex-touch/utils/intelligence/reasoning-effort'
import { CODEX_CLI_ORIGIN, CODEX_CLI_PROVIDER_ID } from './providers/pi-cli-runtime'
import { readCodexConfiguredModel } from './providers/pi-model-catalog'

/**
 * Runtime options as a provider receives them: the caller's options plus main's plan for this one
 * provider.
 *
 * The plan is host-only. Main makes it after choosing the provider and hands it down; a provider
 * translates it and never re-decides. `sanitizeReasoningRequest` strips any `reasoningPlan` a
 * renderer or plugin put on the request, so the only plan a provider can see is one main made.
 */
export type ReasoningPlannedInvokeOptions = IntelligenceInvokeOptions & {
  reasoningPlan?: ReasoningEffortPlan
}

/**
 * The request as main trusts it: a caller-supplied plan removed, and `reasoningEffort` either a
 * known level or gone. Called where caller options enter the SDK, before routing or caching reads
 * them.
 */
export function sanitizeReasoningRequest<T extends IntelligenceInvokeOptions>(options: T): T {
  const {
    reasoningPlan: _callerPlan,
    reasoningEffort,
    ...rest
  } = options as T & { reasoningPlan?: unknown }
  const requested = normalizeReasoningEffort(reasoningEffort)
  return (requested ? { ...rest, reasoningEffort: requested } : rest) as T
}

function originOf(provider: IntelligenceProviderConfig): string | undefined {
  const origin = provider.metadata?.origin
  return typeof origin === 'string' ? origin : undefined
}

/**
 * Main's plan for one provider attempt, or `undefined` when nothing was asked for.
 *
 * Decided per attempt rather than once per request: a fallback provider can take a different wire
 * or none at all, and its own plan is the one that has to reach it.
 *
 * `model` is what the attempt will run — the surviving model preference or the provider's default.
 * A provider class's built-in fallback model is deliberately not guessed at: an unknown model is
 * sent nothing, which is what the provider then does too. The one default that is not a guess is
 * Codex's: handed no model, `codex` runs the one its own config names, so that is the model planned.
 */
export function planProviderReasoning(
  options: IntelligenceInvokeOptions,
  provider: IntelligenceProviderConfig,
  model: string | undefined
): ReasoningEffortPlan | undefined {
  const requested = normalizeReasoningEffort(options.reasoningEffort)
  if (!requested) return undefined
  const isCodex = provider.id === CODEX_CLI_PROVIDER_ID || originOf(provider) === CODEX_CLI_ORIGIN
  return planReasoningEffort(requested, {
    providerType: provider.type,
    providerId: provider.id,
    origin: originOf(provider),
    model: model || (isCodex ? (readCodexConfiguredModel() ?? undefined) : undefined)
  })
}

/** A copy of `options` carrying `plan`, or `options` itself when there is none. */
export function withReasoningPlan<T extends IntelligenceInvokeOptions>(
  options: T,
  plan: ReasoningEffortPlan | undefined
): T & ReasoningPlannedInvokeOptions {
  return plan ? { ...options, reasoningPlan: plan } : options
}

/** The plan main attached for this provider, if any. Providers read nothing else. */
export function readReasoningPlan(
  options: IntelligenceInvokeOptions | undefined
): ReasoningEffortPlan | undefined {
  return (options as ReasoningPlannedInvokeOptions | undefined)?.reasoningPlan
}

/**
 * The decision the attempt ends on. A backend that routes on its own (Tuff Nexus) reports what it
 * did for the upstream it picked, and that report replaces main's `forwarded` placeholder; for any
 * other plan main's decision stands, since only main decided it.
 *
 * A report only answers the level it was asked for. One naming another `requested` contradicts the
 * request main sent, and is ignored rather than trusted: the turn info and the audit would
 * otherwise record a level the user never chose.
 */
export function settleReasoningDecision(
  plan: ReasoningEffortPlan | undefined,
  reported: IntelligenceReasoningEffortDecision | undefined
): IntelligenceReasoningEffortDecision | undefined {
  if (!plan) return undefined
  if (
    plan.decision.status === 'forwarded' &&
    reported &&
    reported.requested === plan.decision.requested
  ) {
    return reported
  }
  return plan.decision
}

/** A result carrying the attempt's settled decision; untouched when nothing was planned. */
export function withReasoningDecision<
  R extends { reasoningEffort?: IntelligenceReasoningEffortDecision }
>(result: R, plan: ReasoningEffortPlan | undefined): R {
  const decision = settleReasoningDecision(plan, result.reasoningEffort)
  return decision ? { ...result, reasoningEffort: decision } : result
}

/**
 * The three audit keys, always all present: a request without a decision sets them to `undefined`,
 * which the audit sanitizer drops, so a caller's own metadata cannot claim a level main never
 * resolved.
 */
export function reasoningAuditMetadata(decision: IntelligenceReasoningEffortDecision | undefined): {
  reasoningEffort: string | undefined
  reasoningApplied: string | undefined
  reasoningStatus: string | undefined
} {
  return {
    reasoningEffort: decision?.requested,
    reasoningApplied: decision?.applied ?? undefined,
    reasoningStatus: decision?.status
  }
}
