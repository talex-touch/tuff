import { requirePilotAuth } from '../../../../utils/auth'
import { buildPilotAttachmentPreviewUrl } from '../../../../utils/pilot-attachment-storage'
import { requireSessionId } from '../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const messages = await store.runtime.listMessages(sessionId)
  const attachments = (await store.runtime.listAttachments(sessionId)).map(item => ({
    ...item,
    previewUrl: buildPilotAttachmentPreviewUrl(sessionId, item.id),
  }))

  return {
    messages,
    attachments,
  }
})
