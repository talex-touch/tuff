import { requireAuth } from '../../../utils/auth'
import { getAssistantSession, getLatestAssistantSessionByDoc, listAssistantMessages } from '../../../utils/docAssistantStore'

export default defineEventHandler(async (event) => {
  try {
    const auth = await requireAuth(event)
    const userId = auth.userId
    const query = getQuery(event)

    const sessionIdInput = typeof query.sessionId === 'string' ? query.sessionId.trim() : ''
    const docPathInput = typeof query.path === 'string' ? query.path.trim() : ''

    let session = sessionIdInput
      ? await getAssistantSession(event, userId, sessionIdInput)
      : null

    if (!session && docPathInput) {
      session = await getLatestAssistantSessionByDoc(event, userId, docPathInput)
    }

    if (!session) {
      return { ok: true, result: { sessionId: null, messages: [] } }
    }

    const messages = await listAssistantMessages(event, userId, session.id, { limit: 200 })

    return {
      ok: true,
      result: {
        sessionId: session.id,
        messages: messages.map(message => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      },
    }
  }
  catch (error: any) {
    return { ok: false, error: error?.message || 'Request failed.' }
  }
})
