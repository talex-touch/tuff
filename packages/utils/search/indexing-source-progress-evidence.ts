import type { IndexedSourceEvidence } from './indexing-source'

export interface IndexedSourceProgressEvidenceReasons {
  pendingPermission: string
  failed: string
  pendingRoots: string
  running: string
  ready: string
}

export interface IndexedSourceProgressEvidenceInput {
  id: string
  label: string
  roots: string[]
  itemCount: number
  pendingRoots: number
  failedItems: number
  isActive: boolean
  checkedAt?: number
  pendingPermissionPaths?: string[]
  totalRoots?: number
  reasons?: Partial<IndexedSourceProgressEvidenceReasons>
  metadata?: Record<string, unknown>
}

const DEFAULT_PROGRESS_EVIDENCE_REASONS: IndexedSourceProgressEvidenceReasons = {
  pendingPermission: 'indexed-source-progress-pending-permission',
  failed: 'indexed-source-progress-has-failed-items',
  pendingRoots: 'indexed-source-progress-has-pending-roots',
  running: 'indexed-source-progress-running',
  ready: 'indexed-source-progress-ready'
}

export class IndexedSourceProgressEvidenceService {
  build(input: IndexedSourceProgressEvidenceInput): IndexedSourceEvidence {
    const pendingPermissionPaths = input.pendingPermissionPaths ?? []
    const pendingPermissionRoots = pendingPermissionPaths.length
    const itemCount = normalizeEvidenceCount(input.itemCount)
    const pendingRoots = normalizeEvidenceCount(input.pendingRoots)
    const failedItems = normalizeEvidenceCount(input.failedItems)
    const totalRoots = normalizeEvidenceCount(input.totalRoots ?? input.roots.length)
    const checkedAt = normalizeEvidenceTimestamp(input.checkedAt)
    const reasons = {
      ...DEFAULT_PROGRESS_EVIDENCE_REASONS,
      ...(input.reasons ?? {})
    }

    return {
      id: input.id,
      label: input.label,
      status: this.resolveStatus(
        failedItems,
        pendingRoots,
        input.isActive,
        pendingPermissionRoots
      ),
      itemCount,
      rootCount: input.roots.length,
      roots: input.roots,
      lastCheckedAt: checkedAt,
      reason: this.resolveReason(
        failedItems,
        pendingRoots,
        input.isActive,
        pendingPermissionRoots,
        reasons
      ),
      metadata: {
        ...(input.metadata ?? {}),
        totalRoots,
        pendingRoots,
        pendingPermissionRoots,
        pendingPermissionPaths
      }
    }
  }

  private resolveStatus(
    failedItems: number,
    pendingRoots: number,
    isActive: boolean,
    pendingPermissionRoots: number
  ): IndexedSourceEvidence['status'] {
    if (pendingPermissionRoots > 0) {
      return 'permission-required'
    }
    if (failedItems > 0) {
      return 'degraded'
    }
    if (pendingRoots > 0 || isActive) {
      return 'warming'
    }
    return 'ready'
  }

  private resolveReason(
    failedItems: number,
    pendingRoots: number,
    isActive: boolean,
    pendingPermissionRoots: number,
    reasons: IndexedSourceProgressEvidenceReasons
  ): string {
    if (pendingPermissionRoots > 0) {
      return reasons.pendingPermission
    }
    if (failedItems > 0) {
      return reasons.failed
    }
    if (pendingRoots > 0) {
      return reasons.pendingRoots
    }
    if (isActive) {
      return reasons.running
    }
    return reasons.ready
  }
}

function normalizeEvidenceTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now()
}

function normalizeEvidenceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}
