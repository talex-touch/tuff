import { requirePilotAuth } from '../../../../utils/auth'
import { deletePilotAttachmentObject } from '../../../../utils/pilot-attachment-storage'
import { requireSessionId } from '../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const attachments = await store.runtime.listAttachments(sessionId)
  for (const attachment of attachments) {
    await deletePilotAttachmentObject(event, attachment.ref)
  }

  await store.runtime.deleteSession(sessionId)

  return {
    ok: true,
    sessionId,
  }
})
