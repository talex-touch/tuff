import type { ConversationTurnMeta } from './useHomeConversation'

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
  t: (key: string) => string
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
