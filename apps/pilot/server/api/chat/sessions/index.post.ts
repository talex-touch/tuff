import { createError } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'

interface CreateSessionBody {
  sessionId?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const body = await readBody<CreateSessionBody>(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const created = await store.runtime.createSession({
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
    message: '',
    metadata: {
      source: 'pilot',
    },
  })

  await store.runtime.completeSession(created.sessionId, 'idle')
  const session = await store.runtime.getSession(created.sessionId)
  if (!session) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create session',
    })
  }

  return {
    session,
  }
})
