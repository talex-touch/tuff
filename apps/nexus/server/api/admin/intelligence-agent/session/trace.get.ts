import { requireAdmin } from '../../../../utils/auth'
import { normalizeNexusIntelligenceTransportError } from '../../../../utils/intelligenceErrorContract'
import { listRuntimeTraceEvents } from '../../../../utils/tuffIntelligenceRuntimeStore'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function sanitizeTracePayload(trace: Record<string, unknown>): Record<string, unknown> {
  let sanitized = trace
  if (Object.hasOwn(trace, 'error')) {
    sanitized = {
      ...sanitized,
      error: normalizeNexusIntelligenceTransportError(trace.error),
    }
  }

  const payload = asRecord(trace.payload)
  if (Object.hasOwn(payload, 'error')) {
    sanitized = {
      ...sanitized,
      payload: {
        ...payload,
        error: normalizeNexusIntelligenceTransportError(payload.error),
      },
    }
  }
  return sanitized
}

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
    traces: traces.map(trace => sanitizeTracePayload(trace.payload)),
  }
})

