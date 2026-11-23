export type GitWorktreeErrorCode =
  | 'WORKTREE_INVALID_REPO'
  | 'WORKTREE_NOT_GIT_REPO'
  | 'WORKTREE_BARE_REPO'
  | 'WORKTREE_INVALID_REF'
  | 'WORKTREE_NOT_FOUND'
  | 'WORKTREE_DIRTY'
  | 'WORKTREE_PATH_ESCAPE'
  | 'WORKTREE_GIT_TIMEOUT'
  | 'WORKTREE_GIT_FAILED'

export interface GitWorktreeErrorOptions {
  changedFiles?: readonly string[]
  cause?: unknown
}

export class GitWorktreeError extends Error {
  readonly code: GitWorktreeErrorCode
  readonly changedFiles?: readonly string[]

  constructor(code: GitWorktreeErrorCode, message: string, options?: GitWorktreeErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'GitWorktreeError'
    this.code = code
    if (options?.changedFiles !== undefined) {
      this.changedFiles = [...options.changedFiles]
    }
  }
}

export function isGitWorktreeError(error: unknown): error is GitWorktreeError {
  return error instanceof GitWorktreeError
}

export interface GitWorktreeManagerOptions {
  /**
   * App-managed storage directory for linked worktrees and `.meta/` lease records.
   * Must live outside any target repository root.
   * Defaults lazily to `path.join(app.getPath('userData'), 'ai-worktrees')`.
   */
  baseDir?: string
  /** Bounded timeout in milliseconds for each git subprocess (default: 15_000). */
  gitTimeoutMs?: number
  /** Default maximum byte length of unified diff patches (default: 262_144). */
  maxDiffBytes?: number
  /** Default branch prefix for created worktree branches (default: 'tuff/wt'). */
  defaultBranchPrefix?: string
  /** Optional git executable path override (default: 'git'). */
  gitBinary?: string
  /** Optional clock provider for deterministic tests (default: Date.now). */
  now?: () => number
}

export interface AcquireWorktreeOptions {
  runId: string
  conversationId?: string
  repoRoot: string
  baseRef?: string
  branchPrefix?: string
  detached?: boolean
}

export interface WorktreeLease {
  worktreeId: string
  runId: string
  conversationId?: string
  repoRoot: string
  worktreePath: string
  effectiveCwd: string
  branchName: string | null
  baseRef: string
  baseCommit: string
  createdAt: number
}

export type WorktreeFileChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unmerged'
  | 'typechange'
  | 'unknown'

export interface WorktreeFileChange {
  path: string
  previousPath?: string
  indexStatus: string
  worktreeStatus: string
  kind: WorktreeFileChangeKind
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface WorktreeStatus {
  worktreeId: string
  worktreePath: string
  branchName: string | null
  headCommit: string
  dirty: boolean
  changedFiles: WorktreeFileChange[]
  ahead: number
  behind: number
}

export interface WorktreeDiffOptions {
  maxBytes?: number
}

export interface WorktreeDiffResult {
  worktreeId: string
  status: WorktreeStatus
  patch: string
  truncated: boolean
  byteLength: number
}

export interface ReleaseWorktreeOptions {
  force?: boolean
  deleteBranch?: boolean
}

export interface ReleaseWorktreeResult {
  worktreeId: string
  removed: boolean
  branchDeleted: boolean
}

export interface ReapOrphansOptions {
  maxAgeMs?: number
  activeRunIds?: Iterable<string>
  force?: boolean
}

export interface ReapOrphansResult {
  reapedIds: string[]
  skippedActiveIds: string[]
  skippedDirtyIds: string[]
  failedIds: string[]
}

export interface DisposeAllWorktreesOptions {
  force?: boolean
  timeoutMs?: number
}
