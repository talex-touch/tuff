export interface AgentErrorDetail {
  name?: string
  message: string
  stack?: string
  cause?: unknown
  code?: string
  statusCode?: number
  statusMessage?: string
  endpoint?: string
  model?: string
  phase?: string
  sessionId?: string
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function extractStatusCode(error: unknown): number | undefined {
  const row = toRecord(error)
  const response = toRecord(row.response)
  const candidates = [row.statusCode, row.status, response.status, response.statusCode]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

function extractStatusMessage(error: unknown): string | undefined {
  const row = toRecord(error)
  const response = toRecord(row.response)
  const candidates = [row.statusMessage, response.statusText, response.statusMessage]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

export function toAgentErrorDetail(
  error: unknown,
  extras: Partial<AgentErrorDetail> = {},
): AgentErrorDetail {
  const statusCode = extractStatusCode(error)
  const statusMessage = extractStatusMessage(error)

  if (error instanceof Error) {
    const withCode = error as Error & {
      code?: string | number
      endpoint?: string
      model?: string
      phase?: string
    }

    return {
      name: error.name,
      message: error.message || 'Unknown error',
      stack: error.stack,
      cause: error.cause,
      code: withCode.code ? String(withCode.code) : undefined,
      statusCode,
      statusMessage,
      endpoint: withCode.endpoint,
      model: withCode.model,
      phase: withCode.phase,
      ...extras,
    }
  }

  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>
    return {
      message: String(row.message || row.statusMessage || 'Unknown error'),
      code: row.code ? String(row.code) : undefined,
      statusCode,
      statusMessage,
      cause: row.cause,
      ...extras,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    statusCode,
    statusMessage,
    ...extras,
  }
}
