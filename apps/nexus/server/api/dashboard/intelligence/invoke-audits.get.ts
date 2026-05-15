import type { ProviderUsageLedgerMode, ProviderUsageLedgerStatus } from '../../../utils/providerUsageLedgerStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listCreditLedgerByTraceIds } from '../../../utils/creditsStore'
import { listProviderUsageLedgerEntries } from '../../../utils/providerUsageLedgerStore'

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string')
    return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  return readOptionalString(metadata[key])
}

function extractInvokeAuditMetadata(trace: Array<Record<string, unknown>>) {
  const metadata = trace
    .map(step => asRecord(step.metadata))
    .find(item => readMetadataString(item, 'source') || readMetadataString(item, 'workflowId'))
    ?? {}

  return {
    source: readMetadataString(metadata, 'source'),
    caller: readMetadataString(metadata, 'caller'),
    sessionId: readMetadataString(metadata, 'sessionId'),
    workflowId: readMetadataString(metadata, 'workflowId'),
    workflowName: readMetadataString(metadata, 'workflowName'),
    workflowRunId: readMetadataString(metadata, 'workflowRunId'),
    workflowStepId: readMetadataString(metadata, 'workflowStepId'),
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const traceId = readOptionalString(query.traceId)
  const page = readPositiveInteger(query.page) ?? 1
  const limit = Math.min(100, readPositiveInteger(query.limit) ?? 50)

  const usageLedger = await listProviderUsageLedgerEntries(event, {
    sceneId: 'nexus.intelligence.invoke',
    runId: readOptionalString(query.runId),
    providerId: readOptionalString(query.providerId),
    capability: readOptionalString(query.capability),
    providerUsageRef: traceId,
    status: readOptionalString(query.status) as ProviderUsageLedgerStatus | undefined,
    mode: readOptionalString(query.mode) as ProviderUsageLedgerMode | undefined,
    page,
    limit,
  })

  const traceIds = usageLedger.entries
    .map(entry => entry.providerUsageRef)
    .filter((value): value is string => Boolean(value))
  const creditEntries = await listCreditLedgerByTraceIds(event, traceIds)
  const creditByTraceId = new Map(
    creditEntries
      .map((entry) => {
        const entryTraceId = readOptionalString(entry.metadata?.traceId)
        return entryTraceId ? [entryTraceId, entry] as const : null
      })
      .filter((entry): entry is readonly [string, typeof creditEntries[number]] => Boolean(entry)),
  )

  const entries = usageLedger.entries.map((entry) => {
    const entryTraceId = entry.providerUsageRef ?? entry.runId.replace(/^intelligence_invoke_/, '')
    const audit = extractInvokeAuditMetadata(entry.trace)
    const credit = entryTraceId ? creditByTraceId.get(entryTraceId) : undefined
    const creditMetadata = asRecord(credit?.metadata)

    return {
      traceId: entryTraceId,
      runId: entry.runId,
      usageLedgerId: entry.id,
      creditLedgerId: credit?.id ?? null,
      creditCreatedAt: credit?.createdAt ?? null,
      providerCreatedAt: entry.createdAt,
      source: audit.source ?? readOptionalString(creditMetadata.source) ?? null,
      caller: audit.caller ?? readOptionalString(creditMetadata.caller) ?? null,
      sessionId: audit.sessionId ?? readOptionalString(creditMetadata.sessionId) ?? null,
      workflowId: audit.workflowId ?? readOptionalString(creditMetadata.workflowId) ?? null,
      workflowName: audit.workflowName ?? readOptionalString(creditMetadata.workflowName) ?? null,
      workflowRunId: audit.workflowRunId ?? readOptionalString(creditMetadata.workflowRunId) ?? null,
      workflowStepId: audit.workflowStepId ?? readOptionalString(creditMetadata.workflowStepId) ?? null,
      providerId: entry.providerId,
      capability: entry.capability,
      status: entry.status,
      mode: entry.mode,
      unit: entry.unit,
      quantity: entry.quantity,
      billable: entry.billable,
      chargedCredits: credit ? Math.abs(credit.delta) : 0,
      billingMatched: Boolean(credit),
      userId: credit?.userId ?? null,
      userEmail: credit?.userEmail ?? null,
      teamId: credit?.teamId ?? null,
    }
  })

  return {
    entries,
    pagination: {
      page: usageLedger.page,
      limit: usageLedger.limit,
      total: usageLedger.total,
      totalPages: Math.ceil(usageLedger.total / usageLedger.limit),
    },
  }
})
