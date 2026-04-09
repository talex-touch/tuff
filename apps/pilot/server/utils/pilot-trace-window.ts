const DEFAULT_TRACE_TAIL_LIMIT = 2_000
const DEFAULT_TRACE_TAIL_MAX_BATCHES = 4

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

function hasTurnStartedTrace<TItem extends { type: string }>(items: TItem[]): boolean {
  return items.some(item => String(item?.type || '').trim() === 'turn.started')
}

export async function listPilotTraceTail<T extends {
  listTrace: (sessionId: string, fromSeq?: number, limit?: number) => Promise<TItem[]>
}, TItem extends { type: string }>(
  runtime: T,
  input: {
    sessionId: string
    lastSeq?: number
    limit?: number
    maxBatches?: number
  },
): Promise<TItem[]> {
  const window = resolvePilotTraceTailWindow(input.lastSeq, input.limit)
  const maxBatches = Math.max(1, normalizePositiveInteger(input.maxBatches) || DEFAULT_TRACE_TAIL_MAX_BATCHES)
  let traces = await runtime.listTrace(input.sessionId, window.fromSeq, window.limit)

  if (traces.length <= 0 || hasTurnStartedTrace(traces) || window.fromSeq <= 1) {
    return traces
  }

  let currentFromSeq = window.fromSeq
  let batches = 1
  while (currentFromSeq > 1 && batches < maxBatches && !hasTurnStartedTrace(traces)) {
    const previousToSeq = currentFromSeq - 1
    const previousFromSeq = Math.max(1, previousToSeq - window.limit + 1)
    const previousLimit = previousToSeq - previousFromSeq + 1
    const previousBatch = await runtime.listTrace(input.sessionId, previousFromSeq, previousLimit)
    if (previousBatch.length <= 0) {
      break
    }
    traces = [...previousBatch, ...traces]
    currentFromSeq = previousFromSeq
    batches += 1
    if (previousBatch.length < previousLimit) {
      break
    }
  }

  return traces
}
