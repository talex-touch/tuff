import type { H3Event } from 'h3'
import { createError } from 'h3'

export function requireSessionId(event: H3Event): string {
  const sessionId = String(event.context.params?.sessionId || '').trim()
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId is required',
    })
  }
  return sessionId
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>
    if (typeof row.statusMessage === 'string' && row.statusMessage.trim()) {
      return row.statusMessage
    }
    if (typeof row.message === 'string' && row.message.trim()) {
      return row.message
    }
  }
  return 'Unknown error'
}
