import { requirePilotAuth } from '../../../../utils/auth'
import { getSessionRunStateSafe } from '../../../../utils/chat-turn-queue'
import { deletePilotAttachmentObject } from '../../../../utils/pilot-attachment-storage'
import {
  getPilotMemoryPolicy,
} from '../../../../utils/pilot-chat-memory'
import { deletePilotMemoryFactsBySession } from '../../../../utils/pilot-memory-facts'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  listPilotQuotaSessions,
  upsertPilotQuotaSession,
} from '../../../../utils/pilot-quota-session'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'
import { quotaError, quotaOk } from '../../../../utils/quota-api'
import { buildQuotaConversationSnapshot } from '../../../../utils/quota-conversation-snapshot'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  listQuotaHistory,
  upsertQuotaHistory,
} from '../../../../utils/quota-history-store'

interface ClearMemoryBody {
  scope?: 'session' | 'all'
  chatId?: string
}

interface ClearConversationResult {
  chatId: string
  runtimeSessionId: string
  topic: string
  removedAttachments: number
}

const RUNNING_STATES = new Set(['queued', 'executing', 'title'])

function normalizeChatId(value: unknown): string {
  return String(value || '').trim()
}

async function collectAllChatIds(event: Parameters<typeof requirePilotAuth>[0], userId: string): Promise<string[]> {
  const set = new Set<string>()
  let page = 1
  const pageSize = 200

  while (true) {
    const result = await listQuotaHistory(event, {
      userId,
      page,
      pageSize,
    })
    for (const row of result.items) {
      if (row.chatId) {
        set.add(row.chatId)
      }
    }

    if (result.items.length < pageSize) {
      break
    }
    page += 1
  }

  const mapped = await listPilotQuotaSessions(event, userId, 10_000)
  for (const row of mapped) {
    if (row.chatId) {
      set.add(row.chatId)
    }
  }

  return Array.from(set)
}

async function clearConversationMemory(
  event: Parameters<typeof requirePilotAuth>[0],
  userId: string,
  chatId: string,
): Promise<ClearConversationResult> {
  const mapped = await getPilotQuotaSessionByChatId(event, userId, chatId)
  const previous = await getQuotaHistory(event, userId, chatId)

  const topicHint = String(previous?.topic || mapped?.topic || '').trim() || '新的聊天'
  const snapshot = buildQuotaConversationSnapshot({
    chatId,
    messages: [],
    assistantReply: '',
    topicHint,
    previousValue: previous?.value || '',
  })

  await upsertQuotaHistory(event, {
    chatId,
    userId,
    topic: snapshot.topic,
    value: snapshot.value,
    meta: previous?.meta || '',
  })

  const runtimeSessionId = String(mapped?.runtimeSessionId || chatId).trim() || chatId
  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const attachments = await store.runtime.listAttachments(runtimeSessionId)
  for (const attachment of attachments) {
    try {
      await deletePilotAttachmentObject(event, attachment.ref)
    }
    catch {
      // ignore individual attachment object failures and continue clearing metadata
    }
  }

  await store.runtime.clearSessionMemory(runtimeSessionId)
  await deletePilotMemoryFactsBySession(event, userId, runtimeSessionId)
  const runtimeSession = await store.runtime.getSession(runtimeSessionId)
  if (runtimeSession && snapshot.topic) {
    await store.runtime.setSessionTitle(runtimeSessionId, snapshot.topic)
  }

  await upsertPilotQuotaSession(event, {
    chatId,
    userId,
    runtimeSessionId,
    channelId: String(mapped?.channelId || 'default').trim() || 'default',
    topic: snapshot.topic,
  })

  return {
    chatId,
    runtimeSessionId,
    topic: snapshot.topic,
    removedAttachments: attachments.length,
  }
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<ClearMemoryBody>(event)
  const scope = body?.scope === 'all' ? 'all' : 'session'

  const memoryPolicy = await getPilotMemoryPolicy(event)
  if (!memoryPolicy.allowUserClear) {
    return quotaError(403, 'memory clear is disabled by policy', {
      memoryPolicy,
    })
  }

  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)

  const targetChatIds = scope === 'all'
    ? await collectAllChatIds(event, auth.userId)
    : [normalizeChatId(body?.chatId)]

  const normalizedTargets = Array.from(new Set(targetChatIds.filter(Boolean)))
  if (normalizedTargets.length <= 0) {
    return quotaOk({
      scope,
      clearedCount: 0,
      cleared: [],
    })
  }

  const blocked: Array<{ chatId: string, runState: string }> = []
  for (const chatId of normalizedTargets) {
    const runtime = await getSessionRunStateSafe(event, auth.userId, chatId)
    if (RUNNING_STATES.has(runtime.runState)) {
      blocked.push({
        chatId,
        runState: runtime.runState,
      })
    }
  }

  if (blocked.length > 0) {
    return quotaError(409, '会话正在执行中，请稍后再清空记忆', {
      blocked,
    })
  }

  const cleared: ClearConversationResult[] = []
  for (const chatId of normalizedTargets) {
    const result = await clearConversationMemory(event, auth.userId, chatId)
    cleared.push(result)
  }

  return quotaOk({
    scope,
    clearedCount: cleared.length,
    cleared,
  })
})
