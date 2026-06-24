import type { ContextCheckpoint, ContextPackageLog } from '@talex-touch/tuff-intelligence'

export interface ContextPackageLogSourceSummary {
  sourceType: ContextPackageLog['items'][number]['sourceType']
  count: number
}

export interface ContextPackageLogSafeSummary {
  id: string
  sessionId: string
  scope: ContextPackageLog['scope']
  traceId?: string
  tokenBudget: number
  tokenEstimate: number
  itemCount: number
  retrievalItemCount: number
  citationCount: number
  sourceTypes: ContextPackageLogSourceSummary[]
  retrievalStatus?: string
  degradedReason?: string
  excludedCount: number
  policyBlockedCount: number
  prunedCount: number
}

export interface ContextCheckpointSafeSummary {
  id: string
  sessionId: string
  type: ContextCheckpoint['type']
  reason: string
  contextScope: ContextCheckpoint['contextScope']
  metadataKeys: string[]
  createdAt: number
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function countItemCitations(log: ContextPackageLog): number {
  return log.items.reduce((total, item) => {
    const metadata = getRecord(item.metadata)
    return total + (getRecord(metadata?.citation) ? 1 : 0)
  }, 0)
}

function getExcludedItems(metadata: Record<string, unknown> | null): Record<string, unknown>[] {
  const excluded = metadata?.excluded
  if (!Array.isArray(excluded)) {
    return []
  }
  return excluded.filter((item): item is Record<string, unknown> => Boolean(getRecord(item)))
}

export function summarizeContextPackageLog(log: ContextPackageLog): ContextPackageLogSafeSummary {
  const sourceCounts = new Map<ContextPackageLog['items'][number]['sourceType'], number>()
  for (const item of log.items) {
    sourceCounts.set(item.sourceType, (sourceCounts.get(item.sourceType) ?? 0) + 1)
  }

  const packageMetadata = getRecord(log.metadata)
  const retrievalMetadata = getRecord(packageMetadata?.retrieval)
  const metadataCitationCount = getNumber(retrievalMetadata?.citationCount)
  const degradedReason = getString(retrievalMetadata?.degradedReason)
  const excludedItems = getExcludedItems(packageMetadata)

  return {
    id: log.id,
    sessionId: log.sessionId,
    scope: log.scope,
    traceId: log.traceId,
    tokenBudget: log.tokenBudget,
    tokenEstimate: log.tokenEstimate,
    itemCount: log.items.length,
    retrievalItemCount: sourceCounts.get('retrieval') ?? 0,
    citationCount: metadataCitationCount ?? countItemCitations(log),
    sourceTypes: [...sourceCounts.entries()].map(([sourceType, count]) => ({ sourceType, count })),
    retrievalStatus: getString(retrievalMetadata?.status),
    degradedReason,
    excludedCount: excludedItems.length,
    policyBlockedCount: excludedItems.filter((item) =>
      getString(item.reason)?.includes('policy-blocked')
    ).length,
    prunedCount: excludedItems.filter((item) => getString(item.reason) === 'token-budget-pruned')
      .length
  }
}

export function summarizeContextCheckpoint(
  checkpoint: ContextCheckpoint
): ContextCheckpointSafeSummary {
  const metadata = getRecord(checkpoint.metadata)
  return {
    id: checkpoint.id,
    sessionId: checkpoint.sessionId,
    type: checkpoint.type,
    reason: checkpoint.reason,
    contextScope: checkpoint.contextScope,
    metadataKeys: metadata ? Object.keys(metadata).sort() : [],
    createdAt: checkpoint.createdAt
  }
}
