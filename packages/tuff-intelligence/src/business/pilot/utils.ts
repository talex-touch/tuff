import type { AgentErrorDetail } from '../../protocol/error-detail'
import { toAgentErrorDetail } from '../../protocol/error-detail'

export function toPilotSafeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function toPilotJsonSafe<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  }
  catch {
    return value
  }
}

export function toPilotStreamErrorDetail(
  error: unknown,
  phase: string,
  extras: Partial<AgentErrorDetail> = {},
): Record<string, unknown> {
  return toPilotSafeRecord(
    toPilotJsonSafe(
      toAgentErrorDetail(error, {
        phase,
        ...extras,
      }),
    ),
  )
}
