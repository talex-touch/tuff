const DEFAULT_TRACE_TAIL_LIMIT = 2_000

function normalizePositiveInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.floor(parsed)
}

export function resolvePilotTraceTailWindow(lastSeq: unknown, limit = DEFAULT_TRACE_TAIL_LIMIT): {
  fromSeq: number
  limit: number
} {
  const boundedLimit = Math.min(Math.max(normalizePositiveInteger(limit) || DEFAULT_TRACE_TAIL_LIMIT, 1), DEFAULT_TRACE_TAIL_LIMIT)
  const normalizedLastSeq = normalizePositiveInteger(lastSeq)
  if (normalizedLastSeq <= boundedLimit) {
    return {
      fromSeq: 1,
      limit: boundedLimit,
    }
  }

  return {
    fromSeq: normalizedLastSeq - boundedLimit + 1,
    limit: boundedLimit,
  }
}

export async function listPilotTraceTail<T extends {
  listTrace: (sessionId: string, fromSeq?: number, limit?: number) => Promise<TItem[]>
}, TItem>(
  runtime: T,
  input: {
    sessionId: string
    lastSeq?: number
    limit?: number
  },
): Promise<TItem[]> {
  const window = resolvePilotTraceTailWindow(input.lastSeq, input.limit)
  return await runtime.listTrace(input.sessionId, window.fromSeq, window.limit)
}
