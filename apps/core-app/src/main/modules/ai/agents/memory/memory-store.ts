import type { AgentMessage } from '@talex-touch/utils'

interface SessionMemory {
  messages: AgentMessage[]
  updatedAt: number
}

export class MemoryStore {
  private readonly sessions = new Map<string, SessionMemory>()
  private maxMessages = 50

  setMaxMessages(limit: number): void {
    if (!Number.isFinite(limit) || limit <= 0) {
      return
    }
    this.maxMessages = Math.floor(limit)
  }

  getMessages(sessionId: string): AgentMessage[] {
    const entry = this.sessions.get(sessionId)
    if (!entry) return []
    return [...entry.messages]
  }

  appendMessages(sessionId: string, messages: AgentMessage[]): void {
    if (!sessionId || messages.length === 0) return

    const now = Date.now()
    const normalized = messages.map((message) => ({
      ...message,
      timestamp: message.timestamp ?? now
    }))

    const entry = this.sessions.get(sessionId) ?? { messages: [], updatedAt: now }
    entry.messages = [...entry.messages, ...normalized]
    if (entry.messages.length > this.maxMessages) {
      entry.messages = entry.messages.slice(entry.messages.length - this.maxMessages)
    }
    entry.updatedAt = now
    this.sessions.set(sessionId, entry)
  }

  clearSession(sessionId: string): void {
    if (!sessionId) return
    this.sessions.delete(sessionId)
  }
}

export const memoryStore = new MemoryStore()
