import type { AiAttachment } from '../../ai-elements/src/types'
import type {
  ConversationStreamEmptyAlign,
  ConversationStreamItemKey,
  ConversationStreamLoadResult,
} from '../../conversation-stream/src/types'

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export type ChatMessageStatus = 'pending' | 'streaming' | 'complete' | 'error'

export type ChatMessageVariant = 'bubble' | 'hybrid' | 'clean'

export type ChatMessageActionsMode = 'none' | 'hover' | 'always'

export type ChatMessageSpeakState = 'idle' | 'loading' | 'speaking'

export interface ChatMessageAttachmentImage {
  type: 'image'
  url: string
  name?: string
}

export type ChatMessageAttachment = ChatMessageAttachmentImage | AiAttachment

export interface ChatMessageVoice {
  src?: string
  durationMs?: number
  peaks?: number[]
  label?: string
}

export interface ChatMessageModel {
  id: string
  role: ChatMessageRole
  content: string
  /** Optional sender display name shown in the header and forwarded to `TxAvatar` initials. */
  name?: string
  createdAt?: number
  avatarUrl?: string
  status?: ChatMessageStatus
  error?: string
  metrics?: string
  voice?: ChatMessageVoice
  attachments?: ChatMessageAttachment[]
}

export interface ChatMessageProps {
  message: ChatMessageModel
  markdown?: boolean
  /** Accessible label for an image attachment thumbnail whose `name` is absent. */
  attachmentLabel?: string
  /** Layout flavor: `bubble` (classic card), `hybrid` (user bubble + flat assistant), or `clean`. */
  variant?: ChatMessageVariant
  /** Force avatar visibility; in `hybrid`/`clean` defaults to shown only when `avatarUrl` or `#avatar` is provided. */
  showAvatar?: boolean
  /** Explicitly mark this message as streaming; falls back to `message.status === 'streaming'`. */
  streaming?: boolean
  /** Use progressive `TxStreamMarkdown` while streaming markdown responses. */
  streamMarkdown?: boolean
  /** Action toolbar visibility behavior. @default 'none' unless action flags/slots are enabled, then 'hover' */
  actions?: ChatMessageActionsMode
  /** Enables copy action via `TxMessageActions`. */
  copyable?: boolean
  /** Enables regenerate action via `TxMessageActions`. */
  regenerable?: boolean
  /** Enables read-aloud toggle action via `TxMessageActions`. */
  speakable?: boolean
  /** Current read-aloud state forwarded to `TxMessageActions`. */
  speakState?: ChatMessageSpeakState
  copyLabel?: string
  copiedLabel?: string
  regenerateLabel?: string
  speakLabel?: string
  stopSpeakLabel?: string
  retryLabel?: string
}

export interface ChatMessageEmits {
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
  (e: 'copy', payload: { text: string, messageId: string }): void
  (e: 'regenerate', messageId: string): void
  (e: 'speak', messageId: string): void
  (e: 'retry', messageId: string): void
}

export type ChatListMode = 'list' | 'stream'

export interface ChatListProps {
  messages: ChatMessageModel[]
  markdown?: boolean
  stagger?: boolean
  /** Forwarded to each TxChatMessage: names an image thumbnail that has no `name`. */
  attachmentLabel?: string
  /** Rendering mode: `list` (inline flow) or `stream` (virtualized `TxConversationStream`). */
  mode?: ChatListMode
  itemKey?: ConversationStreamItemKey<ChatMessageModel>
  estimatedItemHeight?: number
  overscan?: number
  loadOlder?: () => Promise<ConversationStreamLoadResult>
  hasMoreInitial?: boolean
  /** Marks the latest assistant turn as actively streaming. */
  streaming?: boolean
  topPadding?: number | string
  bottomClearance?: number | string
  itemGap?: number | string
  pillBottom?: number | string
  scrollToBottomLabel?: string
  emptyText?: string
  emptyAlign?: ConversationStreamEmptyAlign
  messageVariant?: ChatMessageVariant
  showAvatar?: boolean
  streamMarkdown?: boolean
  actions?: ChatMessageActionsMode
  copyable?: boolean
  regenerable?: boolean
  speakable?: boolean
  speakStateOf?: (message: ChatMessageModel) => ChatMessageSpeakState
}

export type ChatComposerTrayPlacement = 'top' | 'bottom'

export type ChatComposerSendState = 'empty' | 'ready' | 'waiting' | 'streaming' | 'blocked'

export type ChatComposerMicState = 'idle' | 'starting' | 'listening' | 'finishing'

export type ChatComposerSurface = 'solid' | 'refraction'

export interface ChatComposerProps {
  modelValue?: string
  placeholder?: string
  /**
   * Accessible label for the message textarea. Falls back to `placeholder` when
   * omitted so screen readers never announce an unnamed text box.
   */
  ariaLabel?: string
  disabled?: boolean
  submitting?: boolean
  allowAttachmentWhileSubmitting?: boolean
  /** Resting height of the textarea, in lines; it grows with its content from here. */
  minRows?: number
  /** Height cap of the textarea, in lines; content scrolls past it. Floored at `minRows`. */
  maxRows?: number
  sendOnEnter?: boolean
  sendOnMetaEnter?: boolean
  allowEmptySend?: boolean
  /** Accessible name of the icon-only send button. */
  sendButtonText?: string
  showAttachmentButton?: boolean
  /** Accessible name of the icon-only attachment button. */
  attachmentButtonText?: string
  attachments?: Array<ChatComposerAttachment | AiAttachment>
  /** Enables per-attachment remove button and emits `attachmentRemove`. */
  attachmentRemovable?: boolean
  removeAttachmentLabelFormatter?: (label: string) => string
  /**
   * Which side of the input card the `tray` slot sits on. Changing it slides the
   * card across the tray; the outer box keeps its size when both sides' trays are
   * equally tall.
   */
  trayPlacement?: ChatComposerTrayPlacement
  /** Accessible name for the tray. When set, the tray is a labelled `role="group"`. */
  trayLabel?: string
  /** Surface flavor: `solid` (default opaque card) or `refraction` (translucent frosted card). */
  surface?: ChatComposerSurface
  /** Translucent mid-conversation styling matching active threads. */
  conversing?: boolean
  /** Shows subtle perimeter focus/work glow halo around the card. */
  beamActive?: boolean
  /** Explicit send/stop/queue state; when omitted, derives from `submitting`, `streaming`, and content. */
  sendState?: ChatComposerSendState
  /** Convenience flag to morph send island into the active stop capsule (emitting `stop`). */
  streaming?: boolean
  /** When true while streaming/waiting with content, primary action sends/queues instead of stopping. */
  sendQueues?: boolean
  /** Capsule button text & accessible label while stopping. @default 'Stop' */
  stopButtonText?: string
  /** Accessible label for queued send state. @default 'Queue message' */
  queueButtonText?: string
  /** Renders the dictation button in the trailing toolbar slot. */
  dictatable?: boolean
  /** Two-way listening toggle — `v-model:listening`. */
  listening?: boolean
  /** Fine-grained dictation phase (`idle` | `starting` | `listening` | `finishing`). */
  micState?: ChatComposerMicState
  /** Disables mic button cleanly when host microphone permission is blocked. */
  micBlocked?: boolean
  /** Elapsed dictation duration in ms for tabular live timer. */
  micElapsedMs?: number
  micButtonText?: string
  stopMicButtonText?: string
  micStatusText?: string
  micEscHint?: string
  /** Keeps textarea read-only during active dictation while preserving focus/Esc cancel. @default true */
  readonlyWhileListening?: boolean
  /** Enables subtle reactive voice border glow driven by `voiceLevel` (0..1). */
  voiceGlow?: boolean
  voiceLevel?: number
}

export interface ChatComposerAttachment {
  id: string
  label: string
  kind?: string
  pending?: boolean
}

export interface ChatComposerEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'update:listening', listening: boolean): void
  (e: 'send', payload: { text: string }): void
  (e: 'stop'): void
  (e: 'mic'): void
  (e: 'dictateCancel'): void
  (e: 'attachmentClick'): void
  (e: 'attachmentRemove', id: string): void
  (e: 'paste', event: ClipboardEvent): void
  /** Files arriving via paste or drag-and-drop; the consumer owns the upload. */
  (e: 'attachmentAdd', files: File[]): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}

export interface TypingIndicatorProps {
  variant?: 'dots' | 'ai' | 'pure' | 'ring' | 'circle-dash' | 'bars'
  text?: string
  showText?: boolean
  /**
   * Screen-reader text for the `role="status"` region when `showText` is false.
   * Without it, hiding the label leaves the live region empty and it announces
   * nothing. Falls back to `text`.
   */
  ariaLabel?: string
  size?: number
  gap?: number
  loaderSize?: number
  pureSize?: number
  ringSize?: number
  ringThickness?: number
  circleDashSize?: number
  circleDashThickness?: number
  circleDashDashDeg?: number
  circleDashGapDeg?: number
  barsSize?: number
}
