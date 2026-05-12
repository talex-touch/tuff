import type { ChatComposerAttachment, ChatMessageModel } from '@talex-touch/tuffex'

export type TxAiMotionPreset = 'none' | 'fade' | 'slide-fade' | 'rebound' | 'blur'
export type TxAiTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type TxAiMessageRole = 'user' | 'assistant' | 'system'
export type TxAiMessageStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error' | 'cancelled'
export type TxAiBlockType = 'markdown' | 'text' | 'code' | 'image' | 'file' | 'card' | 'tool' | 'error'
export type TxAiToolStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface TxAiRevealProps {
  as?: string
  motion?: TxAiMotionPreset
  appear?: boolean
  duration?: number
  delay?: number
  delayStep?: number
  disabledMotion?: boolean
}

export interface TxAiStreamTextProps {
  text: string
  as?: string
  streaming?: boolean
  cursor?: boolean
  motion?: TxAiMotionPreset
  duration?: number
  wrap?: boolean
  stagger?: number
}

export interface TxAiThinkingProps {
  text?: string
  variant?: 'dots' | 'ai' | 'pure' | 'ring' | 'circle-dash' | 'bars'
  showText?: boolean
  size?: number
}

export interface TxAiLoadingHintProps {
  label?: string
  description?: string
  status?: TxAiToolStatus
  tone?: TxAiTone
}

export interface TxAiAttachment {
  type: 'image'
  url: string
  name?: string
}

export interface TxAiMessageModel {
  id: string
  role: TxAiMessageRole
  content?: string
  createdAt?: number
  avatarUrl?: string
  status?: TxAiMessageStatus
  attachments?: TxAiAttachment[]
  blocks?: TxAiRichBlockModel[]
  meta?: Record<string, unknown>
}

export interface TxAiMessageProps {
  message: TxAiMessageModel
  markdown?: boolean
  reveal?: boolean
}

export interface TxAiConversationProps {
  messages: TxAiMessageModel[]
  markdown?: boolean
  autoFollow?: boolean
  followGap?: number
  generating?: boolean
}

export interface TxAiComposerProps {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  submitting?: boolean
  attachments?: ChatComposerAttachment[]
  allowAttachmentWhileSubmitting?: boolean
  minRows?: number
  maxRows?: number
  sendOnEnter?: boolean
  sendOnMetaEnter?: boolean
  allowEmptySend?: boolean
  sendButtonText?: string
  showAttachmentButton?: boolean
  attachmentButtonText?: string
}

export interface TxAiSuggestionProps {
  text: string
  disabled?: boolean
  active?: boolean
}

export interface TxAiMarkdownProps {
  content: string
  sanitize?: boolean
  theme?: 'auto' | 'light' | 'dark'
  streaming?: boolean
  reveal?: boolean
}

export interface TxAiCodeBlockProps {
  code: string
  language?: string
  title?: string
  copyable?: boolean
}

export interface TxAiRichBlockModel {
  id?: string
  type: TxAiBlockType
  content?: string
  value?: unknown
  name?: string
  status?: TxAiToolStatus | TxAiMessageStatus
  meta?: Record<string, unknown>
}

export interface TxAiRichBlockProps {
  block: TxAiRichBlockModel
}

export interface TxAiToolCallProps {
  name: string
  status?: TxAiToolStatus
  description?: string
}

export interface TxAiResultCardProps {
  title?: string
  description?: string
  tone?: TxAiTone
}

export interface TxAiAgentBadgeProps {
  name: string
  description?: string
  avatarUrl?: string
  tone?: TxAiTone
}

export interface TxAiCitationProps {
  title: string
  href?: string
  index?: number
  description?: string
}

export function toTuffexChatMessage(message: TxAiMessageModel): ChatMessageModel {
  return {
    id: message.id,
    role: message.role,
    content: message.content ?? '',
    createdAt: message.createdAt,
    avatarUrl: message.avatarUrl,
    attachments: message.attachments,
  }
}
