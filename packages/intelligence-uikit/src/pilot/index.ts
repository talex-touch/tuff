import type { TxAiBlockType, TxAiMessageModel, TxAiRichBlockModel } from '../types'
import TxAiMessage from '../components/conversation/TxAiMessage.vue'
import TxAiConversation from '../components/conversation/TxAiConversation.vue'

export interface PilotChatBlockLike {
  id?: string
  type?: string
  name?: string
  value?: unknown
  data?: unknown
  status?: string
  meta?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface PilotChatMessageLike {
  id?: string
  role?: string
  content?: string
  createdAt?: number
  timestamp?: number
  avatarUrl?: string
  status?: string
  value?: PilotChatBlockLike[]
  blocks?: PilotChatBlockLike[]
  meta?: Record<string, unknown>
}

const PILOT_BLOCK_TYPE_MAP: Record<string, TxAiBlockType> = {
  markdown: 'markdown',
  text: 'text',
  code: 'code',
  image: 'image',
  file: 'file',
  card: 'card',
  tool: 'tool',
  error: 'error',
}

export function mapPilotChatBlocksToAiBlocks(blocks: PilotChatBlockLike[] = []): TxAiRichBlockModel[] {
  return blocks.map((block, index) => {
    const rawType = typeof block.type === 'string' ? block.type : 'text'
    const type = PILOT_BLOCK_TYPE_MAP[rawType] ?? 'card'
    const metadata = block.meta ?? block.metadata ?? {}

    return {
      id: block.id || `${type}-${index}`,
      type,
      name: block.name,
      content: typeof block.value === 'string' ? block.value : typeof block.data === 'string' ? block.data : undefined,
      value: block.value,
      status: block.status === 'error'
        ? 'error'
        : block.status === 'cancelled'
          ? 'cancelled'
          : undefined,
      meta: metadata,
    }
  })
}

export function mapPilotChatMessageToAiMessage(message: PilotChatMessageLike, index = 0): TxAiMessageModel {
  const blocks = message.blocks ?? message.value ?? []
  const role = message.role === 'user' || message.role === 'system' ? message.role : 'assistant'

  return {
    id: message.id || `pilot-message-${index}`,
    role,
    content: message.content,
    createdAt: message.createdAt ?? message.timestamp,
    avatarUrl: message.avatarUrl,
    status: message.status === 'error' ? 'error' : message.status === 'cancelled' ? 'cancelled' : undefined,
    blocks: mapPilotChatBlocksToAiBlocks(blocks),
    meta: message.meta,
  }
}

export {
  TxAiConversation as TxPilotConversation,
  TxAiMessage as TxPilotMessage,
}
