import type {
  UpdateHistoryEntry,
  UpdateHistoryOutcome,
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot
} from '@talex-touch/utils'

const DEFAULT_HISTORY_LIMIT = 20
const MAX_HISTORY_LIMIT = 50

const HISTORY_OUTCOMES: Partial<Record<UpdateLifecyclePhase, UpdateHistoryOutcome>> = {
  healthy: 'updated',
  recovered: 'rolled-back',
  failed: 'failed'
}

/**
 * Projects finished update attempts into this device's update history: newest first, one row per
 * target version (its latest attempt, so a retry that succeeded replaces the failures before it),
 * at most `limit` rows. Attempts that never named a target version, or did not end an update,
 * are left out.
 */
export function buildUpdateHistory(
  snapshots: readonly UpdateLifecycleSnapshot[],
  limit?: number
): UpdateHistoryEntry[] {
  const maxEntries = clampHistoryLimit(limit)
  const newestFirst = [...snapshots].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt
  )
  const seenVersions = new Set<string>()
  const entries: UpdateHistoryEntry[] = []

  for (const snapshot of newestFirst) {
    const outcome = HISTORY_OUTCOMES[snapshot.phase]
    const toVersion = snapshot.targetVersion
    if (!outcome || !toVersion || !snapshot.attemptId || seenVersions.has(toVersion)) {
      continue
    }
    seenVersions.add(toVersion)
    entries.push({
      attemptId: snapshot.attemptId,
      fromVersion: snapshot.currentVersion,
      toVersion,
      channel: snapshot.channel,
      outcome,
      finishedAt: snapshot.updatedAt,
      error: snapshot.error
    })
    if (entries.length === maxEntries) {
      break
    }
  }

  return entries
}

/** The limit comes from the renderer, so a value that is not a number gets the default. */
function clampHistoryLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_HISTORY_LIMIT
  }
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(limit)))
}
