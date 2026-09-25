export type ChatMessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessageAttachmentImage {
  type: 'image'
  url: string
  name?: string
}

export type ChatMessageAttachment = ChatMessageAttachmentImage

export interface ChatMessageModel {
  id: string
  role: ChatMessageRole
  content: string
  createdAt?: number
  avatarUrl?: string
  attachments?: ChatMessageAttachment[]
}

export interface ChatMessageProps {
  message: ChatMessageModel
  markdown?: boolean
}

export interface ChatMessageEmits {
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
}

export interface ChatListProps {
  messages: ChatMessageModel[]
  markdown?: boolean
  stagger?: boolean
}

export type ChatComposerTrayPlacement = 'top' | 'bottom'

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
  attachments?: ChatComposerAttachment[]
  /**
   * Which side of the input card the `tray` slot sits on. Changing it slides the
   * card across the tray; the outer box keeps its size when both sides' trays are
   * equally tall.
   */
  trayPlacement?: ChatComposerTrayPlacement
  /** Accessible name for the tray. When set, the tray is a labelled `role="group"`. */
  trayLabel?: string
}

export interface ChatComposerAttachment {
  id: string
  label: string
  kind?: string
  pending?: boolean
}

export interface ChatComposerEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'send', payload: { text: string }): void
  (e: 'attachmentClick'): void
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
