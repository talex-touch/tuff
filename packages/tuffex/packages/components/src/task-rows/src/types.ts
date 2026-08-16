// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/** Matches `AiToolCallPart['status']` so a host can pass either through. */
export type TaskRowStatus = 'pending' | 'running' | 'done' | 'error'

export type TaskRowsVariant = 'capsules' | 'list'

export interface TaskRowDetail {
  label: string
  /** Rendered mono and tabular — counts, ratios, file totals. */
  meta?: string
}

export interface TaskRowItem {
  id: string
  label: string
  status: TaskRowStatus
  /** Right-aligned quantity, e.g. `12 suppliers`. */
  amount?: string
  /** Number shown inside the progress ring while pending or running. */
  index?: number
  /** Overrides the pill text for this row. */
  statusText?: string
  details?: TaskRowDetail[]
  /**
   * Shows the turning retry glyph beside a failed row's pill. It reports that
   * a retry is under way; it is not a control. @default true
   */
  retryable?: boolean
}

export interface TaskRowsProps {
  rows: TaskRowItem[]
  /** @default 'capsules' */
  variant?: TaskRowsVariant
  /** Ids open before any interaction. Ignored while `openIds` is bound. */
  defaultOpenIds?: string[]
  /** Bind it to own the open set; leave it unbound and the component keeps it. */
  openIds?: string[]
  /** @default 'Completed' */
  doneText?: string
  /** @default 'Failed' */
  errorText?: string
  /** No default — a running row shows no pill upstream. */
  runningText?: string
  /** No default — a queued row shows no pill upstream. */
  pendingText?: string
}
