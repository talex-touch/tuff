import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { isLinkedWorktreeGitFile } from '@talex-touch/utils/common/file-filter-service'
import { createLogger } from '../../../utils/logger'
import {
  GitWorktreeError,
  type AcquireWorktreeOptions,
  type DisposeAllWorktreesOptions,
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

const execFileAsync = promisify(execFile)
const worktreeLog = createLogger('Intelligence').child('GitWorktreeManager')

export const DEFAULT_GIT_TIMEOUT_MS = 15_000
export const DEFAULT_MAX_DIFF_BYTES = 262_144
export const DEFAULT_BRANCH_PREFIX = 'tuff/wt'

const META_DIR_NAME = '.meta'
const DEFAULT_GIT_MAX_BUFFER = 4 * 1024 * 1024
const DEFAULT_DISPOSE_TIMEOUT_MS = 10_000
const DIFF_SIGTERM_GRACE_MS = 150
const DIFF_SIGKILL_GRACE_MS = 750
const DIFF_STDERR_MAX_BYTES = 8 * 1024
const UNTRACKED_BINARY_SNIFF_BYTES = 8 * 1024
const UNTRACKED_READ_CAP_BYTES = 256 * 1024

const SAFE_WORKTREE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40,64}$/i
const WHITESPACE_PATTERN = /\s/

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

interface GitExecResult {
  stdout: string
  stderr: string
}

interface BoundedDiffStreamResult {
  patch: string
  truncated: boolean
  byteLength: number
}

const GIT_REPO_OVERRIDE_ENV_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_SUPER_PREFIX',
  'GIT_PREFIX'
] as const

function buildGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C'
  }
  for (const key of GIT_REPO_OVERRIDE_ENV_VARS) {
    delete env[key]
  }
  return env
}

function stripTrailingLineTerminator(value: string): string {
  if (value.endsWith('\r\n')) return value.slice(0, -2)
  if (value.endsWith('\n')) return value.slice(0, -1)
  return value
}

function isExecTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const node = error as { code?: unknown; killed?: unknown; signal?: unknown }
  if (node.code === 'ETIMEDOUT') return true
  return node.killed === true && (node.signal === 'SIGTERM' || node.signal === 'SIGKILL')
}

function extractCommandStderr(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)
  const record = error as { stderr?: unknown; message?: unknown }
  if (typeof record.stderr === 'string' && record.stderr.trim().length > 0) {
    return record.stderr.trim()
  }
  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    return record.message.trim()
  }
  return String(error)
}

function isEnoentError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT'
  )
}

function normalizePathForCompare(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isPathSameOrInside(candidatePath: string, rootPath: string): boolean {
  const rel = path.relative(
    normalizePathForCompare(rootPath),
    normalizePathForCompare(candidatePath)
  )
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function isPathStrictlyInside(candidatePath: string, rootPath: string): boolean {
  const rel = path.relative(
    normalizePathForCompare(rootPath),
    normalizePathForCompare(candidatePath)
  )
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

function hasPathTraversalSegment(inputPath: string): boolean {
  const segments = inputPath.split(/[\\/]+/)
  return segments.includes('..')
}

function assertValidWorktreeId(worktreeId: string): string {
  if (typeof worktreeId !== 'string' || worktreeId.length === 0 || worktreeId.includes('\0')) {
    throw new GitWorktreeError('WORKTREE_PATH_ESCAPE', 'Invalid worktree identifier')
  }
  if (
    worktreeId.includes('/') ||
    worktreeId.includes('\\') ||
    worktreeId.includes('..') ||
    !SAFE_WORKTREE_ID_PATTERN.test(worktreeId)
  ) {
    throw new GitWorktreeError('WORKTREE_PATH_ESCAPE', `Unsafe worktree identifier: ${worktreeId}`)
  }
  return worktreeId
}

function validateBaseRef(baseRef: string): string {
  if (typeof baseRef !== 'string' || baseRef.length === 0 || baseRef.length > 256) {
    throw new GitWorktreeError('WORKTREE_INVALID_REF', 'Invalid git baseRef')
  }
  if (
    baseRef.startsWith('-') ||
    baseRef.startsWith('/') ||
    baseRef.endsWith('/') ||
    baseRef.startsWith('.') ||
    baseRef.endsWith('.') ||
    baseRef.endsWith('.lock') ||
    hasControlChar(baseRef) ||
    WHITESPACE_PATTERN.test(baseRef) ||
    baseRef.includes('..') ||
    baseRef.includes('@{') ||
    baseRef.includes('//') ||
    baseRef.includes('/.') ||
    baseRef.includes('\\') ||
    /[*?[\]:]/.test(baseRef)
  ) {
    throw new GitWorktreeError('WORKTREE_INVALID_REF', `Unsafe or invalid git baseRef: ${baseRef}`)
  }
  return baseRef
}

function validateBranchPrefix(branchPrefix: string): string {
  if (typeof branchPrefix !== 'string' || branchPrefix.length === 0 || branchPrefix.length > 128) {
    throw new GitWorktreeError('WORKTREE_INVALID_REF', 'Invalid git branchPrefix')
  }
  const normalized = branchPrefix.replace(/\/+$/, '')
  if (
    normalized.length === 0 ||
    normalized.startsWith('-') ||
    normalized.startsWith('/') ||
    normalized.startsWith('.') ||
    normalized.endsWith('.') ||
    normalized.endsWith('.lock') ||
    hasControlChar(normalized) ||
    WHITESPACE_PATTERN.test(normalized) ||
    normalized.includes('..') ||
    normalized.includes('@{') ||
    normalized.includes('//') ||
    normalized.includes('/.') ||
    normalized.includes('\\') ||
    /[~^:?*[\]]/.test(normalized)
  ) {
    throw new GitWorktreeError(
      'WORKTREE_INVALID_REF',
      `Unsafe or invalid git branchPrefix: ${branchPrefix}`
    )
  }
  for (const segment of normalized.split('/')) {
    if (
      !segment ||
      segment.startsWith('-') ||
      segment.startsWith('.') ||
      segment.endsWith('.lock')
    ) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REF',
        `Unsafe or invalid git branchPrefix segment: ${branchPrefix}`
      )
    }
  }
  return normalized
}

function sanitizeRunIdSlug(runId: string): string {
  const cleaned = runId
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return cleaned.length > 0 ? cleaned : 'run'
}

function generateWorktreeId(runId: string): string {
  const slug = sanitizeRunIdSlug(runId)
  const suffix = randomBytes(6).toString('hex')
  return `wt-${slug}-${suffix}`
}

function sliceUtf8BufferToMaxBytes(buffer: Buffer, maxBytes: number): Buffer {
  const limit = Math.max(0, Math.floor(maxBytes))
  if (buffer.length <= limit) return buffer
  if (limit === 0) return Buffer.alloc(0)

  let end = limit
  let i = end - 1
  while (i >= 0 && (buffer[i]! & 0xc0) === 0x80) {
    i -= 1
  }
  if (i < 0) {
    return Buffer.alloc(0)
  }

  const lead = buffer[i]!
  let expectedLen: number
  if ((lead & 0x80) === 0x00) {
    expectedLen = 1
  } else if ((lead & 0xe0) === 0xc0) {
    expectedLen = 2
  } else if ((lead & 0xf0) === 0xe0) {
    expectedLen = 3
  } else if ((lead & 0xf8) === 0xf0) {
    expectedLen = 4
  } else {
    end = i
    return buffer.subarray(0, end)
  }

  if (i + expectedLen > end) {
    end = i
  }
  return buffer.subarray(0, end)
}

function classifyChangeKind(indexStatus: string, worktreeStatus: string): WorktreeFileChangeKind {
  if (indexStatus === '?' && worktreeStatus === '?') return 'untracked'
  if (
    indexStatus === 'U' ||
    worktreeStatus === 'U' ||
    (indexStatus === 'A' && worktreeStatus === 'A') ||
    (indexStatus === 'D' && worktreeStatus === 'D')
  ) {
    return 'unmerged'
  }
  const code = indexStatus !== ' ' ? indexStatus : worktreeStatus
  switch (code) {
    case 'A':
      return 'added'
    case 'M':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    default:
      return 'unknown'
  }
}

function parsePorcelainStatusZ(output: string): WorktreeFileChange[] {
  if (!output) return []
  const tokens = output.split('\0')
  const changes: WorktreeFileChange[] = []

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token || token.length < 4 || token[2] !== ' ') continue
    const indexStatus = token[0]!
    const worktreeStatus = token[1]!
    if (indexStatus === '!' && worktreeStatus === '!') continue

    const filePath = token.slice(3)
    let previousPath: string | undefined
    if (
      indexStatus === 'R' ||
      indexStatus === 'C' ||
      worktreeStatus === 'R' ||
      worktreeStatus === 'C'
    ) {
      previousPath = tokens[i + 1]
      i += 1
    }

    const untracked = indexStatus === '?' && worktreeStatus === '?'
    const staged = !untracked && indexStatus !== ' '
    const unstaged = !untracked && worktreeStatus !== ' '

    changes.push({
      path: filePath,
      ...(previousPath !== undefined ? { previousPath } : {}),
      indexStatus,
      worktreeStatus,
      kind: classifyChangeKind(indexStatus, worktreeStatus),
      staged,
      unstaged,
      untracked
    })
  }

  return changes
}

function cloneLease(lease: WorktreeLease): WorktreeLease {
  return { ...lease }
}

function isSafeBaseRef(value: string): boolean {
  try {
    validateBaseRef(value)
    return true
  } catch {
    return false
  }
}

function isSafeBranchName(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    return false
  }
  if (
    value.startsWith('-') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.startsWith('.') ||
    value.endsWith('.') ||
    value.endsWith('.lock') ||
    hasControlChar(value) ||
    WHITESPACE_PATTERN.test(value) ||
    value.includes('..') ||
    value.includes('@{') ||
    value.includes('//') ||
    value.includes('/.') ||
    value.includes('\\') ||
    /[~^:?*[\]]/.test(value)
  ) {
    return false
  }
  for (const segment of value.split('/')) {
    if (
      !segment ||
      segment.startsWith('-') ||
      segment.startsWith('.') ||
      segment.endsWith('.lock')
    ) {
      return false
    }
  }
  return true
}

function isCleanAbsolutePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    path.isAbsolute(value) &&
    !hasPathTraversalSegment(value)
  )
}

function isValidPersistedLease(value: unknown): value is WorktreeLease {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.worktreeId === 'string' &&
    SAFE_WORKTREE_ID_PATTERN.test(candidate.worktreeId) &&
    typeof candidate.runId === 'string' &&
    candidate.runId.trim().length > 0 &&
    !hasControlChar(candidate.runId) &&
    (candidate.conversationId === undefined || typeof candidate.conversationId === 'string') &&
    isCleanAbsolutePath(candidate.repoRoot) &&
    isCleanAbsolutePath(candidate.worktreePath) &&
    isCleanAbsolutePath(candidate.effectiveCwd) &&
    (candidate.branchName === null ||
      (typeof candidate.branchName === 'string' && isSafeBranchName(candidate.branchName))) &&
    typeof candidate.baseRef === 'string' &&
    isSafeBaseRef(candidate.baseRef) &&
    typeof candidate.baseCommit === 'string' &&
    COMMIT_HASH_PATTERN.test(candidate.baseCommit) &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt)
  )
}

async function resolveDefaultBaseDir(): Promise<string> {
  try {
    const electron = await import('electron')
    const userData = electron?.app?.getPath?.('userData')
    if (typeof userData === 'string' && userData.trim().length > 0) {
      return path.join(userData, 'ai-worktrees')
    }
  } catch {
    // Non-Electron runtime (e.g. unit tests without mocked electron).
  }
  return path.join(tmpdir(), 'tuff-ai-worktrees')
}

async function assertNoEnclosingRepoSymlinkEscape(
  rawInputPath: string,
  canonicalInputPath: string
): Promise<void> {
  let current = path.dirname(path.resolve(rawInputPath))
  while (true) {
    const gitMarker = path.join(current, '.git')
    let hasGitMarker = false
    try {
      await lstat(gitMarker)
      hasGitMarker = true
    } catch {
      hasGitMarker = false
    }

    if (hasGitMarker) {
      const canonicalAncestor = await realpath(current)
      if (!isPathSameOrInside(canonicalInputPath, canonicalAncestor)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Target workspace path escapes its enclosing git repository via symlink'
        )
      }
      return
    }

    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

function formatUntrackedTextDiff(relPath: string, content: string, truncatedRead: boolean): string {
  const normalizedPath = relPath.split(path.sep).join('/')
  const header = `diff --git a/${normalizedPath} b/${normalizedPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${normalizedPath}\n`
  if (content.length === 0) {
    return header
  }
  const endsWithNewline = content.endsWith('\n')
  const rawLines = endsWithNewline ? content.slice(0, -1).split('\n') : content.split('\n')
  const lineCount = rawLines.length
  const hunkHeader = `@@ -0,0 +1,${lineCount} @@\n`
  const body = rawLines.map((line) => `+${line}`).join('\n')
  const suffix = endsWithNewline || truncatedRead ? '\n' : '\n\\ No newline at end of file\n'
  return `${header}${hunkHeader}${body}${suffix}`
}

export class GitWorktreeManager {
  private readonly configuredBaseDir?: string
  private readonly gitTimeoutMs: number
  private readonly maxDiffBytes: number
  private readonly defaultBranchPrefix: string
  private readonly gitBinary: string
  private readonly now: () => number

  private readonly leases = new Map<string, WorktreeLease>()
  private readonly repoLocks = new Map<string, Promise<void>>()
  private readonly worktreeLocks = new Map<string, Promise<void>>()

  constructor(options: GitWorktreeManagerOptions = {}) {
    if (options.baseDir !== undefined) {
      if (
        typeof options.baseDir !== 'string' ||
        options.baseDir.trim().length === 0 ||
        options.baseDir.includes('\0') ||
        !path.isAbsolute(options.baseDir) ||
        hasPathTraversalSegment(options.baseDir)
      ) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Worktree baseDir must be a clean absolute path without traversal segments'
        )
      }
      this.configuredBaseDir = options.baseDir
    }
    this.gitTimeoutMs =
      typeof options.gitTimeoutMs === 'number' && Number.isFinite(options.gitTimeoutMs)
        ? Math.max(100, Math.floor(options.gitTimeoutMs))
        : DEFAULT_GIT_TIMEOUT_MS
    this.maxDiffBytes =
      typeof options.maxDiffBytes === 'number' && Number.isFinite(options.maxDiffBytes)
        ? Math.max(0, Math.floor(options.maxDiffBytes))
        : DEFAULT_MAX_DIFF_BYTES
    this.defaultBranchPrefix = validateBranchPrefix(
      options.defaultBranchPrefix ?? DEFAULT_BRANCH_PREFIX
    )
    this.gitBinary = options.gitBinary?.trim() || 'git'
    this.now = options.now ?? (() => Date.now())
  }

  getLease(worktreeId: string): WorktreeLease | undefined {
    const lease = this.leases.get(worktreeId)
    return lease ? cloneLease(lease) : undefined
  }

  listLeases(): WorktreeLease[] {
    return Array.from(this.leases.values(), cloneLease)
  }

  async reattachWorktree(worktreeId: string, expectedRunId: string): Promise<WorktreeLease> {
    assertValidWorktreeId(worktreeId)
    if (
      typeof expectedRunId !== 'string' ||
      expectedRunId.trim().length === 0 ||
      hasControlChar(expectedRunId)
    ) {
      throw new GitWorktreeError('WORKTREE_PATH_ESCAPE', 'expectedRunId must be a non-empty string')
    }

    return await this.withWorktreeLock(worktreeId, async () => {
      const canonicalBaseDir = await this.ensureBaseDir()
      const lease = await this.resolveLeaseForId(worktreeId, canonicalBaseDir)
      if (lease.runId !== expectedRunId) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          `Worktree "${worktreeId}" does not belong to run "${expectedRunId}"`
        )
      }

      const canonicalWorktreePath = await this.assertManagedWorktreePath(
        lease.worktreePath,
        canonicalBaseDir
      )

      if (!isPathSameOrInside(lease.effectiveCwd, canonicalWorktreePath)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Persisted effectiveCwd escapes managed worktree directory'
        )
      }
      if (!(await this.isDirectoryPresent(lease.effectiveCwd))) {
        throw new GitWorktreeError(
          'WORKTREE_NOT_FOUND',
          'Persisted worktree effectiveCwd does not exist'
        )
      }
      const canonicalEffectiveCwd = await realpath(lease.effectiveCwd)
      if (!isPathSameOrInside(canonicalEffectiveCwd, canonicalWorktreePath)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Canonical effectiveCwd escapes managed worktree directory'
        )
      }

      if (!(await this.isDirectoryPresent(lease.repoRoot))) {
        throw new GitWorktreeError(
          'WORKTREE_NOT_FOUND',
          'Persisted worktree repository root does not exist'
        )
      }
      const canonicalRepoRoot = await realpath(lease.repoRoot)
      await assertNoEnclosingRepoSymlinkEscape(lease.repoRoot, canonicalRepoRoot)
      await this.assertRegisteredGitWorktree(canonicalWorktreePath, canonicalRepoRoot)

      const reattached: WorktreeLease = {
        ...lease,
        repoRoot: canonicalRepoRoot,
        worktreePath: canonicalWorktreePath,
        effectiveCwd: canonicalEffectiveCwd
      }
      this.leases.set(reattached.worktreeId, reattached)
      return cloneLease(reattached)
    })
  }

  async findPersistedLeaseByRunId(runId: string): Promise<WorktreeLease | null> {
    if (typeof runId !== 'string' || runId.trim().length === 0 || hasControlChar(runId)) {
      return null
    }
    for (const lease of this.leases.values()) {
      if (lease.runId === runId) {
        return cloneLease(lease)
      }
    }

    const canonicalBaseDir = await this.ensureBaseDir()
    const metaDir = path.join(canonicalBaseDir, META_DIR_NAME)
    let entries
    try {
      entries = await readdir(metaDir, { withFileTypes: true })
    } catch (error) {
      if (isEnoentError(error)) return null
      throw new GitWorktreeError(
        'WORKTREE_GIT_FAILED',
        'Unable to read persisted worktree metadata directory',
        { cause: error }
      )
    }

    let sawCorrupt = false
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue
      if (!entry.isFile()) {
        sawCorrupt = true
        continue
      }
      const id = entry.name.slice(0, -'.json'.length)
      try {
        assertValidWorktreeId(id)
      } catch {
        sawCorrupt = true
        continue
      }
      const { lease, corrupt } = await this.tryReadLeaseMetadata(canonicalBaseDir, id)
      if (corrupt) {
        sawCorrupt = true
        continue
      }
      if (lease && lease.runId === runId) {
        return cloneLease(lease)
      }
    }

    if (sawCorrupt) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Corrupt persisted worktree metadata prevented safe run lease lookup'
      )
    }
    return null
  }

  private async assertRegisteredGitWorktree(
    canonicalWorktreePath: string,
    canonicalRepoRoot: string
  ): Promise<void> {
    const gitFilePath = path.join(canonicalWorktreePath, '.git')
    let isLinked = false
    try {
      const gitFileStat = await lstat(gitFilePath)
      if (gitFileStat.isFile() && !gitFileStat.isSymbolicLink()) {
        const content = await readFile(gitFilePath, 'utf8')
        isLinked = isLinkedWorktreeGitFile(content)
      }
    } catch {
      isLinked = false
    }
    if (!isLinked) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Persisted worktree path is not a linked git worktree'
      )
    }

    let wtTopLevel: string
    let wtCommonDir: string
    let wtInside: string
    let repoCommonDir: string
    let registeredPaths: string[]
    try {
      const [topLevelProbe, wtCommonProbe, insideProbe, repoCommonProbe, listedPaths] =
        await Promise.all([
          this.execGit(['-C', canonicalWorktreePath, 'rev-parse', '--show-toplevel'], {
            cwd: canonicalWorktreePath
          }),
          this.execGit(
            [
              '-C',
              canonicalWorktreePath,
              'rev-parse',
              '--path-format=absolute',
              '--git-common-dir'
            ],
            { cwd: canonicalWorktreePath }
          ),
          this.execGit(['-C', canonicalWorktreePath, 'rev-parse', '--is-inside-work-tree'], {
            cwd: canonicalWorktreePath
          }),
          this.execGit(
            ['-C', canonicalRepoRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
            { cwd: canonicalRepoRoot }
          ),
          this.listRegisteredWorktreePaths(canonicalRepoRoot)
        ])
      wtTopLevel = stripTrailingLineTerminator(topLevelProbe.stdout)
      wtCommonDir = stripTrailingLineTerminator(wtCommonProbe.stdout)
      wtInside = insideProbe.stdout.trim()
      repoCommonDir = stripTrailingLineTerminator(repoCommonProbe.stdout)
      registeredPaths = listedPaths
    } catch (error) {
      if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
        throw error
      }
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Persisted worktree failed git repository verification',
        { cause: error }
      )
    }

    if (!wtTopLevel || !wtCommonDir || wtInside !== 'true' || !repoCommonDir) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Persisted worktree is not an active git working tree'
      )
    }

    const [canonicalWtTopLevel, canonicalWtCommonDir, canonicalRepoCommonDir] = await Promise.all([
      realpath(wtTopLevel).catch(() => ''),
      realpath(wtCommonDir).catch(() => ''),
      realpath(repoCommonDir).catch(() => '')
    ])
    if (
      !canonicalWtTopLevel ||
      normalizePathForCompare(canonicalWtTopLevel) !==
        normalizePathForCompare(canonicalWorktreePath) ||
      !canonicalWtCommonDir ||
      !canonicalRepoCommonDir ||
      normalizePathForCompare(canonicalWtCommonDir) !==
        normalizePathForCompare(canonicalRepoCommonDir)
    ) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Persisted worktree does not belong to its recorded git repository'
      )
    }

    let registeredMatch = false
    for (const listedPath of registeredPaths) {
      const canonicalListed = await realpath(listedPath).catch(() => '')
      if (
        canonicalListed &&
        normalizePathForCompare(canonicalListed) === normalizePathForCompare(canonicalWorktreePath)
      ) {
        registeredMatch = true
        break
      }
    }
    if (!registeredMatch) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Persisted worktree is not registered in its recorded git repository'
      )
    }
  }

  private async listRegisteredWorktreePaths(canonicalRepoRoot: string): Promise<string[]> {
    try {
      const zProbe = await this.execGit(
        ['-C', canonicalRepoRoot, 'worktree', 'list', '--porcelain', '-z'],
        { cwd: canonicalRepoRoot }
      )
      const paths: string[] = []
      for (const record of zProbe.stdout.split('\0')) {
        if (record.startsWith('worktree ')) {
          const listedPath = record.slice('worktree '.length)
          if (listedPath.length > 0) paths.push(listedPath)
        }
      }
      return paths
    } catch (error) {
      if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
        throw error
      }
      // Fallback for Git < 2.36 where `worktree list --porcelain -z` is unsupported.
      const plainProbe = await this.execGit(
        ['-C', canonicalRepoRoot, 'worktree', 'list', '--porcelain'],
        { cwd: canonicalRepoRoot }
      )
      const paths: string[] = []
      for (const rawStanza of plainProbe.stdout.split(/\r?\n\r?\n/)) {
        const stanza = rawStanza.replace(/^(?:\r?\n)+/, '')
        if (!stanza.startsWith('worktree ')) continue
        const body = stanza.slice('worktree '.length)
        const nextFieldMatch =
          /\r?\n(?:HEAD [0-9a-f]{40,64}|bare|detached|branch |locked|prunable)(?:$|\r?\n)/.exec(
            body
          )
        const listedPath = nextFieldMatch
          ? body.slice(0, nextFieldMatch.index)
          : stripTrailingLineTerminator(body)
        if (listedPath.length > 0) paths.push(listedPath)
      }
      return paths
    }
  }

  async acquireWorktree(options: AcquireWorktreeOptions): Promise<WorktreeLease> {
    if (
      typeof options.runId !== 'string' ||
      options.runId.trim().length === 0 ||
      hasControlChar(options.runId)
    ) {
      throw new GitWorktreeError('WORKTREE_INVALID_REPO', 'runId must be a non-empty string')
    }

    const rawRepoRoot = options.repoRoot
    if (
      typeof rawRepoRoot !== 'string' ||
      rawRepoRoot.trim().length === 0 ||
      rawRepoRoot.includes('\0')
    ) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'repoRoot must be a non-empty absolute path'
      )
    }
    if (hasPathTraversalSegment(rawRepoRoot)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'repoRoot must not contain path traversal segments'
      )
    }
    if (!path.isAbsolute(rawRepoRoot)) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'repoRoot must be a non-empty absolute path'
      )
    }

    const baseRef = validateBaseRef(options.baseRef ?? 'HEAD')
    const detached = options.detached === true
    const branchPrefix = detached
      ? this.defaultBranchPrefix
      : validateBranchPrefix(options.branchPrefix ?? this.defaultBranchPrefix)

    const canonicalBaseDir = await this.ensureBaseDir()

    let canonicalInput: string
    try {
      const inputStat = await stat(rawRepoRoot)
      if (!inputStat.isDirectory()) {
        throw new GitWorktreeError(
          'WORKTREE_INVALID_REPO',
          'repoRoot must be an existing directory'
        )
      }
      canonicalInput = await realpath(rawRepoRoot)
    } catch (error) {
      if (error instanceof GitWorktreeError) throw error
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Target repository root does not exist or is inaccessible',
        { cause: error }
      )
    }

    await assertNoEnclosingRepoSymlinkEscape(rawRepoRoot, canonicalInput)

    // Reject a raw path whose logical parent already sits inside the managed baseDir.
    try {
      const canonicalLogicalParent = await realpath(path.dirname(path.resolve(rawRepoRoot)))
      if (isPathSameOrInside(canonicalLogicalParent, canonicalBaseDir)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Cannot create a nested worktree inside the managed worktree directory'
        )
      }
    } catch (error) {
      if (error instanceof GitWorktreeError) throw error
    }

    const canonicalRepoRoot = await this.resolveGitRepoTopLevel(canonicalInput)

    if (!isPathSameOrInside(canonicalInput, canonicalRepoRoot)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Target path resolves outside the git repository root'
      )
    }
    if (isPathSameOrInside(canonicalBaseDir, canonicalRepoRoot)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Managed worktree baseDir cannot be located inside the target git repository'
      )
    }
    if (
      isPathSameOrInside(canonicalRepoRoot, canonicalBaseDir) ||
      isPathSameOrInside(canonicalInput, canonicalBaseDir)
    ) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Cannot create a nested worktree from inside the managed worktree directory'
      )
    }

    const relativeSubdir = path.relative(canonicalRepoRoot, canonicalInput)
    if (
      relativeSubdir === '..' ||
      relativeSubdir.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeSubdir)
    ) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Target subdirectory escapes repository root'
      )
    }

    const baseCommit = await this.resolveBaseCommit(canonicalRepoRoot, baseRef)
    const worktreeId = generateWorktreeId(options.runId)
    const targetWorktreePath = path.join(canonicalBaseDir, worktreeId)
    if (!isPathStrictlyInside(targetWorktreePath, canonicalBaseDir)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Computed worktree path escapes managed baseDir'
      )
    }

    const branchName = detached ? null : `${branchPrefix}/${worktreeId}`

    await this.withRepoLock(canonicalRepoRoot, async () => {
      const addArgs = detached
        ? [
            '-C',
            canonicalRepoRoot,
            'worktree',
            'add',
            '--detach',
            '--',
            targetWorktreePath,
            baseCommit
          ]
        : [
            '-C',
            canonicalRepoRoot,
            'worktree',
            'add',
            '--no-track',
            '-b',
            branchName!,
            '--',
            targetWorktreePath,
            baseCommit
          ]
      await this.execGit(addArgs, { cwd: canonicalRepoRoot })
    })

    let canonicalWorktreePath: string
    let effectiveCwd: string
    try {
      canonicalWorktreePath = await this.assertManagedWorktreePath(
        targetWorktreePath,
        canonicalBaseDir
      )
      effectiveCwd = await this.resolveEffectiveCwd(canonicalWorktreePath, relativeSubdir)
    } catch (error) {
      await this.rollbackCreatedWorktree(
        canonicalRepoRoot,
        targetWorktreePath,
        branchName,
        canonicalBaseDir
      )
      throw error
    }

    const lease: WorktreeLease = {
      worktreeId,
      runId: options.runId,
      ...(options.conversationId !== undefined ? { conversationId: options.conversationId } : {}),
      repoRoot: canonicalRepoRoot,
      worktreePath: canonicalWorktreePath,
      effectiveCwd,
      branchName,
      baseRef,
      baseCommit,
      createdAt: this.now()
    }

    try {
      await this.writeLeaseMetadata(canonicalBaseDir, lease)
    } catch (error) {
      await this.rollbackCreatedWorktree(
        canonicalRepoRoot,
        canonicalWorktreePath,
        branchName,
        canonicalBaseDir
      )
      throw error
    }

    this.leases.set(worktreeId, lease)
    return cloneLease(lease)
  }

  async inspectWorktree(worktreeId: string): Promise<WorktreeStatus> {
    assertValidWorktreeId(worktreeId)
    const canonicalBaseDir = await this.ensureBaseDir()
    const lease = await this.resolveLeaseForId(worktreeId, canonicalBaseDir)
    const canonicalWorktreePath = await this.assertManagedWorktreePath(
      lease.worktreePath,
      canonicalBaseDir
    )

    return await this.inspectWorktreePath(lease, canonicalWorktreePath)
  }

  async getWorktreeDiff(
    worktreeId: string,
    options?: WorktreeDiffOptions
  ): Promise<WorktreeDiffResult> {
    assertValidWorktreeId(worktreeId)
    const maxBytes =
      typeof options?.maxBytes === 'number' && Number.isFinite(options.maxBytes)
        ? Math.max(0, Math.floor(options.maxBytes))
        : this.maxDiffBytes

    const canonicalBaseDir = await this.ensureBaseDir()
    const lease = await this.resolveLeaseForId(worktreeId, canonicalBaseDir)
    const canonicalWorktreePath = await this.assertManagedWorktreePath(
      lease.worktreePath,
      canonicalBaseDir
    )

    const status = await this.inspectWorktreePath(lease, canonicalWorktreePath)

    const diffArgs = [
      '-C',
      canonicalWorktreePath,
      '-c',
      'core.quotepath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      lease.baseCommit,
      '--'
    ]

    const tracked = await this.spawnBoundedGitDiff(
      canonicalWorktreePath,
      diffArgs,
      maxBytes,
      this.gitTimeoutMs
    )

    let patch = tracked.patch
    let truncated = tracked.truncated
    let byteLength = tracked.byteLength

    if (!truncated) {
      const untrackedFiles = status.changedFiles
        .filter((file) => file.untracked)
        .sort((a, b) => a.path.localeCompare(b.path))

      if (untrackedFiles.length > 0) {
        const parts: Buffer[] = byteLength > 0 ? [Buffer.from(patch, 'utf8')] : []
        for (const file of untrackedFiles) {
          const remainingBytes = maxBytes - byteLength
          if (remainingBytes <= 0) {
            truncated = true
            break
          }

          const entryDiff = await this.buildUntrackedFileDiff(
            canonicalWorktreePath,
            file.path,
            remainingBytes
          )
          if (!entryDiff) continue

          const entryBuf = Buffer.from(entryDiff.text, 'utf8')
          if (entryBuf.length > remainingBytes || entryDiff.readTruncated) {
            const clipped = sliceUtf8BufferToMaxBytes(entryBuf, remainingBytes)
            if (clipped.length > 0) {
              parts.push(clipped)
              byteLength += clipped.length
            }
            truncated = true
            break
          }

          parts.push(entryBuf)
          byteLength += entryBuf.length
        }

        const combined = Buffer.concat(parts, byteLength)
        patch = combined.toString('utf8')
        byteLength = combined.length
      }
    }

    return {
      worktreeId: lease.worktreeId,
      status,
      patch,
      truncated,
      byteLength
    }
  }

  async releaseWorktree(
    worktreeId: string,
    options?: ReleaseWorktreeOptions
  ): Promise<ReleaseWorktreeResult> {
    assertValidWorktreeId(worktreeId)
    return await this.withWorktreeLock(worktreeId, async () => {
      const canonicalBaseDir = await this.ensureBaseDir()
      const lease = await this.resolveLeaseForId(worktreeId, canonicalBaseDir)
      return await this.releaseResolvedLease(lease, canonicalBaseDir, {
        force: options?.force === true,
        deleteBranch: options?.deleteBranch ?? true,
        timeoutMs: this.gitTimeoutMs
      })
    })
  }

  async reapOrphans(options?: ReapOrphansOptions): Promise<ReapOrphansResult> {
    const maxAgeMs =
      typeof options?.maxAgeMs === 'number' && Number.isFinite(options.maxAgeMs)
        ? Math.max(0, options.maxAgeMs)
        : 0
    const force = options?.force === true
    const hasExplicitActiveRuns = options?.activeRunIds !== undefined
    const activeRunIds = hasExplicitActiveRuns ? new Set(options.activeRunIds) : null

    const result: ReapOrphansResult = {
      reapedIds: [],
      skippedActiveIds: [],
      skippedDirtyIds: [],
      failedIds: []
    }

    const canonicalBaseDir = await this.ensureBaseDir()
    const metaDir = path.join(canonicalBaseDir, META_DIR_NAME)

    const candidateIds = new Set<string>()

    try {
      const metaEntries = await readdir(metaDir, { withFileTypes: true })
      for (const entry of metaEntries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const id = entry.name.slice(0, -'.json'.length)
        if (SAFE_WORKTREE_ID_PATTERN.test(id)) {
          candidateIds.add(id)
        }
      }
    } catch (error) {
      if (!isEnoentError(error)) {
        worktreeLog.warn('Failed reading worktree metadata directory during orphan reap', {
          error
        })
      }
    }

    try {
      const dirEntries = await readdir(canonicalBaseDir, { withFileTypes: true })
      for (const entry of dirEntries) {
        if (entry.name === META_DIR_NAME || entry.name.startsWith('.')) continue
        if (!SAFE_WORKTREE_ID_PATTERN.test(entry.name)) {
          result.failedIds.push(entry.name)
          continue
        }
        candidateIds.add(entry.name)
      }
    } catch (error) {
      if (!isEnoentError(error)) {
        worktreeLog.warn('Failed reading worktree base directory during orphan reap', { error })
      }
    }

    const sortedIds = Array.from(candidateIds).sort()

    for (const worktreeId of sortedIds) {
      await this.withWorktreeLock(worktreeId, async () => {
        const memoryLease = this.leases.get(worktreeId)
        let persistedLease: WorktreeLease | null = null
        let corruptMetadata = false

        if (!memoryLease) {
          const loaded = await this.tryReadLeaseMetadata(canonicalBaseDir, worktreeId)
          persistedLease = loaded.lease
          corruptMetadata = loaded.corrupt
        }

        const lease = memoryLease ?? persistedLease

        const isActive = hasExplicitActiveRuns
          ? Boolean(lease && activeRunIds!.has(lease.runId))
          : this.leases.has(worktreeId)

        if (isActive) {
          result.skippedActiveIds.push(worktreeId)
          return
        }

        const candidatePath = lease?.worktreePath ?? path.join(canonicalBaseDir, worktreeId)

        if (!isPathStrictlyInside(candidatePath, canonicalBaseDir)) {
          result.failedIds.push(worktreeId)
          return
        }

        let dirExists = false
        let dirMtimeMs = 0
        try {
          const entryStat = await lstat(candidatePath)
          if (entryStat.isSymbolicLink()) {
            // Never follow or delete a symlink inside baseDir, even under force.
            result.failedIds.push(worktreeId)
            return
          }
          const realCandidate = await realpath(candidatePath)
          if (!isPathStrictlyInside(realCandidate, canonicalBaseDir)) {
            result.failedIds.push(worktreeId)
            return
          }
          dirExists = true
          dirMtimeMs = entryStat.mtimeMs
        } catch (error) {
          if (!isEnoentError(error)) {
            result.failedIds.push(worktreeId)
            return
          }
        }

        if (maxAgeMs > 0) {
          const createdAt = await this.resolveCandidateTimestamp(
            lease,
            canonicalBaseDir,
            worktreeId,
            dirExists ? dirMtimeMs : null
          )
          const ageMs = Math.max(0, this.now() - createdAt)
          if (ageMs < maxAgeMs) {
            return
          }
        }

        if (lease) {
          try {
            await this.releaseResolvedLease(lease, canonicalBaseDir, {
              force,
              deleteBranch: true,
              timeoutMs: this.gitTimeoutMs
            })
            result.reapedIds.push(worktreeId)
          } catch (error) {
            if (error instanceof GitWorktreeError && error.code === 'WORKTREE_DIRTY') {
              result.skippedDirtyIds.push(worktreeId)
            } else {
              result.failedIds.push(worktreeId)
            }
          }
          return
        }

        if (corruptMetadata && !force) {
          result.failedIds.push(worktreeId)
          return
        }

        if (!dirExists) {
          await this.removeLeaseMetadata(canonicalBaseDir, worktreeId)
          result.reapedIds.push(worktreeId)
          return
        }

        // Unregistered directory under baseDir (e.g. crash before .meta write).
        const reaped = await this.reapUnregisteredDirectory(
          worktreeId,
          candidatePath,
          canonicalBaseDir,
          force
        )
        if (reaped === 'reaped') {
          await this.removeLeaseMetadata(canonicalBaseDir, worktreeId)
          result.reapedIds.push(worktreeId)
        } else if (reaped === 'dirty') {
          result.skippedDirtyIds.push(worktreeId)
        } else {
          result.failedIds.push(worktreeId)
        }
      })
    }

    return result
  }

  async disposeAll(options?: DisposeAllWorktreesOptions): Promise<void> {
    const force = options?.force === true
    const preserveRunIds = options?.preserveRunIds ? new Set(options.preserveRunIds) : null
    const totalBudgetMs =
      typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
        ? Math.max(200, Math.floor(options.timeoutMs))
        : Math.min(this.gitTimeoutMs, DEFAULT_DISPOSE_TIMEOUT_MS)

    const snapshot = Array.from(this.leases.values())
    if (snapshot.length === 0) return

    const deadline = this.now() + totalBudgetMs
    const canonicalBaseDir = await this.ensureBaseDir().catch(() => null)
    if (!canonicalBaseDir) return

    for (const lease of snapshot) {
      if (preserveRunIds?.has(lease.runId)) {
        worktreeLog.info('Preserving managed worktree for startup recovery', {
          meta: { worktreeId: lease.worktreeId }
        })
        continue
      }

      const remainingMs = deadline - this.now()
      if (remainingMs <= 0) {
        worktreeLog.warn('Worktree disposeAll hit shutdown budget; stopping early', {
          meta: { remainingLeases: this.leases.size }
        })
        break
      }

      await this.withWorktreeLock(lease.worktreeId, async () => {
        const liveLease = this.leases.get(lease.worktreeId)
        if (!liveLease) return
        if (preserveRunIds?.has(liveLease.runId)) return
        const perItemTimeoutMs = Math.max(100, Math.min(this.gitTimeoutMs, remainingMs))
        try {
          await this.releaseResolvedLease(liveLease, canonicalBaseDir, {
            force,
            deleteBranch: true,
            timeoutMs: perItemTimeoutMs
          })
        } catch (error) {
          if (error instanceof GitWorktreeError && error.code === 'WORKTREE_DIRTY') {
            worktreeLog.info('Preserving dirty managed worktree during shutdown', {
              meta: { worktreeId: liveLease.worktreeId }
            })
            return
          }
          worktreeLog.warn('Failed to release managed worktree during shutdown', {
            meta: { worktreeId: liveLease.worktreeId },
            error
          })
        }
      })
    }
  }

  private async ensureBaseDir(): Promise<string> {
    const rawBaseDir = this.configuredBaseDir ?? (await resolveDefaultBaseDir())
    if (
      !rawBaseDir ||
      rawBaseDir.includes('\0') ||
      !path.isAbsolute(rawBaseDir) ||
      hasPathTraversalSegment(rawBaseDir)
    ) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Resolved worktree baseDir is invalid or unsafe'
      )
    }
    await mkdir(rawBaseDir, { recursive: true })
    const canonicalBaseDir = await realpath(rawBaseDir)
    await mkdir(path.join(canonicalBaseDir, META_DIR_NAME), { recursive: true })
    return canonicalBaseDir
  }

  private async resolveGitRepoTopLevel(canonicalInput: string): Promise<string> {
    try {
      const { stdout } = await this.execGit(
        [
          '-C',
          canonicalInput,
          'rev-parse',
          '--show-toplevel',
          '--is-bare-repository',
          '--is-inside-work-tree'
        ],
        { cwd: canonicalInput }
      )
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      const topLevel = lines[0]
      const isBare = lines[1]
      const isInsideWorkTree = lines[2]

      if (isBare === 'true') {
        throw new GitWorktreeError(
          'WORKTREE_BARE_REPO',
          'Bare git repositories are not supported for worktree isolation'
        )
      }
      if (!topLevel || isInsideWorkTree !== 'true') {
        throw new GitWorktreeError(
          'WORKTREE_NOT_GIT_REPO',
          'Target directory is not inside a git working tree'
        )
      }
      return await realpath(topLevel)
    } catch (error) {
      if (error instanceof GitWorktreeError) {
        if (error.code === 'WORKTREE_GIT_TIMEOUT' || error.code === 'WORKTREE_BARE_REPO') {
          throw error
        }
        // Distinguish bare repository vs .git metadata dir vs non-git dir.
        return await this.classifyFailedGitRepoProbe(canonicalInput, error)
      }
      throw error
    }
  }

  private async classifyFailedGitRepoProbe(
    canonicalInput: string,
    originalError: GitWorktreeError
  ): Promise<never> {
    try {
      const { stdout } = await this.execGit(
        ['-C', canonicalInput, 'rev-parse', '--is-bare-repository', '--is-inside-work-tree'],
        { cwd: canonicalInput }
      )
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      if (lines[0] === 'true') {
        throw new GitWorktreeError(
          'WORKTREE_BARE_REPO',
          'Bare git repositories are not supported for worktree isolation',
          { cause: originalError }
        )
      }
      if (lines[1] === 'false') {
        throw new GitWorktreeError(
          'WORKTREE_INVALID_REPO',
          'Target path is inside git metadata rather than a working tree',
          { cause: originalError }
        )
      }
    } catch (probeError) {
      if (probeError instanceof GitWorktreeError) {
        if (
          probeError.code === 'WORKTREE_BARE_REPO' ||
          probeError.code === 'WORKTREE_INVALID_REPO' ||
          probeError.code === 'WORKTREE_GIT_TIMEOUT'
        ) {
          throw probeError
        }
        const detail = probeError.message.toLowerCase()
        if (detail.includes('not a git repository')) {
          throw new GitWorktreeError(
            'WORKTREE_NOT_GIT_REPO',
            'Target directory is not a git repository',
            { cause: probeError }
          )
        }
      }
    }

    const detail = originalError.message.toLowerCase()
    if (detail.includes('not a git repository')) {
      throw new GitWorktreeError(
        'WORKTREE_NOT_GIT_REPO',
        'Target directory is not a git repository',
        { cause: originalError }
      )
    }
    throw originalError
  }

  private async resolveBaseCommit(canonicalRepoRoot: string, baseRef: string): Promise<string> {
    try {
      const { stdout } = await this.execGit(
        ['-C', canonicalRepoRoot, 'rev-parse', '--verify', `${baseRef}^{commit}`],
        { cwd: canonicalRepoRoot }
      )
      const commit = stdout.trim()
      if (!COMMIT_HASH_PATTERN.test(commit)) {
        throw new GitWorktreeError(
          'WORKTREE_INVALID_REF',
          `Git ref "${baseRef}" did not resolve to a valid commit`
        )
      }
      return commit
    } catch (error) {
      if (error instanceof GitWorktreeError) {
        if (error.code === 'WORKTREE_GIT_TIMEOUT' || error.code === 'WORKTREE_INVALID_REF') {
          throw error
        }
        throw new GitWorktreeError(
          'WORKTREE_INVALID_REF',
          `Unable to resolve git baseRef "${baseRef}" to a commit`,
          { cause: error }
        )
      }
      throw error
    }
  }

  private async assertManagedWorktreePath(
    worktreePath: string,
    canonicalBaseDir: string
  ): Promise<string> {
    if (!isPathStrictlyInside(worktreePath, canonicalBaseDir)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Worktree path is outside the managed base directory'
      )
    }

    let entryStat
    try {
      entryStat = await lstat(worktreePath)
    } catch (error) {
      if (isEnoentError(error)) {
        throw new GitWorktreeError(
          'WORKTREE_NOT_FOUND',
          'Managed worktree directory does not exist',
          {
            cause: error
          }
        )
      }
      throw new GitWorktreeError(
        'WORKTREE_GIT_FAILED',
        'Unable to stat managed worktree directory',
        { cause: error }
      )
    }

    if (entryStat.isSymbolicLink()) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Refusing to operate on symlinked managed worktree path'
      )
    }
    if (!entryStat.isDirectory()) {
      throw new GitWorktreeError(
        'WORKTREE_INVALID_REPO',
        'Managed worktree path is not a directory'
      )
    }

    const canonicalWorktreePath = await realpath(worktreePath)
    if (!isPathStrictlyInside(canonicalWorktreePath, canonicalBaseDir)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Canonical worktree path escapes the managed base directory'
      )
    }
    return canonicalWorktreePath
  }

  private async resolveEffectiveCwd(
    canonicalWorktreePath: string,
    relativeSubdir: string
  ): Promise<string> {
    if (!relativeSubdir) return canonicalWorktreePath
    const candidate = path.join(canonicalWorktreePath, relativeSubdir)
    if (!isPathStrictlyInside(candidate, canonicalWorktreePath)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Computed effectiveCwd escapes the managed worktree directory'
      )
    }

    try {
      const subStat = await lstat(candidate)
      if (subStat.isSymbolicLink()) {
        const realSub = await realpath(candidate)
        if (!isPathSameOrInside(realSub, canonicalWorktreePath)) {
          throw new GitWorktreeError(
            'WORKTREE_PATH_ESCAPE',
            'Subdirectory symlink escapes managed worktree root'
          )
        }
        return realSub
      }
      if (!subStat.isDirectory()) {
        return canonicalWorktreePath
      }
      const realSub = await realpath(candidate)
      if (!isPathSameOrInside(realSub, canonicalWorktreePath)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Canonical effectiveCwd escapes managed worktree root'
        )
      }
      return realSub
    } catch (error) {
      if (error instanceof GitWorktreeError) throw error
      if (isEnoentError(error)) {
        // Subdirectory does not exist at baseRef (e.g. untracked folder); keep worktree root.
        return canonicalWorktreePath
      }
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Unable to verify effectiveCwd containment inside managed worktree',
        { cause: error }
      )
    }
  }

  private async rollbackCreatedWorktree(
    canonicalRepoRoot: string,
    worktreePath: string,
    branchName: string | null,
    canonicalBaseDir: string
  ): Promise<void> {
    try {
      await this.withRepoLock(canonicalRepoRoot, async () => {
        await this.execGit(
          ['-C', canonicalRepoRoot, 'worktree', 'remove', '--force', '--', worktreePath],
          { cwd: canonicalRepoRoot }
        ).catch(() => undefined)
        if (branchName) {
          await this.execGit(['-C', canonicalRepoRoot, 'branch', '-D', '--', branchName], {
            cwd: canonicalRepoRoot
          }).catch(() => undefined)
        }
      })
    } catch {
      // Best-effort rollback only.
    }

    try {
      const st = await lstat(worktreePath)
      if (!st.isSymbolicLink()) {
        const real = await realpath(worktreePath)
        if (isPathStrictlyInside(real, canonicalBaseDir)) {
          await rm(real, { recursive: true, force: true })
        }
      }
    } catch {
      // Already removed or absent.
    }
  }

  private async inspectWorktreePath(
    lease: WorktreeLease,
    canonicalWorktreePath: string,
    timeoutMs = this.gitTimeoutMs
  ): Promise<WorktreeStatus> {
    const [statusResult, headResult, branchName] = await Promise.all([
      this.execGit(['-C', canonicalWorktreePath, 'status', '--porcelain=v1', '-z', '-uall'], {
        cwd: canonicalWorktreePath,
        timeoutMs
      }),
      this.execGit(['-C', canonicalWorktreePath, 'rev-parse', 'HEAD'], {
        cwd: canonicalWorktreePath,
        timeoutMs
      }),
      this.resolveCurrentBranchName(canonicalWorktreePath, timeoutMs)
    ])

    const changedFiles = parsePorcelainStatusZ(statusResult.stdout)
    const headCommit = headResult.stdout.trim()
    const { ahead, behind } = await this.resolveAheadBehind(canonicalWorktreePath, lease, timeoutMs)

    return {
      worktreeId: lease.worktreeId,
      worktreePath: canonicalWorktreePath,
      branchName,
      headCommit,
      dirty: changedFiles.length > 0,
      changedFiles,
      ahead,
      behind
    }
  }

  private async resolveCurrentBranchName(
    worktreePath: string,
    timeoutMs: number
  ): Promise<string | null> {
    try {
      const { stdout } = await this.execGit(
        ['-C', worktreePath, 'symbolic-ref', '--quiet', '--short', 'HEAD'],
        { cwd: worktreePath, timeoutMs }
      )
      const branch = stdout.trim()
      return branch.length > 0 ? branch : null
    } catch (error) {
      if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
        throw error
      }
      return null
    }
  }

  private async resolveAheadBehind(
    worktreePath: string,
    lease: WorktreeLease,
    timeoutMs: number
  ): Promise<{ ahead: number; behind: number }> {
    let compareRef = lease.baseCommit
    if (lease.baseRef !== 'HEAD') {
      try {
        const resolved = await this.execGit(
          ['-C', worktreePath, 'rev-parse', '--verify', '--quiet', `${lease.baseRef}^{commit}`],
          { cwd: worktreePath, timeoutMs }
        )
        if (COMMIT_HASH_PATTERN.test(resolved.stdout.trim())) {
          compareRef = lease.baseRef
        }
      } catch (error) {
        if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
          throw error
        }
        compareRef = lease.baseCommit
      }
    }

    try {
      const { stdout } = await this.execGit(
        ['-C', worktreePath, 'rev-list', '--left-right', '--count', `${compareRef}...HEAD`],
        { cwd: worktreePath, timeoutMs }
      )
      const parts = stdout.trim().split(/\s+/)
      const behind = Number.parseInt(parts[0] ?? '0', 10)
      const ahead = Number.parseInt(parts[1] ?? '0', 10)
      return {
        ahead: Number.isFinite(ahead) ? ahead : 0,
        behind: Number.isFinite(behind) ? behind : 0
      }
    } catch (error) {
      if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
        throw error
      }
      return { ahead: 0, behind: 0 }
    }
  }

  private async releaseResolvedLease(
    lease: WorktreeLease,
    canonicalBaseDir: string,
    options: { force: boolean; deleteBranch: boolean; timeoutMs: number }
  ): Promise<ReleaseWorktreeResult> {
    const { force, deleteBranch, timeoutMs } = options

    if (!isPathStrictlyInside(lease.worktreePath, canonicalBaseDir)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Lease worktreePath is outside managed baseDir'
      )
    }

    let dirExists = false
    let canonicalWorktreePath: string | null = null
    let headCommit: string | null = null

    try {
      const entryStat = await lstat(lease.worktreePath)
      if (entryStat.isSymbolicLink()) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Refusing to remove symlinked managed worktree path'
        )
      }
      canonicalWorktreePath = await realpath(lease.worktreePath)
      if (!isPathStrictlyInside(canonicalWorktreePath, canonicalBaseDir)) {
        throw new GitWorktreeError(
          'WORKTREE_PATH_ESCAPE',
          'Canonical worktree path escapes managed baseDir'
        )
      }
      dirExists = true
    } catch (error) {
      if (error instanceof GitWorktreeError) throw error
      if (!isEnoentError(error)) {
        throw new GitWorktreeError(
          'WORKTREE_GIT_FAILED',
          'Unable to verify worktree directory before removal',
          { cause: error }
        )
      }
    }

    if (dirExists && canonicalWorktreePath) {
      if (!force) {
        const statusResult = await this.execGit(
          ['-C', canonicalWorktreePath, 'status', '--porcelain=v1', '-z', '-uall'],
          { cwd: canonicalWorktreePath, timeoutMs }
        )
        const changedFiles = parsePorcelainStatusZ(statusResult.stdout)
        if (changedFiles.length > 0) {
          throw new GitWorktreeError(
            'WORKTREE_DIRTY',
            `Worktree "${lease.worktreeId}" has ${changedFiles.length} uncommitted change(s); pass force: true to discard`,
            { changedFiles: changedFiles.map((file) => file.path) }
          )
        }
      }

      try {
        const head = await this.execGit(['-C', canonicalWorktreePath, 'rev-parse', 'HEAD'], {
          cwd: canonicalWorktreePath,
          timeoutMs
        })
        headCommit = head.stdout.trim()
      } catch {
        headCommit = null
      }
    }

    const repoExists = await this.isDirectoryPresent(lease.repoRoot)
    let removed = false
    let branchDeleted = false

    await this.withRepoLock(lease.repoRoot, async () => {
      if (dirExists && canonicalWorktreePath) {
        let removedByGit = false
        if (repoExists) {
          const removeArgs = force
            ? ['-C', lease.repoRoot, 'worktree', 'remove', '--force', '--', canonicalWorktreePath]
            : ['-C', lease.repoRoot, 'worktree', 'remove', '--', canonicalWorktreePath]
          try {
            await this.execGit(removeArgs, { cwd: lease.repoRoot, timeoutMs })
            removedByGit = true
            removed = true
          } catch (error) {
            if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
              throw error
            }
            if (!force) {
              // If the worktree is no longer registered in git metadata (e.g. pruned), remove cleanly
              // only if we already verified it is clean above; otherwise rethrow.
              const msg = error instanceof Error ? error.message.toLowerCase() : ''
              if (!msg.includes('is not a working tree')) {
                throw error
              }
            }
          }
        }

        if (!removedByGit) {
          // Re-verify non-symlink + strict containment immediately before fs deletion.
          const verifiedPath = await this.assertManagedWorktreePath(
            canonicalWorktreePath,
            canonicalBaseDir
          )
          await rm(verifiedPath, { recursive: true, force: true })
          removed = true
          if (repoExists) {
            await this.execGit(['-C', lease.repoRoot, 'worktree', 'prune'], {
              cwd: lease.repoRoot,
              timeoutMs
            }).catch(() => undefined)
          }
        }
      } else if (repoExists) {
        await this.execGit(['-C', lease.repoRoot, 'worktree', 'prune'], {
          cwd: lease.repoRoot,
          timeoutMs
        }).catch(() => undefined)
      }

      if (deleteBranch && lease.branchName && repoExists) {
        const unchangedBranch = headCommit !== null && headCommit === lease.baseCommit
        const deleteFlag = force || unchangedBranch ? '-D' : '-d'
        try {
          await this.execGit(['-C', lease.repoRoot, 'branch', deleteFlag, '--', lease.branchName], {
            cwd: lease.repoRoot,
            timeoutMs
          })
          branchDeleted = true
        } catch (error) {
          if (error instanceof GitWorktreeError && error.code === 'WORKTREE_GIT_TIMEOUT') {
            throw error
          }
          branchDeleted = false
        }
      }
    })

    this.leases.delete(lease.worktreeId)
    await this.removeLeaseMetadata(canonicalBaseDir, lease.worktreeId)

    return {
      worktreeId: lease.worktreeId,
      removed,
      branchDeleted
    }
  }

  private async reapUnregisteredDirectory(
    worktreeId: string,
    candidatePath: string,
    canonicalBaseDir: string,
    force: boolean
  ): Promise<'reaped' | 'dirty' | 'failed'> {
    try {
      const verifiedPath = await this.assertManagedWorktreePath(candidatePath, canonicalBaseDir)
      const gitFilePath = path.join(verifiedPath, '.git')
      let isLinked = false
      try {
        const gitFileStat = await lstat(gitFilePath)
        if (gitFileStat.isFile()) {
          const content = await readFile(gitFilePath, 'utf8')
          isLinked = isLinkedWorktreeGitFile(content)
        }
      } catch {
        isLinked = false
      }

      if (!isLinked && !force) {
        return 'failed'
      }

      if (isLinked && !force) {
        const statusResult = await this.execGit(
          ['-C', verifiedPath, 'status', '--porcelain=v1', '-z', '-uall'],
          { cwd: verifiedPath }
        )
        const changedFiles = parsePorcelainStatusZ(statusResult.stdout)
        if (changedFiles.length > 0) {
          return 'dirty'
        }
      }

      let commonDir: string | null = null
      if (isLinked) {
        try {
          const { stdout } = await this.execGit(
            ['-C', verifiedPath, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
            { cwd: verifiedPath }
          )
          const resolved = stdout.trim()
          if (resolved && path.isAbsolute(resolved)) {
            commonDir = resolved
          }
        } catch {
          commonDir = null
        }
      }

      const verifiedAgain = await this.assertManagedWorktreePath(verifiedPath, canonicalBaseDir)
      await rm(verifiedAgain, { recursive: true, force: true })

      if (commonDir) {
        const repoDir = path.dirname(commonDir)
        if (await this.isDirectoryPresent(repoDir)) {
          await this.withRepoLock(repoDir, async () => {
            await this.execGit(['-C', repoDir, 'worktree', 'prune'], { cwd: repoDir }).catch(
              () => undefined
            )
          })
        }
      }

      worktreeLog.info('Reaped unregistered managed worktree directory', {
        meta: { worktreeId }
      })
      return 'reaped'
    } catch {
      return 'failed'
    }
  }

  private async buildUntrackedFileDiff(
    canonicalWorktreePath: string,
    relPath: string,
    remainingBytes: number
  ): Promise<{ text: string; readTruncated: boolean } | null> {
    if (!relPath || relPath.includes('\0') || hasPathTraversalSegment(relPath)) {
      return null
    }
    const absPath = path.join(canonicalWorktreePath, relPath)
    if (!isPathStrictlyInside(absPath, canonicalWorktreePath)) {
      return null
    }

    let fileStat
    try {
      fileStat = await lstat(absPath)
    } catch {
      return null
    }

    const normalizedPath = relPath.split(path.sep).join('/')

    if (fileStat.isSymbolicLink()) {
      const target = await readlink(absPath).catch(() => '')
      const text =
        `diff --git a/${normalizedPath} b/${normalizedPath}\n` +
        `new file mode 120000\n` +
        `--- /dev/null\n` +
        `+++ b/${normalizedPath}\n` +
        `@@ -0,0 +1 @@\n` +
        `+${target}\n\\ No newline at end of file\n`
      return { text, readTruncated: false }
    }

    if (!fileStat.isFile()) return null

    const realFilePath = await realpath(absPath).catch(() => null)
    if (!realFilePath || !isPathStrictlyInside(realFilePath, canonicalWorktreePath)) {
      return null
    }

    const readLimit = Math.min(Math.max(remainingBytes + 512, 1024), UNTRACKED_READ_CAP_BYTES)
    const handle = await open(realFilePath, 'r')
    try {
      const buf = Buffer.allocUnsafe(readLimit + 1)
      let bytesRead = 0
      while (bytesRead < readLimit + 1) {
        const chunk = await handle.read(buf, bytesRead, readLimit + 1 - bytesRead, bytesRead)
        if (chunk.bytesRead === 0) break
        bytesRead += chunk.bytesRead
      }

      const readTruncated = bytesRead > readLimit
      const sample = buf.subarray(0, Math.min(bytesRead, readLimit))
      const sniffEnd = Math.min(sample.length, UNTRACKED_BINARY_SNIFF_BYTES)
      for (let i = 0; i < sniffEnd; i += 1) {
        if (sample[i] === 0) {
          return {
            text:
              `diff --git a/${normalizedPath} b/${normalizedPath}\n` +
              `new file mode 100644\n` +
              `Binary files /dev/null and b/${normalizedPath} differ\n`,
            readTruncated: false
          }
        }
      }

      const safeSlice = readTruncated ? sliceUtf8BufferToMaxBytes(sample, readLimit) : sample
      return {
        text: formatUntrackedTextDiff(normalizedPath, safeSlice.toString('utf8'), readTruncated),
        readTruncated
      }
    } finally {
      await handle.close().catch(() => undefined)
    }
  }

  private async spawnBoundedGitDiff(
    cwd: string,
    args: string[],
    maxBytes: number,
    timeoutMs: number
  ): Promise<BoundedDiffStreamResult> {
    return await new Promise<BoundedDiffStreamResult>((resolve, reject) => {
      const child = spawn(this.gitBinary, args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildGitEnv()
      })

      let settled = false
      let exited = false
      let truncated = false
      let timedOut = false
      let terminating = false

      const stdoutChunks: Buffer[] = []
      let stdoutBytes = 0
      const stderrChunks: Buffer[] = []
      let stderrBytes = 0

      let timeoutTimer: NodeJS.Timeout | undefined
      let sigtermTimer: NodeJS.Timeout | undefined
      let sigkillTimer: NodeJS.Timeout | undefined

      const clearAllTimers = (): void => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = undefined
        }
        if (sigtermTimer) {
          clearTimeout(sigtermTimer)
          sigtermTimer = undefined
        }
        if (sigkillTimer) {
          clearTimeout(sigkillTimer)
          sigkillTimer = undefined
        }
      }

      const detachStreams = (): void => {
        if (child.stdout) {
          child.stdout.removeAllListeners('data')
          if (!child.stdout.destroyed) child.stdout.destroy()
        }
        if (child.stderr) {
          child.stderr.removeAllListeners('data')
          if (!child.stderr.destroyed) child.stderr.destroy()
        }
      }

      const settleResolve = (value: BoundedDiffStreamResult): void => {
        if (settled) return
        settled = true
        clearAllTimers()
        detachStreams()
        resolve(value)
      }

      const settleReject = (error: GitWorktreeError): void => {
        if (settled) return
        settled = true
        clearAllTimers()
        detachStreams()
        reject(error)
      }

      const finishTruncated = (): void => {
        const raw = Buffer.concat(stdoutChunks, stdoutBytes)
        const sliced = sliceUtf8BufferToMaxBytes(raw, maxBytes)
        settleResolve({
          patch: sliced.toString('utf8'),
          truncated: true,
          byteLength: sliced.length
        })
      }

      const terminateBounded = (onFallback: () => void): void => {
        if (terminating) return
        terminating = true
        detachStreams()
        if (exited) {
          onFallback()
          return
        }
        try {
          child.kill('SIGTERM')
        } catch {
          // Process may have already exited.
        }
        sigtermTimer = setTimeout(() => {
          if (exited || settled) return
          try {
            child.kill('SIGKILL')
          } catch {
            // Process may have already exited.
          }
          sigkillTimer = setTimeout(() => {
            if (settled) return
            try {
              child.unref?.()
            } catch {
              // Ignore unref failures.
            }
            onFallback()
          }, DIFF_SIGKILL_GRACE_MS)
          sigkillTimer.unref?.()
        }, DIFF_SIGTERM_GRACE_MS)
        sigtermTimer.unref?.()
      }

      // Track process exit immediately so SIGKILL escalation never fires after exit.
      child.once('exit', () => {
        exited = true
      })

      // Keep error listeners attached to prevent unhandled error events during teardown.
      child.stdout?.on('error', () => undefined)
      child.stderr?.on('error', () => undefined)

      child.stdout?.on('data', (chunk: Buffer) => {
        if (settled || truncated || timedOut) return
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        const threshold = maxBytes + 1
        const remaining = threshold - stdoutBytes
        if (buf.length >= remaining) {
          if (remaining > 0) {
            stdoutChunks.push(buf.subarray(0, remaining))
            stdoutBytes += remaining
          }
          truncated = true
          terminateBounded(finishTruncated)
          return
        }
        stdoutChunks.push(buf)
        stdoutBytes += buf.length
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes >= DIFF_STDERR_MAX_BYTES) return
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        const take = Math.min(buf.length, DIFF_STDERR_MAX_BYTES - stderrBytes)
        if (take > 0) {
          stderrChunks.push(buf.subarray(0, take))
          stderrBytes += take
        }
      })

      timeoutTimer = setTimeout(() => {
        if (settled || truncated) return
        timedOut = true
        terminateBounded(() => {
          settleReject(
            new GitWorktreeError('WORKTREE_GIT_TIMEOUT', `Git diff timed out after ${timeoutMs}ms`)
          )
        })
      }, timeoutMs)
      timeoutTimer.unref?.()

      child.on('error', (error) => {
        if (settled) return
        if (truncated) {
          finishTruncated()
          return
        }
        if (timedOut) {
          settleReject(
            new GitWorktreeError(
              'WORKTREE_GIT_TIMEOUT',
              `Git diff timed out after ${timeoutMs}ms`,
              { cause: error }
            )
          )
          return
        }
        settleReject(
          new GitWorktreeError(
            'WORKTREE_GIT_FAILED',
            `Git diff failed to spawn: ${error.message}`,
            { cause: error }
          )
        )
      })

      child.on('close', (code, signal) => {
        exited = true
        if (settled) return
        if (truncated) {
          finishTruncated()
          return
        }
        if (timedOut) {
          settleReject(
            new GitWorktreeError('WORKTREE_GIT_TIMEOUT', `Git diff timed out after ${timeoutMs}ms`)
          )
          return
        }
        if (code === 0) {
          const raw = Buffer.concat(stdoutChunks, stdoutBytes)
          if (raw.length > maxBytes) {
            const sliced = sliceUtf8BufferToMaxBytes(raw, maxBytes)
            settleResolve({
              patch: sliced.toString('utf8'),
              truncated: true,
              byteLength: sliced.length
            })
            return
          }
          settleResolve({
            patch: raw.toString('utf8'),
            truncated: false,
            byteLength: raw.length
          })
          return
        }

        const stderrText = Buffer.concat(stderrChunks, stderrBytes).toString('utf8').trim()
        const detail = stderrText || `exit code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`
        settleReject(new GitWorktreeError('WORKTREE_GIT_FAILED', `Git diff failed: ${detail}`))
      })
    })
  }

  private async execGit(
    args: string[],
    options: { cwd?: string; timeoutMs?: number } = {}
  ): Promise<GitExecResult> {
    const timeout = options.timeoutMs ?? this.gitTimeoutMs
    try {
      const { stdout, stderr } = await execFileAsync(this.gitBinary, args, {
        cwd: options.cwd,
        timeout,
        maxBuffer: DEFAULT_GIT_MAX_BUFFER,
        encoding: 'utf8',
        env: buildGitEnv()
      })
      return {
        stdout: typeof stdout === 'string' ? stdout : String(stdout),
        stderr: typeof stderr === 'string' ? stderr : String(stderr)
      }
    } catch (error) {
      if (isExecTimeoutError(error)) {
        throw new GitWorktreeError(
          'WORKTREE_GIT_TIMEOUT',
          `Git command timed out after ${timeout}ms`,
          { cause: error }
        )
      }
      throw new GitWorktreeError(
        'WORKTREE_GIT_FAILED',
        `Git command failed: ${extractCommandStderr(error)}`,
        { cause: error }
      )
    }
  }

  private getLeaseMetadataPath(canonicalBaseDir: string, worktreeId: string): string {
    assertValidWorktreeId(worktreeId)
    const metaDir = path.join(canonicalBaseDir, META_DIR_NAME)
    const metaPath = path.join(metaDir, `${worktreeId}.json`)
    if (!isPathStrictlyInside(metaPath, metaDir)) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        'Metadata file path escapes managed .meta directory'
      )
    }
    return metaPath
  }

  private async writeLeaseMetadata(canonicalBaseDir: string, lease: WorktreeLease): Promise<void> {
    const metaPath = this.getLeaseMetadataPath(canonicalBaseDir, lease.worktreeId)
    const tmpPath = `${metaPath}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`
    await writeFile(tmpPath, `${JSON.stringify(lease, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    try {
      await rename(tmpPath, metaPath)
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined)
      throw error
    }
  }

  private async removeLeaseMetadata(canonicalBaseDir: string, worktreeId: string): Promise<void> {
    const metaPath = this.getLeaseMetadataPath(canonicalBaseDir, worktreeId)
    await unlink(metaPath).catch((error) => {
      if (!isEnoentError(error)) {
        worktreeLog.warn('Failed to remove worktree metadata file', {
          meta: { worktreeId },
          error
        })
      }
    })
  }

  private async tryReadLeaseMetadata(
    canonicalBaseDir: string,
    worktreeId: string
  ): Promise<{ lease: WorktreeLease | null; corrupt: boolean }> {
    const metaPath = this.getLeaseMetadataPath(canonicalBaseDir, worktreeId)
    let raw: string
    try {
      const metaStat = await lstat(metaPath)
      if (!metaStat.isFile() || metaStat.isSymbolicLink()) {
        return { lease: null, corrupt: true }
      }
      raw = await readFile(metaPath, 'utf8')
    } catch (error) {
      if (isEnoentError(error)) {
        return { lease: null, corrupt: false }
      }
      return { lease: null, corrupt: true }
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isValidPersistedLease(parsed) || parsed.worktreeId !== worktreeId) {
        return { lease: null, corrupt: true }
      }
      const expectedWorktreePath = path.join(canonicalBaseDir, worktreeId)
      if (
        !isPathStrictlyInside(parsed.worktreePath, canonicalBaseDir) ||
        normalizePathForCompare(parsed.worktreePath) !==
          normalizePathForCompare(expectedWorktreePath)
      ) {
        return { lease: null, corrupt: true }
      }
      return { lease: parsed, corrupt: false }
    } catch {
      return { lease: null, corrupt: true }
    }
  }

  private async resolveLeaseForId(
    worktreeId: string,
    canonicalBaseDir: string
  ): Promise<WorktreeLease> {
    const memoryLease = this.leases.get(worktreeId)
    if (memoryLease) return memoryLease

    const { lease, corrupt } = await this.tryReadLeaseMetadata(canonicalBaseDir, worktreeId)
    if (lease) return lease
    if (corrupt) {
      throw new GitWorktreeError(
        'WORKTREE_PATH_ESCAPE',
        `Persisted metadata for worktree "${worktreeId}" is invalid or unsafe`
      )
    }
    throw new GitWorktreeError('WORKTREE_NOT_FOUND', `Worktree lease not found: ${worktreeId}`)
  }

  private async resolveCandidateTimestamp(
    lease: WorktreeLease | null,
    canonicalBaseDir: string,
    worktreeId: string,
    dirMtimeMs: number | null
  ): Promise<number> {
    if (lease) return lease.createdAt
    if (dirMtimeMs !== null) return dirMtimeMs
    try {
      const metaStat = await lstat(this.getLeaseMetadataPath(canonicalBaseDir, worktreeId))
      return metaStat.mtimeMs
    } catch {
      return 0
    }
  }

  private async isDirectoryPresent(dirPath: string): Promise<boolean> {
    try {
      const st = await stat(dirPath)
      return st.isDirectory()
    } catch {
      return false
    }
  }

  private async withRepoLock<T>(repoKey: string, task: () => Promise<T>): Promise<T> {
    return await this.withMutex(this.repoLocks, normalizePathForCompare(repoKey), task)
  }

  private async withWorktreeLock<T>(worktreeId: string, task: () => Promise<T>): Promise<T> {
    return await this.withMutex(this.worktreeLocks, worktreeId, task)
  }

  private async withMutex<T>(
    map: Map<string, Promise<void>>,
    key: string,
    task: () => Promise<T>
  ): Promise<T> {
    const prev = map.get(key) ?? Promise.resolve()
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = prev.then(() => next)
    map.set(key, tail)

    await prev
    try {
      return await task()
    } finally {
      release()
      if (map.get(key) === tail) {
        map.delete(key)
      }
    }
  }
}

export const gitWorktreeManager = new GitWorktreeManager()
