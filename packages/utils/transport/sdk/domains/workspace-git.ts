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

export interface WorkspaceGitBranchEntry {
  name: string
  current: boolean
  isRemote: boolean
  upstream?: string
  shortOid?: string
  subject?: string
}

export interface WorkspaceGitBranchesResult {
  current: string
  detached: boolean
  branches: WorkspaceGitBranchEntry[]
  error?: string
}

export interface WorkspaceGitLogRequest extends WorkspaceGitTarget {
  limit?: number
}

export interface WorkspaceGitCommitEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  relativeDate: string
  authoredAt: number
  refs: string[]
}

export interface WorkspaceGitLogResult {
  commits: WorkspaceGitCommitEntry[]
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
  fetch: defineEvent('workspace-git')
    .module('api')
    .event('fetch')
    .define<WorkspaceGitTarget, WorkspaceGitMutationResult>(),
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
  stage: (request: WorkspaceGitStageRequest) => Promise<WorkspaceGitMutationResult>
  unstage: (request: WorkspaceGitStageRequest) => Promise<WorkspaceGitMutationResult>
  discard: (request: WorkspaceGitDiscardRequest) => Promise<WorkspaceGitMutationResult>
  commit: (request: WorkspaceGitCommitRequest) => Promise<WorkspaceGitMutationResult>
  checkout: (request: WorkspaceGitCheckoutRequest) => Promise<WorkspaceGitMutationResult>
  fetch: (target: WorkspaceGitTarget) => Promise<WorkspaceGitMutationResult>
  pull: (target: WorkspaceGitTarget) => Promise<WorkspaceGitMutationResult>
  push: (request: WorkspaceGitPushRequest) => Promise<WorkspaceGitMutationResult>
}

export function createWorkspaceGitSdk(transport: ITuffTransport): WorkspaceGitSdk {
  return {
    status: (target) => transport.send(WorkspaceGitEvents.status, target),
    diff: (request) => transport.send(WorkspaceGitEvents.diff, request),
    branches: (target) => transport.send(WorkspaceGitEvents.branches, target),
    log: (request) => transport.send(WorkspaceGitEvents.log, request),
    stage: (request) => transport.send(WorkspaceGitEvents.stage, request),
    unstage: (request) => transport.send(WorkspaceGitEvents.unstage, request),
    discard: (request) => transport.send(WorkspaceGitEvents.discard, request),
    commit: (request) => transport.send(WorkspaceGitEvents.commit, request),
    checkout: (request) => transport.send(WorkspaceGitEvents.checkout, request),
    fetch: (target) => transport.send(WorkspaceGitEvents.fetch, target),
    pull: (target) => transport.send(WorkspaceGitEvents.pull, target),
    push: (request) => transport.send(WorkspaceGitEvents.push, request)
  }
}
