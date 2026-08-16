// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type ApprovalQuestionType = 'radio' | 'check'

export interface ApprovalOption {
  /** Stable identity of the choice. Answers are keyed by this, never by index. */
  value: string
  label: string
}

export interface ApprovalQuestion {
  id: string
  question: string
  /** @default 'radio' */
  type?: ApprovalQuestionType
  options: ApprovalOption[]
  /** Set false to drop the free-text row. @default true */
  allowCustom?: boolean
  /** Per-question override of `customPlaceholder`. */
  customPlaceholder?: string
}

export interface ApprovalAnswer {
  questionId: string
  /** Selected option values. A radio question holds at most one. */
  values: string[]
  /** Free-text answer. Mutually exclusive with `values` on radio questions. */
  custom?: string
}

/** Answer map keyed by `ApprovalQuestion.id`. */
export type ApprovalAnswerMap = Record<string, ApprovalAnswer>

export interface ApprovalCardProps {
  questions: ApprovalQuestion[]
  /** `v-model` — the answer map. Omit to let the card own it. */
  modelValue?: ApprovalAnswerMap
  /**
   * `v-model:index` — the visible question. Omit for internal paging; a
   * streaming host that remounts the card would otherwise lose the page.
   */
  index?: number
  /** `v-model:sent` — submitted state. Externalise it to survive a remount. */
  sent?: boolean
  /** `v-model:open` — false collapses the card to its reopen button. */
  open?: boolean
  /** Advance to the next question after a single-choice pick. @default true */
  autoAdvance?: boolean
  /** Delay before the auto-advance, in ms. @default 480 */
  autoAdvanceDelay?: number
  /** Render the dismiss control. @default true */
  dismissible?: boolean
  /** Accessible name of the whole card. @default 'Approval questions' */
  ariaLabel?: string
  sendLabel?: string
  nextQuestionLabel?: string
  nextLabel?: string
  prevLabel?: string
  dismissLabel?: string
  reopenLabel?: string
  sentLabel?: string
  startOverLabel?: string
  customPlaceholder?: string
  customLabel?: string
  /** Formats the pager dot's accessible name. @default n => `Go to question ${n}` */
  pagerLabelFormatter?: (position: number) => string
}

export interface ApprovalCardEmits {
  (e: 'update:modelValue', answers: ApprovalAnswerMap): void
  (e: 'update:index', index: number): void
  (e: 'update:sent', sent: boolean): void
  (e: 'update:open', open: boolean): void
  /** A single question changed — lets a host persist incrementally. */
  (e: 'answer', answer: ApprovalAnswer): void
  (e: 'submit', answers: ApprovalAnswer[]): void
  (e: 'dismiss'): void
  (e: 'reopen'): void
}
