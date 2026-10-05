import type {
  IntelligenceReasoningEffort,
  IntelligenceReasoningLevel,
  ReasoningEffortSetting
} from '@talex-touch/utils/intelligence/reasoning-effort'
import type { IntelligenceEffectiveModel } from '@talex-touch/utils/types/intelligence'
import { planReasoningEffortForSupport } from '@talex-touch/utils/intelligence/reasoning-effort'

/** The pinned model the next send runs on, as the menu knows it. */
export interface ReasoningRouteChoice {
  providerId: string
  providerType: string
  model: string
  /**
   * Main's effective binding for the model. Its `thinking` is the route table with the binding's
   * own ladder/protocol applied — the exact support Main plans the request from.
   */
  binding: Pick<IntelligenceEffectiveModel, 'thinking'>
}

/** The one line under the effort row, when there is something the user needs to know. */
export type ReasoningRowNote =
  /** The pinned model takes no effort; the row is inert. */
  | { kind: 'unsupported-model' }
  /** The pinned route takes no effort at all (SiliconFlow, a local Ollama). */
  | { kind: 'unsupported-provider' }
  /** The pinned model lacks the chosen level and will run the nearest one it has. */
  | {
      kind: 'clamped'
      requested: IntelligenceReasoningEffort
      applied: IntelligenceReasoningLevel
    }
  /** Auto routing: whether it applies depends on the model the route lands on. */
  | { kind: 'auto-route' }
  /** Tuff Nexus picks the upstream, so it decides per model; the turn info says how it went. */
  | { kind: 'cloud' }

export interface ReasoningRowState {
  /** The whole row is inert: the pinned route cannot take an effort. */
  disabled: boolean
  note: ReasoningRowNote | null
  /**
   * What the composer pill shows after the model name, or `null` for nothing. It says what the send
   * will do: nothing on auto (D11-a) or on a route that takes no effort, the nearest level when the
   * model rounds, and the chosen level otherwise.
   */
  pillLevel: IntelligenceReasoningLevel | null
}

/**
 * The effort row and pill for a setting on a route: `choice` is the resolved pinned model, or
 * `undefined` when the next send is auto-routed.
 *
 * Pure, and planned from the same effective support main plans from, so what the row and the pill
 * say cannot drift from what main sends — including a ladder or protocol the user set in Settings.
 */
export function resolveReasoningRow(
  setting: ReasoningEffortSetting,
  choice: ReasoningRouteChoice | undefined
): ReasoningRowState {
  if (!choice) {
    return setting === 'auto'
      ? { disabled: false, note: null, pillLevel: null }
      : { disabled: false, note: { kind: 'auto-route' }, pillLevel: setting }
  }

  const support = choice.binding.thinking
  if (!support.wire) {
    return {
      disabled: true,
      note: {
        kind: support.unsupported === 'provider' ? 'unsupported-provider' : 'unsupported-model'
      },
      pillLevel: null
    }
  }
  if (setting === 'auto') return { disabled: false, note: null, pillLevel: null }

  const { decision } = planReasoningEffortForSupport(setting, support)
  if (decision.status === 'forwarded') {
    return { disabled: false, note: { kind: 'cloud' }, pillLevel: setting }
  }
  if (decision.status === 'clamped' && decision.applied) {
    return {
      disabled: false,
      note: { kind: 'clamped', requested: setting, applied: decision.applied },
      pillLevel: decision.applied
    }
  }
  // Applied as asked. `max` stays `max` even when the model's strongest level is spelled `xhigh`:
  // 极高 already means "the strongest this model has".
  return { disabled: false, note: null, pillLevel: setting }
}

/** Catalog key of a level's short label (`home.reasoning.level.*`). */
export function reasoningLevelLabelKey(level: IntelligenceReasoningLevel): string {
  return `home.reasoning.level.${level}`
}
