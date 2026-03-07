import type { AgentEnvelope } from '../protocol/envelope'
import type { ApprovalInput, SessionSnapshot, UserMessageInput, ViewEventInput } from '../protocol/session'

export interface ConversationAgentPort {
  onMessage(input: UserMessageInput): AsyncIterable<AgentEnvelope>
  onViewEvent(input: ViewEventInput): AsyncIterable<AgentEnvelope>
  onApproval(input: ApprovalInput): AsyncIterable<AgentEnvelope>
  resume(sessionId: string): Promise<SessionSnapshot>
}
