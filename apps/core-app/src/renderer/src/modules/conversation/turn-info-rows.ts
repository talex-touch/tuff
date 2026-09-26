import type { ConversationTurnMeta } from './useHomeConversation'
import {
  isReasoningEffortStatus,
  isReasoningLevel,
  normalizeReasoningEffort
} from '@talex-touch/utils/intelligence/reasoning-effort'
import { reasoningLevelLabelKey } from './reasoning-effort-display'

/** One label/value line of the turn-info readout. */
export interface TurnInfoRow {
  key: string
  label: string
  value: string
}

export interface TurnInfoRowsInput {
  /** The last settled assistant turn, or undefined before the first reply. */
  turn: ConversationTurnMeta | undefined
  messageCount: number
  /**
   * Injected rather than imported so the rules below can be tested without an
   * i18n instance — the branching is what matters here, not the wording.
   */
  t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * What the turn asked for and what it ran at, in words. Read off stored meta, so every field is
 * checked again here: a record that does not add up says nothing rather than something wrong.
 */
function describeReasoning(turn: ConversationTurnMeta, t: TurnInfoRowsInput['t']): string | null {
  const requested = normalizeReasoningEffort(turn.reasoningRequested)
  const status = turn.reasoningStatus
  if (!requested || !isReasoningEffortStatus(status)) return null
  const applied = isReasoningLevel(turn.reasoningApplied) ? turn.reasoningApplied : undefined
  const requestedLabel = t(reasoningLevelLabelKey(requested))

  switch (status) {
    case 'applied':
      if (!applied) return null
      // Only `max` can land on a differently spelled level: the model's strongest.
      return applied === requested
        ? requestedLabel
        : t('home.reasoning.turnTop', {
            requested: requestedLabel,
            applied: t(reasoningLevelLabelKey(applied))
          })
    case 'clamped':
      return applied
        ? t('home.reasoning.turnClamped', {
            requested: requestedLabel,
            applied: t(reasoningLevelLabelKey(applied))
          })
        : null
    case 'unsupported-model':
      return t('home.reasoning.turnUnsupportedModel', { requested: requestedLabel })
    case 'unsupported-provider':
      return t('home.reasoning.turnUnsupportedProvider', { requested: requestedLabel })
    case 'forwarded':
      return t('home.reasoning.turnForwarded', { requested: requestedLabel })
  }
}

/**
 * The turn readout behind the top bar's `⋯`.
 *
 * Every row except the message count is conditional, and each condition earns
 * its place: an absent provider is not the same as an empty one, a zero token
 * total means the stream never reported usage, and a zero compaction count
 * would make every ordinary turn look degraded.
 */
export function buildTurnInfoRows(input: TurnInfoRowsInput): TurnInfoRow[] {
  const { turn, t } = input
  const rows: TurnInfoRow[] = [
    { key: 'messages', label: t('home.panel.messages'), value: String(input.messageCount) }
  ]

  if (turn?.provider) {
    rows.push({ key: 'provider', label: t('home.panel.provider'), value: turn.provider })
  }
  if (turn?.model) {
    rows.push({ key: 'model', label: t('home.panel.model'), value: turn.model })
  }
  // Only when the turn asked for one: on auto nothing was sent, and there is nothing to report.
  const reasoning = turn ? describeReasoning(turn, t) : null
  if (reasoning) {
    rows.push({ key: 'reasoning', label: t('home.reasoning.label'), value: reasoning })
  }
  if (typeof turn?.totalTokens === 'number' && turn.totalTokens > 0) {
    rows.push({
      key: 'tokens',
      label: t('home.panel.tokens'),
      // The split is what makes the number actionable — a bare total hides which side is growing.
      value: `${turn.totalTokens} (${turn.promptTokens ?? 0} + ${turn.completionTokens ?? 0})`
    })
  }
  if (typeof turn?.latencyMs === 'number') {
    rows.push({
      key: 'latency',
      label: t('home.panel.latency'),
      value: `${(turn.latencyMs / 1000).toFixed(1)}s`
    })
  }
  // Only when it happened: a zero row would make every turn look degraded.
  if (turn?.compactions) {
    rows.push({
      key: 'compactions',
      label: t('home.panel.compactions'),
      value: `×${turn.compactions}`
    })
  }

  return rows
}
