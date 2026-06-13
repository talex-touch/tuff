export type AiElementMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface AiElementMessage {
  id: string
  role: AiElementMessageRole
  content: string
  createdAt?: number | string | Date
  name?: string
  avatar?: string
  status?: 'pending' | 'streaming' | 'complete' | 'error'
}

export interface AiMessageProps {
  message: AiElementMessage
  markdown?: boolean
  compact?: boolean
}

export interface AiConversationProps {
  messages: AiElementMessage[]
  markdown?: boolean
  compact?: boolean
  emptyText?: string
}
