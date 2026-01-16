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
  disabled?: boolean
  submitting?: boolean
  minRows?: number
  maxRows?: number
  sendOnEnter?: boolean
  sendOnMetaEnter?: boolean
}

export interface ChatComposerEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'send', payload: { text: string }): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}

export interface TypingIndicatorProps {
  variant?: 'dots' | 'ai' | 'pure' | 'ring' | 'circle-dash' | 'bars'
  text?: string
  showText?: boolean
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
