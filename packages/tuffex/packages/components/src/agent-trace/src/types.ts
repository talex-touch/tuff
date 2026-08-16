// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type AgentTraceVariant = 'steps' | 'reasoning' | 'search' | 'coding'

export type AgentTraceRowStatus = 'pending' | 'active' | 'done' | 'error'

export interface AgentTraceRow {
  id: string
  /** Step name, prose sentence, site title, or tool name. */
  primary: string
  /** Right-hand detail: a count, a domain, a file path, a command. */
  secondary?: string
  /** Renders `secondary` in the mono face — file paths and commands. */
  mono?: boolean
  /** Diff counters, shown as `+N −M` with a real minus sign (U+2212). */
  added?: number
  removed?: number
  /** Makes the row a link. Navigation stays the host's call, via `@open`. */
  href?: string
  /**
   * Drives the glyph in the `steps` variant: `active` spins, `error` marks,
   * anything else checks. Omit it and the last row spins while `working`,
   * which is the upstream behaviour.
   */
  status?: AgentTraceRowStatus
}

export interface AgentTraceProps {
  /** @default 'steps' */
  variant?: AgentTraceVariant
  rows: AgentTraceRow[]
  /** `search`: the query echoed above the results. */
  query?: string
  /** True while the trace is still running — drives the shimmer and the spinner. */
  working?: boolean
  /** Header text while working. Defaults per variant. */
  activeLabel?: string
  /** Header text once settled. Defaults per variant. */
  doneLabel?: string
  /** Trailing overflow note, e.g. `+7 more`. */
  moreLabel?: string
  /** Open state before any user interaction. Defaults to `working`. */
  defaultOpen?: boolean
  /**
   * The host-held user override, mirroring `TxChainOfThought`: a streaming
   * host that recreates this instance would otherwise lose the reader's
   * choice. `undefined` falls back to the internal override.
   */
  userOpen?: boolean
  /** `coding`: id of the currently selected row. */
  selectedId?: string
}
