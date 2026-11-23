export {
  DEFAULT_BRANCH_PREFIX,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_BYTES,
  GitWorktreeManager,
  gitWorktreeManager
} from './git-worktree-manager'
export {
  GitWorktreeError,
  isGitWorktreeError,
  type AcquireWorktreeOptions,
  type DisposeAllWorktreesOptions,
  type GitWorktreeErrorCode,
  type GitWorktreeErrorOptions,
  type GitWorktreeManagerOptions,
  type ReapOrphansOptions,
  type ReapOrphansResult,
  type ReleaseWorktreeOptions,
  type ReleaseWorktreeResult,
  type WorktreeDiffOptions,
  type WorktreeDiffResult,
  type WorktreeFileChange,
  type WorktreeFileChangeKind,
  type WorktreeLease,
  type WorktreeStatus
} from './types'
