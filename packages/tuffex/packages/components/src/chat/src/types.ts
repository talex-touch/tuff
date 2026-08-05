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
  minRows?: number
  maxRows?: number
  sendOnEnter?: boolean
  sendOnMetaEnter?: boolean
  allowEmptySend?: boolean
  sendButtonText?: string
  showAttachmentButton?: boolean
  attachmentButtonText?: string
  attachments?: ChatComposerAttachment[]
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
