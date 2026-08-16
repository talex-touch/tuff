// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AiAttachment } from '../../ai-elements/src/types'

/** `rounded` is the 14px card shell; `pill` rounds the shell and every control. */
export type PromptBarVariant = 'rounded' | 'pill'

export type PromptBarMenuKind = 'at' | 'slash'

/** A row of the `@` menu: a data source, an integration, or the attach entry. */
export interface PromptBarSource {
  key: string
  name: string
  /** Trailing description, truncated when the row runs out of room. */
  desc?: string
  /**
   * Picking this row raises `attach` instead of inserting a token — it is the
   * "Add photos & files" entry, not a mention.
   */
  attach?: boolean
  /** Renders the trailing Connect / Connected affordance. */
  connectable?: boolean
  connected?: boolean
}

/** A row of the `/` menu. `name` carries its own leading slash, as inserted. */
export interface PromptBarCommand {
  key: string
  name: string
  desc?: string
}

export interface PromptBarModel {
  key: string
  name: string
  /** Quiet trailing label, e.g. `Flagship`. */
  tag?: string
}

export interface PromptBarProps {
  /** Draft text. */
  modelValue?: string
  /** @default 'rounded' */
  variant?: PromptBarVariant
  /** @default 'Write a message…' */
  placeholder?: string
  /** Accessible name for the textarea. Falls back to `placeholder`. */
  ariaLabel?: string
  disabled?: boolean
  /** Blocks sending while a previous turn is in flight; typing stays open. */
  submitting?: boolean

  /** Rows for the `@` menu. Omit to disable mentions and hide the + button. */
  sources?: PromptBarSource[]
  /** Rows for the `/` menu. Omit to disable commands. */
  commands?: PromptBarCommand[]
  /** Displayed chips. Uploads stay with the host. */
  attachments?: AiAttachment[]

  /** Omit (or leave empty) to hide the model picker. */
  models?: PromptBarModel[]
  /** Selected model key — `v-model:model`. */
  model?: string

  /** Renders the dictation button. @default false */
  dictatable?: boolean
  /** Dictation state — `v-model:listening`. Recognition stays with the host. */
  listening?: boolean
  /** @default 'Listening…' */
  listeningPlaceholder?: string

  /** Collapsed textarea height in px. @default 28 */
  minHeight?: number
  /** Growth ceiling in px; past it the textarea scrolls. @default 100 */
  maxHeight?: number
  /** @default true */
  sendOnEnter?: boolean
  /** Allows sending with neither text nor attachments. @default false */
  allowEmptySend?: boolean

  // Text — no i18n system here, so every string is a prop with an English default.
  /** @default 'Type to search sources & files' */
  sourcesHintText?: string
  /** @default 'Type to search commands' */
  commandsHintText?: string
  /** @default (q) => `No matches for "${q}"` */
  emptyTextFormatter?: (query: string) => string
  /** @default 'Connect' */
  connectText?: string
  /** @default 'Connected' */
  connectedText?: string
  /** @default 'Send' */
  sendLabel?: string
  /** @default 'Add attachments and sources' */
  attachLabel?: string
  /** @default 'Choose model' */
  modelLabel?: string
  /** @default 'Start dictation' */
  startDictationLabel?: string
  /** @default 'Stop dictation' */
  stopDictationLabel?: string
  /** Chip text for an attachment that carries no name. @default 'Attachment' */
  attachmentFallbackLabel?: string
  /** @default (name) => `Remove ${name}` */
  removeAttachmentLabelFormatter?: (name: string) => string
}

export interface PromptBarSendPayload {
  text: string
  attachments: AiAttachment[]
}

export interface PromptBarEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'update:model', key: string): void
  (e: 'update:listening', listening: boolean): void
  (e: 'send', payload: PromptBarSendPayload): void
  /** The attach row was picked — the host opens its file dialog. */
  (e: 'attach'): void
  (e: 'attachmentRemove', id: string): void
  /** Files arriving via paste or drag-and-drop; the host owns the upload. */
  (e: 'attachmentAdd', files: File[]): void
  (e: 'sourceSelect', source: PromptBarSource): void
  (e: 'commandSelect', command: PromptBarCommand): void
  (e: 'connectToggle', source: PromptBarSource): void
  (e: 'paste', event: ClipboardEvent): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}
