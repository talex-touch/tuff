import type { ContextCheckpoint, ContextPackageLog } from '@talex-touch/tuff-intelligence'

export interface ContextPackageLogSourceSummary {
  sourceType: ContextPackageLog['items'][number]['sourceType']
  count: number
}

export interface ContextPackageLogCitationSummary {
  documentId?: string
  chunkId?: string
  title?: string
  sourceType?: string
  sourceUri?: string
}

export interface ContextPackageLogExplainItem {
  sourceType: ContextPackageLog['items'][number]['sourceType'] | 'unknown'
  sourceId: string
  reason: string
  tokenEstimate?: number
  citation?: ContextPackageLogCitationSummary
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
  tombstoneCount: number
  includedItems: ContextPackageLogExplainItem[]
  excludedItems: ContextPackageLogExplainItem[]
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

export type ContextExplainReasonI18nKey = 'intelligence.audit.contextReasonMemoryTombstoned'

export function getContextExplainReasonI18nKey(
  reason: string
): ContextExplainReasonI18nKey | undefined {
  return reason === 'memory-tombstoned'
    ? 'intelligence.audit.contextReasonMemoryTombstoned'
    : undefined
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

function getSourceType(value: unknown): ContextPackageLogExplainItem['sourceType'] {
  if (
    value === 'current_input' ||
    value === 'recent_turn' ||
    value === 'summary' ||
    value === 'memory' ||
    value === 'retrieval'
  ) {
    return value
  }
  return 'unknown'
}

function countItemCitations(log: ContextPackageLog): number {
  return log.items.reduce((total, item) => {
    const metadata = getRecord(item.metadata)
    return total + (getRecord(metadata?.citation) ? 1 : 0)
  }, 0)
}

function getCitationSummary(
  metadata: Record<string, unknown> | null
): ContextPackageLogCitationSummary | undefined {
  const citation = getRecord(metadata?.citation)
  if (!citation) {
    return undefined
  }
  return {
    documentId: getString(citation.documentId),
    chunkId: getString(citation.chunkId),
    title: getString(citation.title),
    sourceType: getString(citation.sourceType),
    sourceUri: getString(citation.sourceUri)
  }
}

function getExcludedItems(metadata: Record<string, unknown> | null): Record<string, unknown>[] {
  const excluded = metadata?.excluded
  if (!Array.isArray(excluded)) {
    return []
  }
  return excluded.filter((item): item is Record<string, unknown> => Boolean(getRecord(item)))
}

function summarizeIncludedItem(
  item: ContextPackageLog['items'][number]
): ContextPackageLogExplainItem {
  const metadata = getRecord(item.metadata)
  return {
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    reason: item.reason,
    tokenEstimate: item.tokenEstimate,
    citation: getCitationSummary(metadata)
  }
}

function summarizeExcludedItem(item: Record<string, unknown>): ContextPackageLogExplainItem {
  return {
    sourceType: getSourceType(item.sourceType),
    sourceId: getString(item.sourceId) ?? '',
    reason: getString(item.reason) ?? 'unknown',
    tokenEstimate: getNumber(item.tokenEstimate)
  }
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
      .length,
    tombstoneCount: excludedItems.filter((item) => getString(item.reason) === 'memory-tombstoned')
      .length,
    includedItems: log.items.map(summarizeIncludedItem),
    excludedItems: excludedItems.map(summarizeExcludedItem)
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
