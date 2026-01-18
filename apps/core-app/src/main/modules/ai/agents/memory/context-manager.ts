import type { AgentMessage } from '@talex-touch/utils'
import { memoryStore } from './memory-store'

export class AgentContextManager {
  getMessages(sessionId: string): AgentMessage[] {
    return memoryStore.getMessages(sessionId)
  }

  appendMessages(sessionId: string, messages: AgentMessage[]): void {
    memoryStore.appendMessages(sessionId, messages)
  }

  recordTurn(sessionId: string, input: unknown, output: unknown): void {
    const userMessage = this.toMessage('user', input)
    const assistantMessage = this.toMessage('assistant', output)
    const messages: AgentMessage[] = []
    if (userMessage) {
      messages.push(userMessage)
    }
    if (assistantMessage) {
      messages.push(assistantMessage)
    }
    if (messages.length > 0) {
      this.appendMessages(sessionId, messages)
    }
  }

  clearSession(sessionId: string): void {
    memoryStore.clearSession(sessionId)
  }

  private toMessage(role: AgentMessage['role'], payload: unknown): AgentMessage | null {
    if (payload === undefined || payload === null) {
      return null
    }
    const content = typeof payload === 'string' ? payload : this.stringify(payload)
    return { role, content, timestamp: Date.now() }
  }

  private stringify(payload: unknown): string {
    try {
      return JSON.stringify(payload)
    } catch {
      return String(payload)
    }
  }
}

export const agentContextManager = new AgentContextManager()
