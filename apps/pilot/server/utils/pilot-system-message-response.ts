import {
  projectPilotSystemMessagesFromTraces,
  shouldHidePilotClientSystemMessage,
} from '@talex-touch/tuff-intelligence/pilot'

interface MessageLike {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

interface TraceLike {
  seq: number
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

interface RuntimeStoreLike {
  listMessages: (sessionId: string) => Promise<MessageLike[]>
  listTrace: (sessionId: string, fromSeq?: number, limit?: number) => Promise<TraceLike[]>
}

function normalizeSeq(value: unknown): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed))
  }
  return 0
}

function normalizeTime(value: unknown): number {
  const stamp = Date.parse(String(value || ''))
  if (Number.isFinite(stamp)) {
    return stamp
  }
  return 0
}

function sortMessagesByTimeline(messages: MessageLike[]): MessageLike[] {
  return [...messages].sort((left, right) => {
    const leftSeq = normalizeSeq(left.metadata?.seq)
    const rightSeq = normalizeSeq(right.metadata?.seq)
    if (leftSeq !== rightSeq && leftSeq > 0 && rightSeq > 0) {
      return leftSeq - rightSeq
    }
    const leftTime = normalizeTime(left.createdAt)
    const rightTime = normalizeTime(right.createdAt)
    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }
    return left.id.localeCompare(right.id)
  })
}

export async function listMessagesWithLazySystemProjection(
  store: RuntimeStoreLike,
  sessionId: string,
): Promise<MessageLike[]> {
  const persistedMessages = await store.listMessages(sessionId)
  const messages = persistedMessages
    .filter(item => item.role !== 'system')
  const legacySystemMessages = persistedMessages
    .filter(item => item.role === 'system' && !shouldHidePilotClientSystemMessage(item.metadata))

  const traces = await store.listTrace(sessionId, 1, 2_000).catch(() => [])
  const synthetic = projectPilotSystemMessagesFromTraces({
    sessionId,
    traces,
  })
  const map = new Map<string, MessageLike>()
  for (const item of messages) {
    map.set(item.id, item)
  }
  for (const item of legacySystemMessages) {
    map.set(item.id, item)
  }
  for (const item of synthetic) {
    map.set(item.id, {
      id: item.id,
      sessionId,
      role: 'system',
      content: item.content,
      createdAt: item.createdAt,
      metadata: item.metadata as unknown as Record<string, unknown>,
    })
  }
  return sortMessagesByTimeline(Array.from(map.values()))
}
