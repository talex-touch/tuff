import type {
  WorkspaceGitBranchEntry,
  WorkspaceGitBranchesResult,
  WorkspaceGitCheckoutRequest,
  WorkspaceGitCommitEntry,
  WorkspaceGitCommitRequest,
  WorkspaceGitDiffRequest,
  WorkspaceGitDiffResult,
  WorkspaceGitDiscardRequest,
  WorkspaceGitFileEntry,
  WorkspaceGitFileStatus,
  WorkspaceGitLogRequest,
  WorkspaceGitLogResult,
  WorkspaceGitMutationResult,
  WorkspaceGitPushRequest,
  WorkspaceGitStageRequest,
  WorkspaceGitStatusResult,
  WorkspaceGitTarget
} from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { peekConversationWorkspaceRoot } from '../local-ai-cli/workspace-root'
import { getProject } from '../project/project-store'
import { getConversation } from './conversation-store'

const execFileAsync = promisify(execFile)

const LOCAL_GIT_TIMEOUT_MS = 15_000
const REMOTE_GIT_TIMEOUT_MS = 45_000
const GIT_MAX_BUFFER_BYTES = 4 * 1024 * 1024
const DIFF_MAX_BYTES = 512 * 1024
const BINARY_SNIFF_BYTES = 8192
const DEFAULT_LOG_LIMIT = 40
const MAX_LOG_LIMIT = 100

interface GitExecResult {
  stdout: string
  stderr: string
  exitCode: number
  missingBinary?: boolean
}

function buildGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0'
  }
}

async function runGit(
  cwd: string,
  args: string[],
  timeoutMs = LOCAL_GIT_TIMEOUT_MS,
  options: { literalPathspecs?: boolean } = {}
): Promise<GitExecResult> {
  const prefix = options.literalPathspecs
    ? ['--literal-pathspecs', '-c', 'core.quotepath=false']
    : ['-c', 'core.quotepath=false']
  try {
    const { stdout, stderr } = await execFileAsync('git', [...prefix, ...args], {
      cwd,
      env: buildGitEnv(),
      timeout: timeoutMs,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      windowsHide: true,
      encoding: 'utf8'
    })
    return {
      stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
      stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
      exitCode: 0
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer
      stderr?: string | Buffer
      code?: string | number
      killed?: boolean
      signal?: string
    }
    if (err.code === 'ENOENT') {
      return {
        stdout: '',
        stderr: 'Git executable not found',
        exitCode: 127,
        missingBinary: true
      }
    }
    const stdout =
      typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString('utf8') ?? '')
    const rawStderr =
      typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString('utf8') ?? '')
    const stderr =
      rawStderr.trim() ||
      (err.killed ? 'Git command timed out' : err.message || 'Git command failed')
    return {
      stdout,
      stderr,
      exitCode: typeof err.code === 'number' ? err.code : 1
    }
  }
}

async function resolveTargetCwd(target: WorkspaceGitTarget): Promise<string | null> {
  let candidate = target.cwd?.trim()
  if (!candidate && target.conversationId?.trim()) {
    const conversation = await getConversation(target.conversationId.trim())
    if (conversation?.projectId) {
      const project = await getProject(conversation.projectId)
      candidate = project?.rootPath?.trim()
    }
    if (!candidate) {
      candidate = await peekConversationWorkspaceRoot(target.conversationId.trim())
    }
  }
  if (!candidate) return null

  const resolved = path.resolve(candidate)
  try {
    const stat = await fs.stat(resolved)
    return stat.isDirectory() ? resolved : path.dirname(resolved)
  } catch {
    return null
  }
}

async function resolveRepoContext(
  target: WorkspaceGitTarget
): Promise<
  | { ok: true; cwd: string; repoRoot: string }
  | { ok: false; available: boolean; isRepo: boolean; cwd: string; error?: string }
> {
  const cwd = await resolveTargetCwd(target)
  if (!cwd) {
    return {
      ok: false,
      available: true,
      isRepo: false,
      cwd: target.cwd?.trim() || '',
      error: 'Workspace directory not found'
    }
  }

  const probe = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (probe.missingBinary) {
    return {
      ok: false,
      available: false,
      isRepo: false,
      cwd,
      error: 'Git is not installed on this machine'
    }
  }
  if (probe.exitCode !== 0 || !probe.stdout.trim()) {
    return {
      ok: false,
      available: true,
      isRepo: false,
      cwd
    }
  }

  return {
    ok: true,
    cwd,
    repoRoot: path.resolve(probe.stdout.trim())
  }
}

function classifyFileStatus(
  indexStatus: string,
  worktreeStatus: string,
  conflicted: boolean,
  untracked: boolean
): WorkspaceGitFileStatus {
  if (conflicted) return 'unmerged'
  if (untracked) return 'untracked'
  const code = indexStatus !== '.' && indexStatus !== ' ' ? indexStatus : worktreeStatus
  switch (code) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    case 'U':
      return 'unmerged'
    default:
      return 'modified'
  }
}

export function parsePorcelainV2Status(output: string): {
  branch: string
  detached: boolean
  unborn: boolean
  headShortOid?: string
  upstream?: string
  ahead: number
  behind: number
  files: WorkspaceGitFileEntry[]
} {
  let branch = ''
  let detached = false
  let unborn = false
  let headShortOid: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const files: WorkspaceGitFileEntry[] = []

  const tokens = output.split('\0')
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token) continue

    if (token.startsWith('# ')) {
      if (token.startsWith('# branch.oid ')) {
        const oid = token.slice('# branch.oid '.length).trim()
        if (oid === '(initial)') {
          unborn = true
        } else if (oid) {
          headShortOid = oid.slice(0, 7)
        }
      } else if (token.startsWith('# branch.head ')) {
        const head = token.slice('# branch.head '.length).trim()
        if (head === '(detached)') {
          detached = true
          branch = '(detached)'
        } else {
          branch = head
        }
      } else if (token.startsWith('# branch.upstream ')) {
        upstream = token.slice('# branch.upstream '.length).trim() || undefined
      } else if (token.startsWith('# branch.ab ')) {
        const ab = token.slice('# branch.ab '.length).trim()
        const match = /\+(\d+)\s+-(\d+)/.exec(ab)
        if (match) {
          ahead = Number(match[1]) || 0
          behind = Number(match[2]) || 0
        }
      }
      continue
    }

    if (token.startsWith('? ')) {
      const filePath = token.slice(2)
      if (!filePath) continue
      files.push({
        path: filePath,
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: false,
        untracked: true,
        conflicted: false,
        status: 'untracked'
      })
      continue
    }

    if (token.startsWith('1 ')) {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parts = token.split(' ')
      if (parts.length < 9) continue
      const xy = parts[1] ?? '..'
      const indexStatus = xy[0] ?? '.'
      const worktreeStatus = xy[1] ?? '.'
      const filePath = parts.slice(8).join(' ')
      if (!filePath) continue
      const staged = indexStatus !== '.'
      const unstaged = worktreeStatus !== '.'
      files.push({
        path: filePath,
        indexStatus,
        worktreeStatus,
        staged,
        unstaged,
        untracked: false,
        conflicted: false,
        status: classifyFileStatus(indexStatus, worktreeStatus, false, false)
      })
      continue
    }

    if (token.startsWith('2 ')) {
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<origPath>
      const parts = token.split(' ')
      if (parts.length < 10) continue
      const xy = parts[1] ?? '..'
      const indexStatus = xy[0] ?? '.'
      const worktreeStatus = xy[1] ?? '.'
      const filePath = parts.slice(9).join(' ')
      const oldPath = tokens[i + 1] || undefined
      i += 1
      if (!filePath) continue
      const staged = indexStatus !== '.'
      const unstaged = worktreeStatus !== '.'
      files.push({
        path: filePath,
        ...(oldPath ? { oldPath } : {}),
        indexStatus,
        worktreeStatus,
        staged,
        unstaged,
        untracked: false,
        conflicted: false,
        status: classifyFileStatus(indexStatus, worktreeStatus, false, false)
      })
      continue
    }

    if (token.startsWith('u ')) {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const parts = token.split(' ')
      if (parts.length < 11) continue
      const xy = parts[1] ?? 'UU'
      const indexStatus = xy[0] ?? 'U'
      const worktreeStatus = xy[1] ?? 'U'
      const filePath = parts.slice(10).join(' ')
      if (!filePath) continue
      files.push({
        path: filePath,
        indexStatus,
        worktreeStatus,
        staged: false,
        unstaged: true,
        untracked: false,
        conflicted: true,
        status: 'unmerged'
      })
    }
  }

  return {
    branch: branch || (unborn ? '(unborn)' : '(detached)'),
    detached,
    unborn,
    ...(headShortOid ? { headShortOid } : {}),
    ...(upstream ? { upstream } : {}),
    ahead,
    behind,
    files
  }
}

export function assertSafeRepoRelativePath(repoRoot: string, rawPath: string): string {
  if (!rawPath || rawPath.includes('\0')) {
    throw new Error('GIT_PATH_INVALID')
  }
  const normalized = process.platform === 'win32' ? rawPath.replace(/\\/g, '/') : rawPath
  if (path.isAbsolute(normalized) || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error('GIT_PATH_OUTSIDE_REPO')
  }
  const segments = normalized.split('/')
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    throw new Error('GIT_PATH_OUTSIDE_REPO')
  }
  const resolvedRoot = path.resolve(repoRoot)
  const resolvedTarget = path.resolve(resolvedRoot, normalized)
  const rel = path.relative(resolvedRoot, resolvedTarget)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('GIT_PATH_OUTSIDE_REPO')
  }
  return normalized
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

export function isValidBranchName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return false
  }
  if (trimmed.endsWith('.') || trimmed.endsWith('.lock')) return false
  if (hasControlChar(trimmed) || /\s|\.\.|@\{|[~^:?*[\\]/.test(trimmed)) return false
  return true
}

function summarizeDiff(rawDiff: string): {
  diff: string
  additions: number
  deletions: number
  binary: boolean
  truncated: boolean
  empty: boolean
} {
  if (!rawDiff.trim()) {
    return {
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      empty: true
    }
  }

  const binary = /^Binary files .* differ$/m.test(rawDiff) || /^GIT binary patch$/m.test(rawDiff)
  let truncated = false
  let diff = rawDiff
  if (Buffer.byteLength(rawDiff, 'utf8') > DIFF_MAX_BYTES) {
    truncated = true
    diff = rawDiff.slice(0, DIFF_MAX_BYTES)
    const lastNewline = diff.lastIndexOf('\n')
    if (lastNewline > 0) {
      diff = diff.slice(0, lastNewline)
    }
  }

  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    else if (line.startsWith('-')) deletions += 1
  }

  return {
    diff,
    additions,
    deletions,
    binary,
    truncated,
    empty: false
  }
}

function isPathContained(root: string, target: string): boolean {
  const compRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const compTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const rel = path.relative(compRoot, compTarget)
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

async function buildUntrackedFileDiff(
  repoRoot: string,
  safeRelPath: string
): Promise<WorkspaceGitDiffResult> {
  const absPath = path.resolve(repoRoot, safeRelPath)
  try {
    const realRepo = await fs.realpath(repoRoot)
    const realParent = await fs.realpath(path.dirname(absPath))
    if (!isPathContained(realRepo, realParent)) {
      throw new Error('GIT_PATH_OUTSIDE_REPO')
    }

    const lstat = await fs.lstat(absPath)
    if (lstat.isSymbolicLink()) {
      const linkTarget = await fs.readlink(absPath)
      const diff = [
        `diff --git a/${safeRelPath} b/${safeRelPath}`,
        'new file mode 120000',
        '--- /dev/null',
        `+++ b/${safeRelPath}`,
        '@@ -0,0 +1 @@',
        `+${linkTarget}`
      ].join('\n')
      return {
        path: safeRelPath,
        staged: false,
        diff,
        additions: 1,
        deletions: 0,
        binary: false,
        truncated: false,
        empty: false
      }
    }

    if (!lstat.isFile()) {
      return {
        path: safeRelPath,
        staged: false,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        empty: true
      }
    }

    const realTarget = await fs.realpath(absPath)
    if (!isPathContained(realRepo, realTarget)) {
      throw new Error('GIT_PATH_OUTSIDE_REPO')
    }

    const handle = await fs.open(realTarget, 'r')
    try {
      const readLen = Math.min(lstat.size, DIFF_MAX_BYTES + 1)
      const buffer = Buffer.alloc(readLen)
      const { bytesRead } = await handle.read(buffer, 0, readLen, 0)
      const slice = buffer.subarray(0, bytesRead)
      const sniffEnd = Math.min(bytesRead, BINARY_SNIFF_BYTES)
      for (let i = 0; i < sniffEnd; i += 1) {
        if (slice[i] === 0) {
          return {
            path: safeRelPath,
            staged: false,
            diff: '',
            additions: 0,
            deletions: 0,
            binary: true,
            truncated: false,
            empty: false
          }
        }
      }

      const truncated = lstat.size > DIFF_MAX_BYTES
      const text = slice
        .subarray(0, Math.min(bytesRead, DIFF_MAX_BYTES))
        .toString('utf8')
        .replace(/\r\n/g, '\n')
      if (!text.length) {
        return {
          path: safeRelPath,
          staged: false,
          diff: `diff --git a/${safeRelPath} b/${safeRelPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${safeRelPath}`,
          additions: 0,
          deletions: 0,
          binary: false,
          truncated: false,
          empty: false
        }
      }

      const rawLines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
      const body = rawLines.map((line) => `+${line}`).join('\n')
      const diff = [
        `diff --git a/${safeRelPath} b/${safeRelPath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${safeRelPath}`,
        `@@ -0,0 +1,${rawLines.length} @@`,
        body
      ].join('\n')

      return {
        path: safeRelPath,
        staged: false,
        diff,
        additions: rawLines.length,
        deletions: 0,
        binary: false,
        truncated,
        empty: false
      }
    } finally {
      await handle.close()
    }
  } catch (error) {
    return {
      path: safeRelPath,
      staged: false,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      empty: true,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function hasHeadCommit(repoRoot: string): Promise<boolean> {
  const res = await runGit(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  return res.exitCode === 0
}

async function readStatusForRepo(ctx: {
  cwd: string
  repoRoot: string
}): Promise<WorkspaceGitStatusResult> {
  const [statusRes, remotesRes] = await Promise.all([
    runGit(ctx.repoRoot, ['status', '--porcelain=v2', '--branch', '-z']),
    runGit(ctx.repoRoot, ['remote'])
  ])

  if (statusRes.exitCode !== 0) {
    return {
      available: !statusRes.missingBinary,
      isRepo: true,
      cwd: ctx.cwd,
      repoRoot: ctx.repoRoot,
      branch: '',
      detached: false,
      ahead: 0,
      behind: 0,
      hasRemote: false,
      files: [],
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      error: statusRes.stderr.trim() || 'Failed to read git status'
    }
  }

  const parsed = parsePorcelainV2Status(statusRes.stdout)
  const hasRemote = remotesRes.exitCode === 0 && remotesRes.stdout.trim().length > 0

  let stagedCount = 0
  let unstagedCount = 0
  let untrackedCount = 0
  let conflictedCount = 0
  for (const file of parsed.files) {
    if (file.conflicted) conflictedCount += 1
    if (file.staged) stagedCount += 1
    if (file.unstaged) unstagedCount += 1
    if (file.untracked) untrackedCount += 1
  }

  return {
    available: true,
    isRepo: true,
    cwd: ctx.cwd,
    repoRoot: ctx.repoRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    ...(parsed.headShortOid ? { headShortOid: parsed.headShortOid } : {}),
    ...(parsed.upstream ? { upstream: parsed.upstream } : {}),
    ahead: parsed.ahead,
    behind: parsed.behind,
    hasRemote,
    files: parsed.files,
    stagedCount,
    unstagedCount,
    untrackedCount,
    conflictedCount
  }
}

export async function readWorkspaceGitStatus(
  target: WorkspaceGitTarget
): Promise<WorkspaceGitStatusResult> {
  const ctx = await resolveRepoContext(target)
  if (!ctx.ok) {
    return {
      available: ctx.available,
      isRepo: ctx.isRepo,
      cwd: ctx.cwd,
      branch: '',
      detached: false,
      ahead: 0,
      behind: 0,
      hasRemote: false,
      files: [],
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      ...(ctx.error ? { error: ctx.error } : {})
    }
  }
  return readStatusForRepo(ctx)
}

export async function readWorkspaceGitDiff(
  request: WorkspaceGitDiffRequest
): Promise<WorkspaceGitDiffResult> {
  const ctx = await resolveRepoContext(request)
  const staged = request.staged === true
  if (!ctx.ok) {
    return {
      path: request.path,
      staged,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      empty: true,
      error: ctx.error || 'Not a git repository'
    }
  }

  let safePath: string
  try {
    safePath = assertSafeRepoRelativePath(ctx.repoRoot, request.path)
  } catch (error) {
    return {
      path: request.path,
      staged,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      empty: true,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  if (request.untracked && !staged) {
    return buildUntrackedFileDiff(ctx.repoRoot, safePath)
  }

  const args = staged
    ? ['diff', '--cached', '--no-color', '--', safePath]
    : ['diff', '--no-color', '--', safePath]
  const res = await runGit(ctx.repoRoot, args, LOCAL_GIT_TIMEOUT_MS, { literalPathspecs: true })
  if (res.exitCode !== 0) {
    return {
      path: safePath,
      staged,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      empty: true,
      error: res.stderr.trim() || 'Failed to read git diff'
    }
  }

  const summary = summarizeDiff(res.stdout)
  return {
    path: safePath,
    staged,
    ...summary
  }
}

export async function listWorkspaceGitBranches(
  target: WorkspaceGitTarget
): Promise<WorkspaceGitBranchesResult> {
  const ctx = await resolveRepoContext(target)
  if (!ctx.ok) {
    return {
      current: '',
      detached: false,
      branches: [],
      ...(ctx.error ? { error: ctx.error } : {})
    }
  }

  const [status, refsRes] = await Promise.all([
    readStatusForRepo(ctx),
    runGit(ctx.repoRoot, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(HEAD)%1f%(refname:short)%1f%(refname)%1f%(upstream:short)%1f%(objectname:short)%1f%(contents:subject)',
      'refs/heads',
      'refs/remotes'
    ])
  ])

  if (status.error) {
    return {
      current: '',
      detached: false,
      branches: [],
      error: status.error
    }
  }

  if (refsRes.exitCode !== 0) {
    return {
      current: status.branch,
      detached: status.detached,
      branches: [],
      error: refsRes.stderr.trim() || 'Failed to list branches'
    }
  }

  const localBranches: WorkspaceGitBranchEntry[] = []
  const remoteBranches: WorkspaceGitBranchEntry[] = []

  for (const line of refsRes.stdout.split('\n')) {
    if (!line.trim()) continue
    const [headMark, shortName, fullRef, upstream, shortOid, subject] = line.split('\x1f')
    if (!shortName || !fullRef) continue
    if (fullRef.startsWith('refs/remotes/') && fullRef.endsWith('/HEAD')) continue

    const isRemote = fullRef.startsWith('refs/remotes/')
    const entry: WorkspaceGitBranchEntry = {
      name: shortName,
      current: headMark === '*',
      isRemote,
      ...(upstream ? { upstream } : {}),
      ...(shortOid ? { shortOid } : {}),
      ...(subject ? { subject } : {})
    }

    if (isRemote) {
      remoteBranches.push(entry)
    } else if (entry.current) {
      localBranches.unshift(entry)
    } else {
      localBranches.push(entry)
    }
  }

  return {
    current: status.branch,
    detached: status.detached,
    branches: [...localBranches, ...remoteBranches]
  }
}

export async function readWorkspaceGitLog(
  request: WorkspaceGitLogRequest
): Promise<WorkspaceGitLogResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return {
      commits: [],
      ...(ctx.error ? { error: ctx.error } : {})
    }
  }

  const rawLimit = typeof request.limit === 'number' ? Math.trunc(request.limit) : DEFAULT_LOG_LIMIT
  const limit = Math.max(1, Math.min(MAX_LOG_LIMIT, rawLimit || DEFAULT_LOG_LIMIT))

  const res = await runGit(ctx.repoRoot, [
    'log',
    '-n',
    String(limit),
    '--date=unix',
    '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1f%at%x1f%D%x1e'
  ])

  if (res.exitCode !== 0) {
    // Unborn repository with no commits yet is not an error.
    if (/does not have any commits yet|unknown revision/i.test(res.stderr)) {
      return { commits: [] }
    }
    return {
      commits: [],
      error: res.stderr.trim() || 'Failed to read git history'
    }
  }

  const commits: WorkspaceGitCommitEntry[] = []
  for (const record of res.stdout.split('\x1e')) {
    const trimmed = record.trim()
    if (!trimmed) continue
    const [hash, shortHash, subject, author, relativeDate, unixSec, rawRefs] = trimmed.split('\x1f')
    if (!hash || !shortHash) continue
    const refs = rawRefs
      ? rawRefs
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
    commits.push({
      hash,
      shortHash,
      subject: subject ?? '',
      author: author ?? '',
      relativeDate: relativeDate ?? '',
      authoredAt: (Number(unixSec) || 0) * 1000,
      refs
    })
  }

  return { commits }
}

export async function stageWorkspaceGitFiles(
  request: WorkspaceGitStageRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  let args: string[]
  let literalPathspecs = false
  if (request.all) {
    args = ['add', '-A']
  } else {
    const rawPaths = request.paths ?? []
    if (rawPaths.length === 0) {
      return { ok: false, error: 'No files specified to stage' }
    }
    let safePaths: string[]
    try {
      safePaths = rawPaths.map((item) => assertSafeRepoRelativePath(ctx.repoRoot, item))
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    args = ['add', '-A', '--', ...safePaths]
    literalPathspecs = true
  }

  const res = await runGit(ctx.repoRoot, args, LOCAL_GIT_TIMEOUT_MS, { literalPathspecs })
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to stage changes' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, status }
}

export async function unstageWorkspaceGitFiles(
  request: WorkspaceGitStageRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const hasHead = await hasHeadCommit(ctx.repoRoot)
  let args: string[]
  let literalPathspecs = false

  if (request.all) {
    args = hasHead ? ['reset', '-q', 'HEAD', '--'] : ['rm', '--cached', '-r', '-f', '-q', '.']
  } else {
    const rawPaths = request.paths ?? []
    if (rawPaths.length === 0) {
      return { ok: false, error: 'No files specified to unstage' }
    }
    let safePaths: string[]
    try {
      safePaths = rawPaths.map((item) => assertSafeRepoRelativePath(ctx.repoRoot, item))
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    args = hasHead
      ? ['restore', '--staged', '--', ...safePaths]
      : ['rm', '--cached', '-r', '-f', '-q', '--', ...safePaths]
    literalPathspecs = true
  }

  const res = await runGit(ctx.repoRoot, args, LOCAL_GIT_TIMEOUT_MS, { literalPathspecs })
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to unstage changes' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, status }
}

export async function discardWorkspaceGitFile(
  request: WorkspaceGitDiscardRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  let safePath: string
  try {
    safePath = assertSafeRepoRelativePath(ctx.repoRoot, request.path)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  if (request.untracked) {
    if (safePath.endsWith('/')) {
      return { ok: false, error: 'Refused to recursively delete untracked directory' }
    }
    const targetAbs = path.resolve(ctx.repoRoot, safePath)
    try {
      const lstat = await fs.lstat(targetAbs)
      if (lstat.isDirectory()) {
        return { ok: false, error: 'Refused to recursively delete untracked directory' }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Untracked file not found'
      }
    }

    // Confirm exact untracked file entry, re-verify it is still not a directory, then unlink
    // non-recursively so a directory can never be deleted recursively.
    const verify = await runGit(
      ctx.repoRoot,
      ['ls-files', '--others', '--exclude-standard', '-z', '--', safePath],
      LOCAL_GIT_TIMEOUT_MS,
      { literalPathspecs: true }
    )
    const exactMatches = verify.stdout.split('\0').filter(Boolean)
    if (verify.exitCode !== 0 || !exactMatches.includes(safePath)) {
      return { ok: false, error: 'Refused to delete path that is not untracked by git' }
    }

    try {
      const latestStat = await fs.lstat(targetAbs)
      if (latestStat.isDirectory()) {
        return { ok: false, error: 'Refused to recursively delete untracked directory' }
      }
      await fs.unlink(targetAbs)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to remove untracked file'
      }
    }
  } else {
    const res = await runGit(
      ctx.repoRoot,
      ['restore', '--worktree', '--', safePath],
      LOCAL_GIT_TIMEOUT_MS,
      { literalPathspecs: true }
    )
    if (res.exitCode !== 0) {
      return { ok: false, error: res.stderr.trim() || 'Failed to discard file changes' }
    }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, status }
}

export async function commitWorkspaceGitChanges(
  request: WorkspaceGitCommitRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const message = request.message?.trim()
  if (!message) {
    return { ok: false, error: 'Commit message cannot be empty' }
  }

  const res = await runGit(ctx.repoRoot, ['commit', '-m', message])
  if (res.exitCode !== 0) {
    return {
      ok: false,
      error: res.stderr.trim() || res.stdout.trim() || 'Failed to commit changes'
    }
  }

  const summary = res.stdout.split('\n')[0]?.trim() || 'Committed'
  const status = await readStatusForRepo(ctx)
  return { ok: true, summary, status }
}

export async function checkoutWorkspaceGitBranch(
  request: WorkspaceGitCheckoutRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const branch = request.branch?.trim()
  if (!branch || !isValidBranchName(branch)) {
    return { ok: false, error: 'Invalid branch name' }
  }

  let args: string[]
  if (request.create) {
    const startPoint = request.startPoint?.trim()
    if (startPoint && !isValidBranchName(startPoint)) {
      return { ok: false, error: 'Invalid start point branch name' }
    }
    args = startPoint ? ['switch', '-c', branch, startPoint] : ['switch', '-c', branch]
  } else {
    // Check whether the requested name is a local or remote-tracking branch; never fall back to
    // `git checkout <name>` which could overwrite a tracked file matching the missing branch name.
    const localExists = await runGit(ctx.repoRoot, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`
    ])
    if (localExists.exitCode === 0) {
      args = ['switch', branch]
    } else {
      const remoteExists = await runGit(ctx.repoRoot, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/remotes/${branch}`
      ])
      if (remoteExists.exitCode !== 0) {
        return { ok: false, error: `Branch not found: ${branch}` }
      }
      args = ['switch', '--track', branch]
    }
  }

  const res = await runGit(ctx.repoRoot, args)
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to switch branch' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: branch, status }
}

export async function fetchWorkspaceGit(
  target: WorkspaceGitTarget
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(target)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const res = await runGit(ctx.repoRoot, ['fetch', '--prune'], REMOTE_GIT_TIMEOUT_MS)
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Git fetch failed' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: res.stderr.trim() || res.stdout.trim() || 'Fetched', status }
}

export async function pullWorkspaceGit(
  target: WorkspaceGitTarget
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(target)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const res = await runGit(ctx.repoRoot, ['pull', '--no-edit'], REMOTE_GIT_TIMEOUT_MS)
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || res.stdout.trim() || 'Git pull failed' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: res.stdout.trim() || 'Pulled', status }
}

async function resolvePushRemote(
  repoRoot: string,
  branch: string
): Promise<{ ok: true; remote: string } | { ok: false; error: string }> {
  if (branch && !branch.startsWith('(')) {
    const branchRemote = await runGit(repoRoot, ['config', '--get', `branch.${branch}.pushRemote`])
    const configuredBranchRemote = branchRemote.exitCode === 0 ? branchRemote.stdout.trim() : ''
    if (configuredBranchRemote) {
      return { ok: true, remote: configuredBranchRemote }
    }
  }
  const defaultPushRemote = await runGit(repoRoot, ['config', '--get', 'remote.pushDefault'])
  const configuredDefault = defaultPushRemote.exitCode === 0 ? defaultPushRemote.stdout.trim() : ''
  if (configuredDefault) {
    return { ok: true, remote: configuredDefault }
  }

  const remotesRes = await runGit(repoRoot, ['remote'])
  const remotes = remotesRes.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (remotes.length === 0) {
    return { ok: false, error: 'No Git remote configured' }
  }
  if (remotes.length > 1) {
    return {
      ok: false,
      error: 'Multiple Git remotes configured; configure branch pushRemote or remote.pushDefault'
    }
  }
  return { ok: true, remote: remotes[0]! }
}

export async function pushWorkspaceGit(
  request: WorkspaceGitPushRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const before = await readStatusForRepo(ctx)
  if (before.error) {
    return { ok: false, error: before.error }
  }
  if (before.detached) {
    return { ok: false, error: 'Cannot push from a detached HEAD' }
  }

  let args: string[] = ['push']
  if (!before.upstream) {
    if (request.setUpstream === false) {
      return { ok: false, error: 'Current branch has no upstream branch' }
    }
    const targetRemote = await resolvePushRemote(ctx.repoRoot, before.branch)
    if (!targetRemote.ok) {
      return { ok: false, error: targetRemote.error }
    }
    args = ['push', '-u', targetRemote.remote, 'HEAD']
  }

  const res = await runGit(ctx.repoRoot, args, REMOTE_GIT_TIMEOUT_MS)
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || res.stdout.trim() || 'Git push failed' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: res.stderr.trim() || res.stdout.trim() || 'Pushed', status }
}
