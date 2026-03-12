import { decodeQuotaConversation } from './quota-history-codec'

interface PlainQuotaMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

function encodeText(value: string): string {
  return btoa(encodeURIComponent(value))
}

function toMessageRole(value: unknown): PlainQuotaMessage['role'] {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'assistant') {
    return 'assistant'
  }
  if (normalized === 'system') {
    return 'system'
  }
  return 'user'
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string') {
          return String((item as { value?: string }).value)
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  if (content && typeof content === 'object') {
    const row = content as Record<string, unknown>
    if (typeof row.content === 'string') {
      return row.content
    }
  }

  return ''
}

function toPlainMessages(messages: unknown, assistantReply: string): PlainQuotaMessage[] {
  const result: PlainQuotaMessage[] = []
  if (Array.isArray(messages)) {
    for (const item of messages) {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const role = toMessageRole(row.role)
      const text = stringifyContent(row.content).trim()
      if (!text) {
        continue
      }
      result.push({ role, content: text })
    }
  }

  const answer = String(assistantReply || '').trim()
  if (answer) {
    const last = result[result.length - 1]
    if (!last || last.role !== 'assistant' || last.content !== answer) {
      result.push({
        role: 'assistant',
        content: answer,
      })
    }
  }

  return result
}

function guessTopic(messages: PlainQuotaMessage[], fallback = '新的聊天'): string {
  const fromUser = messages.find(item => item.role === 'user' && item.content.trim())
  if (!fromUser) {
    return fallback
  }

  const compact = fromUser.content.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return fallback
  }

  return compact.slice(0, 20)
}

function toStructuredConversation(
  chatId: string,
  topic: string,
  messages: PlainQuotaMessage[],
): Record<string, unknown> {
  const now = Date.now()

  return {
    id: chatId,
    topic,
    sync: 'success',
    lastUpdate: now,
    messages: messages.map((item, index) => ({
      id: randomId('Item'),
      page: 0,
      role: item.role,
      content: [
        {
          page: 0,
          model: 'this-normal',
          status: 0,
          timestamp: now + index,
          value: [
            {
              type: 'markdown',
              value: item.content,
            },
          ],
          meta: {},
        },
      ],
    })),
  }
}

export function buildQuotaConversationSnapshot(input: {
  chatId: string
  messages: unknown
  assistantReply: string
  topicHint?: string
  previousValue?: string
}): {
  topic: string
  value: string
  payload: Record<string, unknown>
} {
  const previous = decodeQuotaConversation(String(input.previousValue || '')) || {}
  const plainMessages = toPlainMessages(input.messages, input.assistantReply)
  const topic = String(input.topicHint || previous.topic || '').trim() || guessTopic(plainMessages)

  const payload: Record<string, unknown> = {
    ...previous,
    ...toStructuredConversation(input.chatId, topic, plainMessages),
    id: input.chatId,
    topic,
    lastUpdate: Date.now(),
    sync: 'success',
  }

  return {
    topic,
    value: encodeText(JSON.stringify(payload)),
    payload,
  }
}
