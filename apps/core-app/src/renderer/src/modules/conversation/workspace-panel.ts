import type { IntelligenceEffectiveModel } from '@talex-touch/utils/types/intelligence'

/**
 * Shapes the Home side panel's workspace tabs share with HomePage, named here rather than inside an
 * SFC so both sides import one definition.
 */

/** A model limit and the provenance its binding recorded for it. */
export interface HomeModelLimit {
  value: number
  source: 'user' | 'catalog'
}

/**
 * The limits of the model the conversation routes to, as the effective model binding resolves
 * them. A missing field is unknown, never a default window.
 */
export interface HomeModelLimits {
  contextWindow?: HomeModelLimit
  /**
   * `enforced: false` on CLI routes: Tuff does not send the cap and the CLI applies its own, so the
   * value is the binding's figure, not the request's limit.
   */
  maxOutputTokens?: HomeModelLimit & { enforced: boolean }
}

/** Only values the binding actually knows; an `unknown` source stays absent. */
export function toHomeModelLimits(
  binding: IntelligenceEffectiveModel | undefined
): HomeModelLimits {
  if (!binding) return {}
  const limits: HomeModelLimits = {}
  const window = binding.contextWindow
  if (window.value !== undefined && window.source !== 'unknown') {
    limits.contextWindow = { value: window.value, source: window.source }
  }
  const output = binding.maxOutputTokens
  if (output.value !== undefined && output.source !== 'unknown') {
    limits.maxOutputTokens = {
      value: output.value,
      source: output.source,
      enforced: output.enforced
    }
  }
  return limits
}
