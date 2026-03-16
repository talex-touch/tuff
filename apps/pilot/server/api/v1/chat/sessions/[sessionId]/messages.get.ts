import { requirePilotAuth } from '../../../../../utils/auth'
import {
  ensureChatTurnQueueSchema,
  getSessionRunState,
} from '../../../../../utils/chat-turn-queue'
import { buildPilotAttachmentPreviewUrl } from '../../../../../utils/pilot-attachment-storage'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  await ensureChatTurnQueueSchema(event)

  const messages = await store.runtime.listMessages(sessionId)
  const attachments = (await store.runtime.listAttachments(sessionId)).map(item => ({
    ...item,
    previewUrl: buildPilotAttachmentPreviewUrl(sessionId, item.id),
  }))
  const runtimeState = await getSessionRunState(event, userId, sessionId)
  const session = await store.runtime.getSession(sessionId)

  return {
    session_id: sessionId,
    messages,
    attachments,
    run_state: runtimeState.runState,
    active_turn_id: runtimeState.activeTurnId,
    pending_count: runtimeState.pendingCount,
    updated_at: session?.updatedAt || new Date().toISOString(),
    title: session?.title || null,
  }
})
