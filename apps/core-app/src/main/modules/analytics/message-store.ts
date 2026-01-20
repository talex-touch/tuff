import type {
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageStatus
} from '@talex-touch/utils/analytics'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { app } from 'electron'

const MESSAGE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const MESSAGE_MAX_COUNT = 120
const MESSAGE_DEDUPE_WINDOW_MS = 10 * 60 * 1000

type MessageInput = Omit<AnalyticsMessage, 'id' | 'createdAt' | 'status'> & {
  status?: AnalyticsMessageStatus
  createdAt?: number
}

interface MessageDedupeEntry {
  message: AnalyticsMessage
  count: number
  firstAt: number
  lastAt: number
}

export class AnalyticsMessageStore {
  private listeners = new Set<(message: AnalyticsMessage) => void | Promise<void>>()
  private messages: AnalyticsMessage[] = []
  private dedupeIndex = new Map<string, MessageDedupeEntry>()
  private readonly isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

  list(request?: AnalyticsMessageListRequest): AnalyticsMessage[] {
    if (!this.isDev) {
      return []
    }

    const messages = this.getMessages()
    const status = request?.status ?? 'all'

    const filtered = messages.filter((message) => {
      if (status !== 'all' && message.status !== status) return false
      if (request?.source && message.source !== request.source) return false
      if (request?.since && message.createdAt < request.since) return false
      return true
    })

    const limited = request?.limit ? filtered.slice(0, request.limit) : filtered
    return limited
  }

  add(input: MessageInput): AnalyticsMessage {
    const now = input.createdAt ?? Date.now()
    const dedupeKey = buildDedupeKey(input)
    const existing = this.dedupeIndex.get(dedupeKey)

    if (existing && now - existing.lastAt <= MESSAGE_DEDUPE_WINDOW_MS) {
      existing.count += 1
      existing.lastAt = now
      existing.message.createdAt = now
      existing.message.status = 'unread'
      existing.message.meta = {
        ...existing.message.meta,
        count: existing.count,
        firstAt: existing.firstAt,
        lastAt: existing.lastAt
      }
      if (this.isDev) {
        this.bumpMessage(existing.message)
      }
      return existing.message
    }

    const message: AnalyticsMessage = {
      id: randomUUID(),
      source: input.source,
      severity: input.severity,
      title: input.title,
      message: input.message,
      meta: input.meta,
      status: input.status ?? 'unread',
      createdAt: now
    }

    const entry: MessageDedupeEntry = {
      message,
      count: 1,
      firstAt: now,
      lastAt: now
    }

    this.dedupeIndex.set(dedupeKey, entry)
    this.pruneDedupeIndex(now)

    if (this.isDev) {
      this.messages.unshift(message)
      this.pruneMessages()
    }
    this.emit(message)
    return message
  }

  updateStatus(id: string, status: AnalyticsMessageStatus): AnalyticsMessage | null {
    if (!this.isDev) {
      return null
    }

    const target = this.messages.find((item) => item.id === id)
    if (!target) return null

    target.status = status
    return target
  }

  onMessage(listener: (message: AnalyticsMessage) => void | Promise<void>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private getMessages(): AnalyticsMessage[] {
    this.pruneMessages()
    return this.messages
  }

  private pruneMessages(): void {
    const cutoff = Date.now() - MESSAGE_MAX_AGE
    this.messages = this.messages
      .filter((message) => message.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MESSAGE_MAX_COUNT)
  }

  private pruneDedupeIndex(now: number): void {
    const cutoff = now - MESSAGE_MAX_AGE
    for (const [key, entry] of this.dedupeIndex.entries()) {
      if (entry.lastAt < cutoff) {
        this.dedupeIndex.delete(key)
      }
    }
  }

  private bumpMessage(message: AnalyticsMessage): void {
    const index = this.messages.findIndex((item) => item.id === message.id)
    if (index === -1) {
      this.messages.unshift(message)
      this.pruneMessages()
      return
    }
    if (index > 0) {
      this.messages.splice(index, 1)
      this.messages.unshift(message)
    }
    this.pruneMessages()
  }

  private emit(message: AnalyticsMessage): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(message)
        if (result && typeof (result as Promise<void>).catch === 'function') {
          void (result as Promise<void>).catch(() => {})
        }
      } catch {
        // ignore listener errors
      }
    }
  }
}

function buildDedupeKey(input: MessageInput): string {
  return [input.source, input.severity, input.title, input.message].join('|')
}

let messageStore: AnalyticsMessageStore | null = null

export function getAnalyticsMessageStore(): AnalyticsMessageStore {
  if (!messageStore) messageStore = new AnalyticsMessageStore()
  return messageStore
}
