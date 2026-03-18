import { buildPilotConversationSnapshot } from '@talex-touch/tuff-intelligence/pilot'

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
  return buildPilotConversationSnapshot({
    chatId: input.chatId,
    messages: input.messages,
    assistantReply: input.assistantReply,
    topicHint: input.topicHint,
    previousValue: input.previousValue,
  })
}
