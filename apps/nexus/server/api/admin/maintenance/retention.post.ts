import { getQuery, readBody } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { runTelemetryRetention } from '../../../utils/telemetryRetentionStore'

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (['1', 'true', 'yes'].includes(normalized))
      return true
    if (['0', 'false', 'no'].includes(normalized))
      return false
  }
  return fallback
}

function readNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['maintenance:write'])

  const query = getQuery(event)
  const body = await readBody(event).catch(() => ({}))
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  const result = await runTelemetryRetention(event, {
    telemetryRetentionDays: readNumber(payload.telemetryRetentionDays ?? query.telemetryRetentionDays),
    governanceRetentionDays: readNumber(payload.governanceRetentionDays ?? query.governanceRetentionDays),
    batchLimit: readNumber(payload.batchLimit ?? query.batchLimit),
    dryRun: readBoolean(payload.dryRun ?? query.dryRun, true),
  })

  return {
    result,
  }
})
