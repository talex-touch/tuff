import type {
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageStatus,
} from '@talex-touch/utils/analytics'
import { randomUUID } from 'node:crypto'
import { getConfig, saveConfig } from '../storage'

const MESSAGE_FILE = 'analytics-messages.json'
const MESSAGE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const MESSAGE_MAX_COUNT = 200

type MessageInput = Omit<AnalyticsMessage, 'id' | 'createdAt' | 'status'> & {
  status?: AnalyticsMessageStatus
  createdAt?: number
}

export class AnalyticsMessageStore {
  list(request?: AnalyticsMessageListRequest): AnalyticsMessage[] {
    const messages = this.load()
    const status = request?.status ?? 'all'

    const filtered = messages.filter((message) => {
      if (status !== 'all' && message.status !== status)
        return false
      if (request?.source && message.source !== request.source)
        return false
      if (request?.since && message.createdAt < request.since)
        return false
      return true
    })

    const limited = request?.limit ? filtered.slice(0, request.limit) : filtered
    return limited
  }

  add(input: MessageInput): AnalyticsMessage {
    const message: AnalyticsMessage = {
      id: randomUUID(),
      source: input.source,
      severity: input.severity,
      title: input.title,
      message: input.message,
      meta: input.meta,
      status: input.status ?? 'unread',
      createdAt: input.createdAt ?? Date.now(),
    }

    const messages = this.load()
    messages.unshift(message)
    this.save(messages)
    return message
  }

  updateStatus(id: string, status: AnalyticsMessageStatus): AnalyticsMessage | null {
    const messages = this.load()
    const target = messages.find(item => item.id === id)
    if (!target)
      return null

    target.status = status
    this.save(messages)
    return target
  }

  private load(): AnalyticsMessage[] {
    const raw = getConfig(MESSAGE_FILE) as unknown
    const messages = Array.isArray(raw) ? raw : []
    const normalized = messages.filter(isValidMessage)
    return this.prune(normalized)
  }

  private save(messages: AnalyticsMessage[]): void {
    const pruned = this.prune(messages)
    const limited = pruned.slice(0, MESSAGE_MAX_COUNT)
    saveConfig(MESSAGE_FILE, JSON.stringify(limited, null, 2))
  }

  private prune(messages: AnalyticsMessage[]): AnalyticsMessage[] {
    const cutoff = Date.now() - MESSAGE_MAX_AGE
    return messages
      .filter(message => message.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
  }
}

function isValidMessage(value: unknown): value is AnalyticsMessage {
  if (!value || typeof value !== 'object')
    return false
  const message = value as AnalyticsMessage
  return typeof message.id === 'string'
    && typeof message.source === 'string'
    && typeof message.severity === 'string'
    && typeof message.title === 'string'
    && typeof message.message === 'string'
    && typeof message.status === 'string'
    && typeof message.createdAt === 'number'
}

let messageStore: AnalyticsMessageStore | null = null

export function getAnalyticsMessageStore(): AnalyticsMessageStore {
  if (!messageStore)
    messageStore = new AnalyticsMessageStore()
  return messageStore
}
