import { requirePilotAuth } from '../../../../utils/auth'
import { requireSessionId } from '../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const query = getQuery(event)

  const fromSeq = Number(query.fromSeq)
  const limit = Number(query.limit)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const traces = await store.runtime.listTrace(
    sessionId,
    Number.isFinite(fromSeq) ? Math.max(1, Math.floor(fromSeq)) : 1,
    Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 1000) : 200,
  )

  return {
    traces,
  }
})
