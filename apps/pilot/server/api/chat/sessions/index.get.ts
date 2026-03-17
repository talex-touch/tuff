import { requirePilotAuth } from '../../../utils/auth'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const query = getQuery(event)
  const limit = Number(query.limit)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const sessions = await store.runtime.listSessions(
    Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20,
  )

  return {
    sessions,
  }
})
