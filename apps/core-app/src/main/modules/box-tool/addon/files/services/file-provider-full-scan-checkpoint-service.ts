import type { FileFilterReason } from '@talex-touch/utils/common/file-filter-service'

/**
 * Where a full scan may stop and pick up again.
 *
 * `scan_progress` only ever recorded a root once the whole tree under it had been walked, so a
 * restart threw the walk away: on macOS the root is the entire home directory, the dev app is
 * restarted many times a day, and the log showed rounds of 20 minutes to 9.5 hours that never
 * finished. Recording each top-level child of a root as it completes turns a restart into a
 * resume; the granularity is a child directory, which is minutes of work instead of hours.
 */
export interface FileProviderFullScanCheckpointDeps {
  /** Immediate subdirectories of `rootPath` that the scan would descend into, sorted. */
  listChildDirectories: (rootPath: string, excludePathsSet?: Set<string>) => Promise<string[]>
  /** Which of `paths` already carry a completion record. */
  getCompletedPaths: (paths: string[]) => Promise<Set<string>>
  /** Writes one completion record; the same store the root record goes to. */
  recordCompleted: (path: string, reason: string) => Promise<void>
  /** Removes the child records once the root record is in place. */
  clearCompleted: (paths: string[], reason: string) => Promise<void>
  normalizePath?: (path: string) => string
  logDebug?: (message: string, meta?: Record<string, unknown>) => void
}

export interface FileProviderFullScanCheckpointPlan {
  rootPath: string
  children: string[]
  /** Children that still need a walk, in listing order. */
  pending: string[]
  /** Children skipped because a previous run finished them. */
  completed: string[]
}

export const FULL_SCAN_CHECKPOINT_REASON = 'scan-progress.checkpoint'
export const FULL_SCAN_CHECKPOINT_CLEAR_REASON = 'scan-progress.checkpoint-clear'

export interface FileProviderFullScanCheckpointHooks {
  /** The traversal filter, so a child the walker would refuse is never treated as a checkpoint. */
  getTraversalExclusionReason: (
    directoryPath: string,
    context: { siblingNames: readonly string[] }
  ) => FileFilterReason | null
}

export class FileProviderFullScanCheckpointService {
  private readonly normalizePath: (path: string) => string
  private readonly logDebug: NonNullable<FileProviderFullScanCheckpointDeps['logDebug']>

  constructor(private readonly deps: FileProviderFullScanCheckpointDeps) {
    this.normalizePath = deps.normalizePath ?? ((path) => path)
    this.logDebug = deps.logDebug ?? (() => undefined)
  }

  /**
   * Splits a root into the children still to walk. A root with no listable children yields an
   * empty plan and the caller walks it whole, which is the pre-checkpoint behaviour.
   */
  async plan(
    rootPath: string,
    excludePathsSet?: Set<string>
  ): Promise<FileProviderFullScanCheckpointPlan> {
    let children: string[]
    try {
      children = await this.deps.listChildDirectories(rootPath, excludePathsSet)
    } catch (error) {
      this.logDebug('Full scan checkpoint listing failed; scanning the root whole', {
        path: rootPath,
        error: error instanceof Error ? error.message : String(error)
      })
      return { rootPath, children: [], pending: [], completed: [] }
    }
    if (children.length === 0) {
      return { rootPath, children: [], pending: [], completed: [] }
    }

    const completedRows = await this.deps.getCompletedPaths(children)
    const completedKeys = new Set(
      Array.from(completedRows, (completedPath) => this.normalizePath(completedPath))
    )
    const completed = children.filter((child) => completedKeys.has(this.normalizePath(child)))
    const pending = children.filter((child) => !completedKeys.has(this.normalizePath(child)))
    if (completed.length > 0) {
      this.logDebug('Full scan resumes past completed subtrees', {
        path: rootPath,
        completed: completed.length,
        pending: pending.length
      })
    }
    return { rootPath, children, pending, completed }
  }

  /** Records a child as walked. Called after its records are inserted, never before. */
  async markChildCompleted(childPath: string): Promise<void> {
    await this.deps.recordCompleted(childPath, FULL_SCAN_CHECKPOINT_REASON)
  }

  /**
   * Drops the child records of a finished root. The caller writes the root's own record first,
   * so at no point is a root both unrecorded and stripped of its checkpoints.
   */
  async clearRootCheckpoints(children: readonly string[]): Promise<void> {
    if (children.length === 0) return
    await this.deps.clearCompleted(Array.from(children), FULL_SCAN_CHECKPOINT_CLEAR_REASON)
  }
}

/**
 * The exclude set a root-only walk needs: every child directory, so the walker yields the files
 * that sit directly in the root and descends into nothing. Children are walked on their own.
 */
export function buildRootOnlyExcludePaths(
  children: readonly string[],
  excludePathsSet?: Set<string>
): Set<string> {
  const combined = new Set<string>(excludePathsSet ?? [])
  for (const child of children) combined.add(child)
  return combined
}

/**
 * Lists the subdirectories the walker would enter, applying the same per-level traversal filter
 * with the sibling names it uses (#1727 context-dependent leaf names).
 */
export async function listScanChildDirectories(
  rootPath: string,
  input: {
    readdir: (
      path: string
    ) => Promise<Array<{ name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }>>
    join: (root: string, name: string) => string
    hooks: FileProviderFullScanCheckpointHooks
    excludePathsSet?: Set<string>
  }
): Promise<string[]> {
  const entries = await input.readdir(rootPath)
  const siblingNames = entries.map((entry) => entry.name)
  const children: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const fullPath = input.join(rootPath, entry.name)
    if (input.excludePathsSet?.has(fullPath)) continue
    if (input.hooks.getTraversalExclusionReason(fullPath, { siblingNames }) !== null) continue
    children.push(fullPath)
  }
  return children.sort((left, right) => left.localeCompare(right))
}
