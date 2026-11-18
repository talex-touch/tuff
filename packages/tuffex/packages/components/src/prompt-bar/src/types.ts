// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { AiAttachment } from '../../ai-elements/src/types'

/** `rounded` is the 14px card shell; `pill` rounds the shell and every control. */
export type PromptBarVariant = 'rounded' | 'pill'

export type PromptBarSurface = 'solid' | 'refraction'

export type PromptBarSendState = 'empty' | 'ready' | 'waiting' | 'streaming' | 'blocked'

export type PromptBarDictationState = 'idle' | 'starting' | 'listening' | 'finishing'

export type PromptBarMenuPlacement = 'top' | 'bottom'

export type PromptBarTrayPlacement = 'top' | 'bottom'

export type PromptBarMenuKind = 'at' | 'slash'

export interface PromptBarContextUsage {
  used?: number
  max?: number
  percent?: number
  label?: string
}

export interface PromptBarRunStatus {
  step?: string
  elapsed?: string
  active?: boolean
  tone?: 'idle' | 'working' | 'error'
}

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
  /** Optional model effort/reasoning suffix rendered on the trigger pill. */
  effort?: string
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
  /**
   * Empties the draft once `send` is emitted. Off, the text stays until the
   * host clears it, e.g. after the turn is accepted. @default true
   */
  clearOnSend?: boolean

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

  /** Surface flavor: `solid` (default) or `refraction` translucent frosted shell. */
  surface?: PromptBarSurface
  /** Compact translucent styling for active conversations. */
  conversing?: boolean
  /** Shows perimeter focus/working glow around the composer shell. */
  beamActive?: boolean
  /** Reactive voice halo intensity (`voiceLevel` 0..1) while live dictating. */
  voiceGlow?: boolean
  voiceLevel?: number
  /** Tray slot placement relative to composer input. @default 'top' */
  trayPlacement?: PromptBarTrayPlacement
  trayLabel?: string
  /** Popover placement for `@` / `/` and model menus. @default 'top' */
  menuPlacement?: PromptBarMenuPlacement
  /** Optional context window usage meter rendered in the top dock. */
  contextUsage?: PromptBarContextUsage
  /** Optional run/turn progress chip rendered in the top dock. */
  runStatus?: PromptBarRunStatus
  /** Morphs send island into a Stop capsule and emits `stop`. */
  streaming?: boolean
  /** Explicit primary button state overriding automatic inference. */
  sendState?: PromptBarSendState
  /** Allows queueing/sending new drafts while a turn streams. */
  sendQueues?: boolean
  /** @default 'Stop' */
  stopLabel?: string
  /** Visible capsule label during active generation. @default 'Stop' */
  stopText?: string
  /** @default 'Queue message' */
  queueLabel?: string
  /** Fine-grained dictation lifecycle phase. */
  dictationState?: PromptBarDictationState
  /** Disables mic control when host permission is blocked. */
  dictationBlocked?: boolean
  dictationElapsedMs?: number
  dictationStatusText?: string
  dictationEscHint?: string
  /** Keeps textarea read-only during active dictation. @default true */
  readonlyWhileListening?: boolean
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
  (e: 'stop'): void
  (e: 'dictationCancel'): void
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
