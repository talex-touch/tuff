import { getQuery, readBody } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { logAdminAudit } from '../../../utils/adminAuditStore'
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
  const { userId, authType } = await requireAdminOrApiKey(event, ['maintenance:write'])

  const query = getQuery(event)
  const body = await readBody(event).catch(() => ({}))
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  const result = await runTelemetryRetention(event, {
    telemetryRetentionDays: readNumber(payload.telemetryRetentionDays ?? query.telemetryRetentionDays),
    governanceRetentionDays: readNumber(payload.governanceRetentionDays ?? query.governanceRetentionDays),
    batchLimit: readNumber(payload.batchLimit ?? query.batchLimit),
    dryRun: readBoolean(payload.dryRun ?? query.dryRun, true),
  })

  // This endpoint deletes telemetry, so the trail has to distinguish a rehearsal
  // from a real sweep and say how much each run actually removed. `result.dryRun`
  // is the effective value after normalisation, not what the caller asked for.
  const deletedTotal = result.tables.reduce((sum, table) => sum + table.deleted, 0)
  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'maintenance.telemetry_retention.run',
    targetType: 'telemetry_retention',
    targetId: null,
    targetLabel: result.dryRun ? 'dry-run' : `delete ${deletedTotal} row(s)`,
    metadata: {
      authType,
      dryRun: result.dryRun,
      deletedTotal,
      telemetryRetentionDays: result.telemetryRetentionDays,
      governanceRetentionDays: result.governanceRetentionDays,
      batchLimit: result.batchLimit,
      tables: result.tables.map(table => ({
        table: table.table,
        cutoff: table.cutoff,
        matched: table.matched,
        deleted: table.deleted,
      })),
    },
  })

  return {
    result,
  }
})
