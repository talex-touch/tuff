import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export interface WorkspaceGitTarget {
  cwd?: string
  conversationId?: string
}

export type WorkspaceGitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unmerged'
  | 'typechange'

export interface WorkspaceGitFileEntry {
  /** Repository-relative POSIX path. */
  path: string
  /** Previous path when renamed or copied. */
  oldPath?: string
  /** Single-character index status code (porcelain X). */
  indexStatus: string
  /** Single-character worktree status code (porcelain Y). */
  worktreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
  status: WorkspaceGitFileStatus
}

export interface WorkspaceGitStatusResult {
  available: boolean
  isRepo: boolean
  cwd: string
  repoRoot?: string
  branch: string
  detached: boolean
  headShortOid?: string
  upstream?: string
  ahead: number
  behind: number
  hasRemote: boolean
  files: WorkspaceGitFileEntry[]
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  conflictedCount: number
  error?: string
}

export interface WorkspaceGitDiffRequest extends WorkspaceGitTarget {
  path: string
  staged?: boolean
  untracked?: boolean
  /** Optional commit hash to inspect the file diff introduced by that commit. */
  commitHash?: string
  /** Optional previous path for renamed/copied files in commit diffs. */
  oldPath?: string
}

export interface WorkspaceGitDiffResult {
  path: string
  staged: boolean
  diff: string
  additions: number
  deletions: number
  binary: boolean
  truncated: boolean
  empty: boolean
  error?: string
}

export interface WorkspaceGitAuthorAvatar {
  name: string
  email?: string
  avatarUrl?: string
}

export interface WorkspaceGitBranchEntry {
  name: string
  /** Canonical Git ref name (e.g. `refs/heads/main`, `refs/remotes/origin/main`). */
  fullRef?: string
  /** Matched configured remote name for remote-tracking branches (supports remotes containing `/`). */
  remoteName?: string
  current: boolean
  isRemote: boolean
  upstream?: string
  shortOid?: string
  subject?: string
  author?: string
  authorEmail?: string
  /** Recent unique commit authors on this branch (newest first) for avatar stack rendering. */
  authors?: WorkspaceGitAuthorAvatar[]
  relativeDate?: string
}

export type WorkspaceGitRemoteProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'gitee'
  | 'codeberg'
  | 'local'
  | 'custom'

export interface WorkspaceGitRemoteEntry {
  name: string
  fetchUrl: string
  pushUrl: string
  host?: string
  provider: WorkspaceGitRemoteProvider
  displayLabel?: string
  webUrl?: string
  hasCredentials?: boolean
}

export interface WorkspaceGitBranchesResult {
  current: string
  detached: boolean
  branches: WorkspaceGitBranchEntry[]
  remotes?: WorkspaceGitRemoteEntry[]
  /** Present when remote enumeration failed so callers preserve existing remote state. */
  remotesError?: string
  error?: string
}

export interface WorkspaceGitLogRequest extends WorkspaceGitTarget {
  limit?: number
  /** Optional branch or ref name to inspect commits for (defaults to HEAD). */
  ref?: string
}

export interface WorkspaceGitCommitEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  authorEmail?: string
  avatarUrl?: string
  relativeDate: string
  authoredAt: number
  refs: string[]
}

export interface WorkspaceGitLogResult {
  commits: WorkspaceGitCommitEntry[]
  error?: string
}

export interface WorkspaceGitCommitFilesRequest extends WorkspaceGitTarget {
  hash: string
}

export interface WorkspaceGitCommitFileEntry {
  path: string
  oldPath?: string
  status: WorkspaceGitFileStatus
  additions: number
  deletions: number
  binary: boolean
}

export interface WorkspaceGitCommitFilesResult {
  hash: string
  files: WorkspaceGitCommitFileEntry[]
  totalAdditions: number
  totalDeletions: number
  error?: string
}

export interface WorkspaceGitStageRequest extends WorkspaceGitTarget {
  paths?: string[]
  all?: boolean
}

export interface WorkspaceGitDiscardRequest extends WorkspaceGitTarget {
  path: string
  untracked?: boolean
}

export interface WorkspaceGitCommitRequest extends WorkspaceGitTarget {
  message: string
}

export interface WorkspaceGitCheckoutRequest extends WorkspaceGitTarget {
  branch: string
  create?: boolean
  startPoint?: string
}

export interface WorkspaceGitRenameBranchRequest extends WorkspaceGitTarget {
  oldName: string
  newName: string
}

export interface WorkspaceGitDeleteBranchRequest extends WorkspaceGitTarget {
  branch: string
  force?: boolean
}

export interface WorkspaceGitSetUpstreamRequest extends WorkspaceGitTarget {
  branch: string
  /** Remote-tracking ref (e.g. `origin/main`), or null/empty to unset upstream. */
  upstream?: string | null
}

export interface WorkspaceGitSaveRemoteRequest extends WorkspaceGitTarget {
  mode: 'add' | 'edit'
  name: string
  originalName?: string
  fetchUrl: string
  pushUrl?: string
}

export interface WorkspaceGitRemoveRemoteRequest extends WorkspaceGitTarget {
  name: string
}

export interface WorkspaceGitFetchRequest extends WorkspaceGitTarget {
  remote?: string
}

export interface WorkspaceGitPushRequest extends WorkspaceGitTarget {
  setUpstream?: boolean
}

export interface WorkspaceGitMutationResult {
  ok: boolean
  summary?: string
  error?: string
  status?: WorkspaceGitStatusResult
}

export const WorkspaceGitEvents = {
  status: defineEvent('workspace-git')
    .module('api')
    .event('status')
    .define<WorkspaceGitTarget, WorkspaceGitStatusResult>(),
  diff: defineEvent('workspace-git')
    .module('api')
    .event('diff')
    .define<WorkspaceGitDiffRequest, WorkspaceGitDiffResult>(),
  branches: defineEvent('workspace-git')
    .module('api')
    .event('branches')
    .define<WorkspaceGitTarget, WorkspaceGitBranchesResult>(),
  log: defineEvent('workspace-git')
    .module('api')
    .event('log')
    .define<WorkspaceGitLogRequest, WorkspaceGitLogResult>(),
  commitFiles: defineEvent('workspace-git')
    .module('api')
    .event('commit-files')
    .define<WorkspaceGitCommitFilesRequest, WorkspaceGitCommitFilesResult>(),
  stage: defineEvent('workspace-git')
    .module('api')
    .event('stage')
    .define<WorkspaceGitStageRequest, WorkspaceGitMutationResult>(),
  unstage: defineEvent('workspace-git')
    .module('api')
    .event('unstage')
    .define<WorkspaceGitStageRequest, WorkspaceGitMutationResult>(),
  discard: defineEvent('workspace-git')
    .module('api')
    .event('discard')
    .define<WorkspaceGitDiscardRequest, WorkspaceGitMutationResult>(),
  commit: defineEvent('workspace-git')
    .module('api')
    .event('commit')
    .define<WorkspaceGitCommitRequest, WorkspaceGitMutationResult>(),
  checkout: defineEvent('workspace-git')
    .module('api')
    .event('checkout')
    .define<WorkspaceGitCheckoutRequest, WorkspaceGitMutationResult>(),
  renameBranch: defineEvent('workspace-git')
    .module('api')
    .event('rename-branch')
    .define<WorkspaceGitRenameBranchRequest, WorkspaceGitMutationResult>(),
  deleteBranch: defineEvent('workspace-git')
    .module('api')
    .event('delete-branch')
    .define<WorkspaceGitDeleteBranchRequest, WorkspaceGitMutationResult>(),
  setUpstream: defineEvent('workspace-git')
    .module('api')
    .event('set-upstream')
    .define<WorkspaceGitSetUpstreamRequest, WorkspaceGitMutationResult>(),
  saveRemote: defineEvent('workspace-git')
    .module('api')
    .event('save-remote')
    .define<WorkspaceGitSaveRemoteRequest, WorkspaceGitMutationResult>(),
  removeRemote: defineEvent('workspace-git')
    .module('api')
    .event('remove-remote')
    .define<WorkspaceGitRemoveRemoteRequest, WorkspaceGitMutationResult>(),
  fetch: defineEvent('workspace-git')
    .module('api')
    .event('fetch')
    .define<WorkspaceGitFetchRequest, WorkspaceGitMutationResult>(),
  pull: defineEvent('workspace-git')
    .module('api')
    .event('pull')
    .define<WorkspaceGitTarget, WorkspaceGitMutationResult>(),
  push: defineEvent('workspace-git')
    .module('api')
    .event('push')
    .define<WorkspaceGitPushRequest, WorkspaceGitMutationResult>()
}

export interface WorkspaceGitSdk {
  status: (target: WorkspaceGitTarget) => Promise<WorkspaceGitStatusResult>
  diff: (request: WorkspaceGitDiffRequest) => Promise<WorkspaceGitDiffResult>
  branches: (target: WorkspaceGitTarget) => Promise<WorkspaceGitBranchesResult>
  log: (request: WorkspaceGitLogRequest) => Promise<WorkspaceGitLogResult>
  commitFiles: (request: WorkspaceGitCommitFilesRequest) => Promise<WorkspaceGitCommitFilesResult>
  stage: (request: WorkspaceGitStageRequest) => Promise<WorkspaceGitMutationResult>
  unstage: (request: WorkspaceGitStageRequest) => Promise<WorkspaceGitMutationResult>
  discard: (request: WorkspaceGitDiscardRequest) => Promise<WorkspaceGitMutationResult>
  commit: (request: WorkspaceGitCommitRequest) => Promise<WorkspaceGitMutationResult>
  checkout: (request: WorkspaceGitCheckoutRequest) => Promise<WorkspaceGitMutationResult>
  renameBranch: (request: WorkspaceGitRenameBranchRequest) => Promise<WorkspaceGitMutationResult>
  deleteBranch: (request: WorkspaceGitDeleteBranchRequest) => Promise<WorkspaceGitMutationResult>
  setUpstream: (request: WorkspaceGitSetUpstreamRequest) => Promise<WorkspaceGitMutationResult>
  saveRemote: (request: WorkspaceGitSaveRemoteRequest) => Promise<WorkspaceGitMutationResult>
  removeRemote: (request: WorkspaceGitRemoveRemoteRequest) => Promise<WorkspaceGitMutationResult>
  fetch: (request: WorkspaceGitFetchRequest) => Promise<WorkspaceGitMutationResult>
  pull: (target: WorkspaceGitTarget) => Promise<WorkspaceGitMutationResult>
  push: (request: WorkspaceGitPushRequest) => Promise<WorkspaceGitMutationResult>
}

export function createWorkspaceGitSdk(transport: ITuffTransport): WorkspaceGitSdk {
  return {
    status: (target) => transport.send(WorkspaceGitEvents.status, target),
    diff: (request) => transport.send(WorkspaceGitEvents.diff, request),
    branches: (target) => transport.send(WorkspaceGitEvents.branches, target),
    log: (request) => transport.send(WorkspaceGitEvents.log, request),
    commitFiles: (request) => transport.send(WorkspaceGitEvents.commitFiles, request),
    stage: (request) => transport.send(WorkspaceGitEvents.stage, request),
    unstage: (request) => transport.send(WorkspaceGitEvents.unstage, request),
    discard: (request) => transport.send(WorkspaceGitEvents.discard, request),
    commit: (request) => transport.send(WorkspaceGitEvents.commit, request),
    checkout: (request) => transport.send(WorkspaceGitEvents.checkout, request),
    renameBranch: (request) => transport.send(WorkspaceGitEvents.renameBranch, request),
    deleteBranch: (request) => transport.send(WorkspaceGitEvents.deleteBranch, request),
    setUpstream: (request) => transport.send(WorkspaceGitEvents.setUpstream, request),
    saveRemote: (request) => transport.send(WorkspaceGitEvents.saveRemote, request),
    removeRemote: (request) => transport.send(WorkspaceGitEvents.removeRemote, request),
    fetch: (request) => transport.send(WorkspaceGitEvents.fetch, request),
    pull: (target) => transport.send(WorkspaceGitEvents.pull, target),
    push: (request) => transport.send(WorkspaceGitEvents.push, request)
  }
}
