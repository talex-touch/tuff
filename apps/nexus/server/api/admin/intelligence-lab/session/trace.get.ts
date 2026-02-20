import { requireAdmin } from '../../../../utils/auth'
import { listRuntimeTraceEvents } from '../../../../utils/tuffIntelligenceRuntimeStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const query = getQuery(event)
  const sessionId = String(query.sessionId || '').trim()
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId is required',
    })
  }

  const fromSeq = Number(query.fromSeq)
  const limit = Number(query.limit)
  const traces = await listRuntimeTraceEvents(event, {
    sessionId,
    userId,
    fromSeq: Number.isFinite(fromSeq) ? fromSeq : 1,
    limit: Number.isFinite(limit) ? limit : 200,
  })
  return {
    traces: traces.map(trace => trace.payload),
  }
})

