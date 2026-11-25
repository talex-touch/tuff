import type {
  WorkspaceGitAuthorAvatar,
  WorkspaceGitBranchEntry,
  WorkspaceGitBranchesResult,
  WorkspaceGitCheckoutRequest,
  WorkspaceGitCommitEntry,
  WorkspaceGitCommitFileEntry,
  WorkspaceGitCommitFilesRequest,
  WorkspaceGitCommitFilesResult,
  WorkspaceGitCommitRequest,
  WorkspaceGitDeleteBranchRequest,
  WorkspaceGitDiffRequest,
  WorkspaceGitDiffResult,
  WorkspaceGitDiscardRequest,
  WorkspaceGitFetchRequest,
  WorkspaceGitFileEntry,
  WorkspaceGitFileStatus,
  WorkspaceGitLogRequest,
  WorkspaceGitLogResult,
  WorkspaceGitMutationResult,
  WorkspaceGitPushRequest,
  WorkspaceGitRemoteEntry,
  WorkspaceGitRemoteProvider,
  WorkspaceGitRemoveRemoteRequest,
  WorkspaceGitRenameBranchRequest,
  WorkspaceGitSaveRemoteRequest,
  WorkspaceGitSetUpstreamRequest,
  WorkspaceGitStageRequest,
  WorkspaceGitStatusResult,
  WorkspaceGitTarget
} from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
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

export function isValidRemoteName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('.')) return false
  if (trimmed.includes('..') || hasControlChar(trimmed)) return false
  return /^[A-Za-z0-9._-]+$/.test(trimmed)
}

export function isValidRemoteUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.startsWith('-') || hasControlChar(trimmed)) return false
  if (trimmed.includes('\n') || trimmed.includes('\r')) return false
  const isLocalPath =
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  if (!isLocalPath && /\s/.test(trimmed)) return false
  return true
}

function classifyRemoteHost(
  rawHost: string,
  repoPath: string,
  webOrigin?: string
): {
  host: string
  provider: WorkspaceGitRemoteProvider
  displayLabel: string
  webUrl?: string
} {
  const host = rawHost.toLowerCase()
  const cleanRepoPath = repoPath
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')

  const buildWebUrl = (fallbackScheme: string): string | undefined => {
    if (!cleanRepoPath) return undefined
    if (webOrigin) return `${webOrigin}/${cleanRepoPath}`
    if (!host.includes('.')) return undefined
    return `${fallbackScheme}://${host}/${cleanRepoPath}`
  }

  if (host === 'github.com' || host.endsWith('.github.com')) {
    return {
      host,
      provider: 'github',
      displayLabel: 'GitHub',
      ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
    }
  }
  if (host === 'gitlab.com') {
    return {
      host,
      provider: 'gitlab',
      displayLabel: 'GitLab',
      ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
    }
  }
  if (host === 'gitee.com') {
    return {
      host,
      provider: 'gitee',
      displayLabel: 'Gitee',
      ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
    }
  }
  if (host === 'bitbucket.org') {
    return {
      host,
      provider: 'bitbucket',
      displayLabel: 'Bitbucket',
      ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
    }
  }
  if (host === 'codeberg.org') {
    return {
      host,
      provider: 'codeberg',
      displayLabel: 'Codeberg',
      ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
    }
  }

  return {
    host,
    provider: 'custom',
    displayLabel: host,
    ...(buildWebUrl('https') ? { webUrl: buildWebUrl('https') } : {})
  }
}

export function parseGitRemoteUrl(rawUrl: string): {
  safeUrl: string
  host?: string
  provider: WorkspaceGitRemoteProvider
  displayLabel?: string
  webUrl?: string
  hasCredentials: boolean
} {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return { safeUrl: '', provider: 'custom', hasCredentials: false }
  }

  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    return {
      safeUrl: trimmed,
      provider: 'local',
      displayLabel: 'Local',
      hasCredentials: false
    }
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      const protocol = parsed.protocol.toLowerCase()
      const isUserInfoSensitiveScheme =
        protocol === 'http:' || protocol === 'https:' || protocol === 'ftp:' || protocol === 'ftps:'
      const hasPassword = Boolean(parsed.password)
      const hasCredentials = hasPassword || (isUserInfoSensitiveScheme && Boolean(parsed.username))
      let safeUrl = trimmed
      if (hasCredentials) {
        const sanitized = new URL(trimmed)
        if (isUserInfoSensitiveScheme) {
          sanitized.username = ''
        }
        sanitized.password = ''
        safeUrl = sanitized.toString()
      }
      const host = parsed.hostname
      if (!host) {
        return { safeUrl, provider: 'custom', hasCredentials }
      }
      const webOrigin =
        protocol === 'http:' || protocol === 'https:' ? `${protocol}//${parsed.host}` : undefined
      const meta = classifyRemoteHost(host, parsed.pathname, webOrigin)
      return {
        safeUrl,
        host: meta.host,
        provider: meta.provider,
        displayLabel: meta.displayLabel,
        ...(meta.webUrl ? { webUrl: meta.webUrl } : {}),
        hasCredentials
      }
    } catch {
      return { safeUrl: trimmed, provider: 'custom', hasCredentials: false }
    }
  }

  // SCP-like SSH remote: `[user@]host:path/to/repo.git`
  const scpMatch = /^(?:([^@/\s]+)@)?([^:/\s]+):(.+)$/.exec(trimmed)
  if (scpMatch?.[2] && scpMatch[3]) {
    const rawUser = scpMatch[1] ?? ''
    const colonIdx = rawUser.indexOf(':')
    const hasCredentials = colonIdx >= 0
    const safeUser = hasCredentials ? rawUser.slice(0, colonIdx) : rawUser
    const safeUrl = hasCredentials
      ? `${safeUser ? `${safeUser}@` : ''}${scpMatch[2]}:${scpMatch[3]}`
      : trimmed
    const meta = classifyRemoteHost(scpMatch[2], scpMatch[3])
    return {
      safeUrl,
      host: meta.host,
      provider: meta.provider,
      displayLabel: meta.displayLabel,
      ...(meta.webUrl ? { webUrl: meta.webUrl } : {}),
      hasCredentials
    }
  }

  return { safeUrl: trimmed, provider: 'custom', hasCredentials: false }
}

export function parseRemotesOutput(stdout: string): WorkspaceGitRemoteEntry[] {
  const map = new Map<string, { fetchUrl: string; pushUrl: string }>()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const tabIdx = trimmed.indexOf('\t')
    if (tabIdx <= 0) continue
    const name = trimmed.slice(0, tabIdx).trim()
    const rest = trimmed.slice(tabIdx + 1).trim()
    if (!name || !rest) continue

    // Strip trailing partial-clone filter annotations (e.g. ` (fetch) [blob:none]`).
    const withoutFilter = rest.replace(/\s+\[[^\]]+\]$/, '').trim()
    let url = withoutFilter
    let kind: 'fetch' | 'push' | 'unknown' = 'unknown'
    if (withoutFilter.endsWith(' (fetch)')) {
      url = withoutFilter.slice(0, -' (fetch)'.length).trim()
      kind = 'fetch'
    } else if (withoutFilter.endsWith(' (push)')) {
      url = withoutFilter.slice(0, -' (push)'.length).trim()
      kind = 'push'
    }

    const existing = map.get(name) ?? { fetchUrl: '', pushUrl: '' }
    if (kind === 'fetch' && !existing.fetchUrl) {
      existing.fetchUrl = url
    } else if (kind === 'push' && !existing.pushUrl) {
      existing.pushUrl = url
    } else if (!existing.fetchUrl) {
      existing.fetchUrl = url
    }
    map.set(name, existing)
  }

  const entries: WorkspaceGitRemoteEntry[] = []
  for (const [name, urls] of map.entries()) {
    const rawFetch = urls.fetchUrl || urls.pushUrl
    const rawPush = urls.pushUrl || urls.fetchUrl
    const parsedFetch = parseGitRemoteUrl(rawFetch)
    const parsedPush = parseGitRemoteUrl(rawPush)
    entries.push({
      name,
      fetchUrl: parsedFetch.safeUrl,
      pushUrl: parsedPush.safeUrl,
      ...(parsedFetch.host ? { host: parsedFetch.host } : {}),
      provider: parsedFetch.provider,
      ...(parsedFetch.displayLabel ? { displayLabel: parsedFetch.displayLabel } : {}),
      ...(parsedFetch.webUrl ? { webUrl: parsedFetch.webUrl } : {}),
      ...(parsedFetch.hasCredentials || parsedPush.hasCredentials ? { hasCredentials: true } : {})
    })
  }
  return entries
}

/**
 * Resolve a commit author's avatar URL using standard protocols:
 * - GitHub noreply addresses -> GitHub avatar CDN
 * - Standard emails -> Gravatar SHA-256 (`d=404` so clients fall back cleanly to initials);
 *   pass `{ allowGravatar: false }` to suppress Gravatar lookups explicitly
 */
export function resolveCommitAuthorAvatarUrl(
  email?: string,
  options: { allowGravatar?: boolean } = {}
): string | undefined {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return undefined

  const ghIdMatch = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/.exec(normalized)
  if (ghIdMatch?.[1]) {
    return `https://avatars.githubusercontent.com/u/${ghIdMatch[1]}?s=64`
  }

  const ghUserMatch = /^([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)@users\.noreply\.github\.com$/.exec(
    normalized
  )
  if (ghUserMatch?.[1]) {
    return `https://github.com/${ghUserMatch[1]}.png?size=64`
  }

  if (options.allowGravatar === false) {
    return undefined
  }

  const sha256 = createHash('sha256').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${sha256}?s=64&d=404`
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

function isValidCommitHash(hash: string): boolean {
  return /^[0-9a-f]{4,40}$/i.test(hash.trim())
}

function normalizeGitEmail(raw?: string): string | undefined {
  const clean = raw?.trim().replace(/^<|>$/g, '').trim()
  return clean || undefined
}

interface RecentCommitAuthorNode {
  parents: string[]
  author: string
  email?: string
}

function parseRecentCommitGraph(stdout: string): Map<string, RecentCommitAuthorNode> {
  const graph = new Map<string, RecentCommitAuthorNode>()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [hash, rawParents, author, rawEmail] = line.split('\x1f')
    if (!hash) continue
    const parents = rawParents ? rawParents.split(' ').filter(Boolean) : []
    const email = normalizeGitEmail(rawEmail)
    graph.set(hash, {
      parents,
      author: author?.trim() || '',
      ...(email ? { email } : {})
    })
  }
  return graph
}

function collectBranchAuthors(
  tipOid: string | undefined,
  tipAuthor: string | undefined,
  tipEmail: string | undefined,
  graph: Map<string, RecentCommitAuthorNode>,
  maxAuthors = 3,
  maxCommits = 12
): WorkspaceGitAuthorAvatar[] {
  const authors: WorkspaceGitAuthorAvatar[] = []
  const seenKeys = new Set<string>()

  const pushAuthor = (name?: string, email?: string) => {
    const cleanName = name?.trim() || ''
    const cleanEmail = normalizeGitEmail(email)
    if (!cleanName && !cleanEmail) return
    const dedupKey = (cleanEmail || cleanName).toLowerCase()
    if (seenKeys.has(dedupKey)) return
    seenKeys.add(dedupKey)
    const avatarUrl = resolveCommitAuthorAvatarUrl(cleanEmail)
    authors.push({
      name: cleanName || cleanEmail || 'Unknown',
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(avatarUrl ? { avatarUrl } : {})
    })
  }

  pushAuthor(tipAuthor, tipEmail)

  if (tipOid && graph.size > 0 && authors.length < maxAuthors) {
    const visited = new Set<string>()
    const queue: string[] = [tipOid]
    let walked = 0

    while (queue.length > 0 && authors.length < maxAuthors && walked < maxCommits) {
      const oid = queue.shift()!
      if (visited.has(oid)) continue
      visited.add(oid)
      walked += 1

      const node = graph.get(oid)
      if (!node) continue
      pushAuthor(node.author, node.email)
      if (authors.length >= maxAuthors) break
      for (const parent of node.parents) {
        if (!visited.has(parent) && graph.has(parent)) {
          queue.push(parent)
        }
      }
    }
  }

  return authors
}

function classifyCommitFileStatus(rawCode: string): WorkspaceGitFileStatus {
  const code = rawCode.trim().toUpperCase()
  if (code.startsWith('A')) return 'added'
  if (code.startsWith('D')) return 'deleted'
  if (code.startsWith('R')) return 'renamed'
  if (code.startsWith('C')) return 'copied'
  if (code.startsWith('T')) return 'typechange'
  if (code.startsWith('U')) return 'unmerged'
  return 'modified'
}

export function parseCommitFilesOutput(
  nameStatusStdout: string,
  numstatStdout: string
): WorkspaceGitCommitFileEntry[] {
  const statusMap = new Map<string, { status: WorkspaceGitFileStatus; oldPath?: string }>()
  const statusOrder: string[] = []

  const statusTokens = nameStatusStdout.split('\0')
  for (let i = 0; i < statusTokens.length; i += 1) {
    const rawCode = statusTokens[i]
    if (!rawCode) continue
    const status = classifyCommitFileStatus(rawCode)
    if (status === 'renamed' || status === 'copied') {
      const oldPath = statusTokens[i + 1]
      const newPath = statusTokens[i + 2]
      i += 2
      if (!newPath) continue
      statusMap.set(newPath, { status, ...(oldPath ? { oldPath } : {}) })
      statusOrder.push(newPath)
    } else {
      const filePath = statusTokens[i + 1]
      i += 1
      if (!filePath) continue
      statusMap.set(filePath, { status })
      statusOrder.push(filePath)
    }
  }

  const statMap = new Map<
    string,
    { additions: number; deletions: number; binary: boolean; oldPath?: string }
  >()
  const statTokens = numstatStdout.split('\0')
  for (let i = 0; i < statTokens.length; i += 1) {
    const token = statTokens[i]
    if (!token) continue
    const tab1 = token.indexOf('\t')
    const tab2 = tab1 >= 0 ? token.indexOf('\t', tab1 + 1) : -1
    if (tab1 < 0 || tab2 < 0) continue

    const rawAdd = token.slice(0, tab1)
    const rawDel = token.slice(tab1 + 1, tab2)
    const trailingPath = token.slice(tab2 + 1)
    const binary = rawAdd === '-' || rawDel === '-'
    const additions = binary ? 0 : Math.max(0, Number.parseInt(rawAdd, 10) || 0)
    const deletions = binary ? 0 : Math.max(0, Number.parseInt(rawDel, 10) || 0)

    if (!trailingPath) {
      // Rename/copy under `git show --numstat -z`: `<add>\t<del>\t\0<oldPath>\0<newPath>\0`
      const oldPath = statTokens[i + 1]
      const newPath = statTokens[i + 2]
      i += 2
      if (!newPath) continue
      statMap.set(newPath, { additions, deletions, binary, ...(oldPath ? { oldPath } : {}) })
      if (!statusMap.has(newPath)) statusOrder.push(newPath)
    } else {
      statMap.set(trailingPath, { additions, deletions, binary })
      if (!statusMap.has(trailingPath)) statusOrder.push(trailingPath)
    }
  }

  const files: WorkspaceGitCommitFileEntry[] = []
  const seen = new Set<string>()
  for (const filePath of statusOrder) {
    if (seen.has(filePath)) continue
    seen.add(filePath)
    const statusInfo = statusMap.get(filePath)
    const statInfo = statMap.get(filePath)
    const oldPath = statusInfo?.oldPath ?? statInfo?.oldPath
    files.push({
      path: filePath,
      ...(oldPath && oldPath !== filePath ? { oldPath } : {}),
      status: statusInfo?.status ?? 'modified',
      additions: statInfo?.additions ?? 0,
      deletions: statInfo?.deletions ?? 0,
      binary: statInfo?.binary ?? false
    })
  }
  return files
}

export async function readWorkspaceGitCommitFiles(
  request: WorkspaceGitCommitFilesRequest
): Promise<WorkspaceGitCommitFilesResult> {
  const rawHash = request.hash?.trim() ?? ''
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return {
      hash: rawHash,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      error: ctx.error || 'Not a git repository'
    }
  }

  if (!rawHash || !isValidCommitHash(rawHash)) {
    return {
      hash: rawHash,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      error: 'Invalid commit hash'
    }
  }

  const [nameStatusRes, numstatRes] = await Promise.all([
    runGit(ctx.repoRoot, [
      'show',
      '--first-parent',
      '--root',
      '--format=',
      '--name-status',
      '-M',
      '-z',
      rawHash,
      '--'
    ]),
    runGit(ctx.repoRoot, [
      'show',
      '--first-parent',
      '--root',
      '--format=',
      '--numstat',
      '-M',
      '-z',
      rawHash,
      '--'
    ])
  ])

  if (nameStatusRes.exitCode !== 0) {
    return {
      hash: rawHash,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      error: nameStatusRes.stderr.trim() || 'Failed to read commit files'
    }
  }

  const files = parseCommitFilesOutput(
    nameStatusRes.stdout,
    numstatRes.exitCode === 0 ? numstatRes.stdout : ''
  )
  let totalAdditions = 0
  let totalDeletions = 0
  for (const file of files) {
    totalAdditions += file.additions
    totalDeletions += file.deletions
  }

  return {
    hash: rawHash,
    files,
    totalAdditions,
    totalDeletions
  }
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
  let safeOldPath: string | undefined
  try {
    safePath = assertSafeRepoRelativePath(ctx.repoRoot, request.path)
    if (typeof request.oldPath === 'string' && request.oldPath.length > 0) {
      safeOldPath = assertSafeRepoRelativePath(ctx.repoRoot, request.oldPath)
    }
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

  const commitHash = request.commitHash?.trim()
  if (commitHash) {
    if (!isValidCommitHash(commitHash)) {
      return {
        path: safePath,
        staged: false,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        empty: true,
        error: 'Invalid commit hash'
      }
    }
    const pathArgs = safeOldPath && safeOldPath !== safePath ? [safeOldPath, safePath] : [safePath]
    const res = await runGit(
      ctx.repoRoot,
      [
        'show',
        '--first-parent',
        '--root',
        '--format=',
        '--no-color',
        '-M',
        commitHash,
        '--',
        ...pathArgs
      ],
      LOCAL_GIT_TIMEOUT_MS,
      { literalPathspecs: true }
    )
    if (res.exitCode !== 0) {
      return {
        path: safePath,
        staged: false,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        empty: true,
        error: res.stderr.trim() || 'Failed to read commit file diff'
      }
    }
    const summary = summarizeDiff(res.stdout)
    return {
      path: safePath,
      staged: false,
      ...summary
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

  const [status, refsRes, remotesRes, recentLogRes] = await Promise.all([
    readStatusForRepo(ctx),
    runGit(ctx.repoRoot, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(HEAD)%1f%(refname)%1f%(upstream)%1f%(objectname)%1f%(objectname:short)%1f%(contents:subject)%1f%(authorname)%1f%(authoremail)%1f%(committerdate:relative)',
      'refs/heads',
      'refs/remotes'
    ]),
    runGit(ctx.repoRoot, ['remote', '-v']),
    runGit(ctx.repoRoot, [
      'log',
      '--branches',
      '--remotes',
      '-n',
      '300',
      '--format=%H%x1f%P%x1f%an%x1f%ae'
    ])
  ])

  if (status.error) {
    return {
      current: '',
      detached: false,
      branches: [],
      remotes: [],
      error: status.error
    }
  }

  if (refsRes.exitCode !== 0) {
    return {
      current: status.branch,
      detached: status.detached,
      branches: [],
      remotes: [],
      error: refsRes.stderr.trim() || 'Failed to list branches'
    }
  }

  const remotesLoaded = remotesRes.exitCode === 0
  const remotes = remotesLoaded ? parseRemotesOutput(remotesRes.stdout) : undefined
  const remotesError = remotesLoaded
    ? undefined
    : remotesRes.stderr.trim() || 'Failed to list remotes'
  const sortedRemoteNames = [...(remotes ?? []).map((item) => item.name)].sort(
    (a, b) => b.length - a.length
  )
  const commitGraph =
    recentLogRes.exitCode === 0 ? parseRecentCommitGraph(recentLogRes.stdout) : new Map()

  const localBranches: WorkspaceGitBranchEntry[] = []
  const remoteBranches: WorkspaceGitBranchEntry[] = []

  for (const line of refsRes.stdout.split('\n')) {
    if (!line.trim()) continue
    const [
      headMark,
      fullRef,
      rawUpstream,
      fullOid,
      shortOid,
      subject,
      author,
      rawAuthorEmail,
      relativeDate
    ] = line.split('\x1f')
    if (!fullRef) continue

    let isRemote = false
    let name = ''
    if (fullRef.startsWith('refs/heads/')) {
      name = fullRef.slice('refs/heads/'.length)
    } else if (fullRef.startsWith('refs/remotes/')) {
      if (fullRef.endsWith('/HEAD')) continue
      isRemote = true
      name = fullRef.slice('refs/remotes/'.length)
    } else {
      continue
    }
    if (!name) continue

    const upstream = rawUpstream
      ? rawUpstream.startsWith('refs/remotes/')
        ? rawUpstream.slice('refs/remotes/'.length)
        : rawUpstream.startsWith('refs/heads/')
          ? rawUpstream.slice('refs/heads/'.length)
          : rawUpstream
      : undefined
    const matchedRemoteName = isRemote
      ? sortedRemoteNames.find((remote) => name.startsWith(`${remote}/`))
      : undefined
    const authorEmail = normalizeGitEmail(rawAuthorEmail)
    const authors = collectBranchAuthors(fullOid, author, authorEmail, commitGraph)

    const entry: WorkspaceGitBranchEntry = {
      name,
      fullRef,
      ...(matchedRemoteName ? { remoteName: matchedRemoteName } : {}),
      current: headMark === '*',
      isRemote,
      ...(upstream ? { upstream } : {}),
      ...(shortOid ? { shortOid } : {}),
      ...(subject ? { subject } : {}),
      ...(author ? { author } : {}),
      ...(authorEmail ? { authorEmail } : {}),
      ...(authors.length > 0 ? { authors } : {}),
      ...(relativeDate ? { relativeDate } : {})
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
    branches: [...localBranches, ...remoteBranches],
    ...(remotes ? { remotes } : {}),
    ...(remotesError ? { remotesError } : {})
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
  const ref = request.ref?.trim()
  if (ref && !isValidBranchName(ref)) {
    return {
      commits: [],
      error: 'Invalid branch or ref name'
    }
  }

  const args = [
    'log',
    '-n',
    String(limit),
    '--date=unix',
    '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%ar%x1f%at%x1f%D%x1e'
  ]
  if (ref) {
    args.push(ref)
  }
  args.push('--')

  const res = await runGit(ctx.repoRoot, args)

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
    const [hash, shortHash, subject, author, authorEmail, relativeDate, unixSec, rawRefs] =
      trimmed.split('\x1f')
    if (!hash || !shortHash) continue
    const refs = rawRefs
      ? rawRefs
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
    const cleanEmail = authorEmail?.trim() || undefined
    const avatarUrl = resolveCommitAuthorAvatarUrl(cleanEmail)
    commits.push({
      hash,
      shortHash,
      subject: subject ?? '',
      author: author ?? '',
      ...(cleanEmail ? { authorEmail: cleanEmail } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
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

export async function renameWorkspaceGitBranch(
  request: WorkspaceGitRenameBranchRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const oldName = request.oldName?.trim()
  const newName = request.newName?.trim()
  if (!oldName || !isValidBranchName(oldName) || !newName || !isValidBranchName(newName)) {
    return { ok: false, error: 'Invalid branch name' }
  }
  if (oldName === newName) {
    const status = await readStatusForRepo(ctx)
    return { ok: true, summary: newName, status }
  }

  const exists = await runGit(ctx.repoRoot, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${oldName}`
  ])
  if (exists.exitCode !== 0) {
    return { ok: false, error: `Local branch not found: ${oldName}` }
  }

  const res = await runGit(ctx.repoRoot, ['branch', '-m', '--', oldName, newName])
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to rename branch' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: newName, status }
}

export async function deleteWorkspaceGitBranch(
  request: WorkspaceGitDeleteBranchRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const branch = request.branch?.trim()
  if (!branch || !isValidBranchName(branch)) {
    return { ok: false, error: 'Invalid branch name' }
  }

  const before = await readStatusForRepo(ctx)
  if (before.error) {
    return { ok: false, error: before.error }
  }
  if (!before.detached && before.branch === branch) {
    return { ok: false, error: 'Cannot delete the currently checked-out branch' }
  }

  const exists = await runGit(ctx.repoRoot, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`
  ])
  if (exists.exitCode !== 0) {
    return { ok: false, error: `Local branch not found: ${branch}` }
  }

  const flag = request.force ? '-D' : '-d'
  const res = await runGit(ctx.repoRoot, ['branch', flag, '--', branch])
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to delete branch' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: branch, status }
}

export async function setWorkspaceGitBranchUpstream(
  request: WorkspaceGitSetUpstreamRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const branch = request.branch?.trim()
  if (!branch || !isValidBranchName(branch)) {
    return { ok: false, error: 'Invalid branch name' }
  }

  const localExists = await runGit(ctx.repoRoot, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`
  ])
  if (localExists.exitCode !== 0) {
    return { ok: false, error: `Local branch not found: ${branch}` }
  }

  const upstream = request.upstream?.trim() ?? ''
  if (!upstream) {
    const res = await runGit(ctx.repoRoot, ['branch', '--unset-upstream', '--', branch])
    if (res.exitCode !== 0 && !/no upstream/i.test(res.stderr)) {
      return { ok: false, error: res.stderr.trim() || 'Failed to unset upstream branch' }
    }
    const status = await readStatusForRepo(ctx)
    return { ok: true, summary: branch, status }
  }

  if (!isValidBranchName(upstream)) {
    return { ok: false, error: 'Invalid upstream branch name' }
  }

  const remoteExists = await runGit(ctx.repoRoot, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/remotes/${upstream}`
  ])
  if (remoteExists.exitCode !== 0) {
    return { ok: false, error: `Remote branch not found: ${upstream}` }
  }

  const res = await runGit(ctx.repoRoot, ['branch', '--set-upstream-to', upstream, '--', branch])
  if (res.exitCode !== 0) {
    return { ok: false, error: res.stderr.trim() || 'Failed to update upstream branch' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: upstream, status }
}

export async function saveWorkspaceGitRemote(
  request: WorkspaceGitSaveRemoteRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const name = request.name?.trim()
  const fetchUrl = request.fetchUrl?.trim()
  const rawPushUrl = request.pushUrl?.trim()

  if (!name || !isValidRemoteName(name)) {
    return { ok: false, error: 'Invalid remote name' }
  }
  if (!fetchUrl || !isValidRemoteUrl(fetchUrl)) {
    return { ok: false, error: 'Invalid remote fetch URL' }
  }
  if (rawPushUrl && !isValidRemoteUrl(rawPushUrl)) {
    return { ok: false, error: 'Invalid remote push URL' }
  }

  if (request.mode === 'add') {
    const addRes = await runGit(ctx.repoRoot, ['remote', 'add', '--', name, fetchUrl])
    if (addRes.exitCode !== 0) {
      return { ok: false, error: addRes.stderr.trim() || 'Failed to add remote' }
    }
    if (rawPushUrl && rawPushUrl !== fetchUrl) {
      const pushRes = await runGit(ctx.repoRoot, [
        'remote',
        'set-url',
        '--push',
        '--',
        name,
        rawPushUrl
      ])
      if (pushRes.exitCode !== 0) {
        await runGit(ctx.repoRoot, ['remote', 'remove', '--', name])
        return { ok: false, error: pushRes.stderr.trim() || 'Failed to set remote push URL' }
      }
    }
    const status = await readStatusForRepo(ctx)
    return { ok: true, summary: name, status }
  }

  const originalName = (request.originalName ?? name).trim()
  if (!originalName || !isValidRemoteName(originalName)) {
    return { ok: false, error: 'Invalid original remote name' }
  }

  // Read both raw configured URLs (preserving insteadOf aliases) and resolved URLs before mutating
  // so renaming or unrelated edits do not drop aliases or embedded credentials.
  const [
    existingFetchConfigRes,
    existingFetchGetUrlRes,
    existingPushConfigRes,
    existingPushGetUrlRes
  ] = await Promise.all([
    runGit(ctx.repoRoot, ['config', '--get', `remote.${originalName}.url`]),
    runGit(ctx.repoRoot, ['remote', 'get-url', '--', originalName]),
    runGit(ctx.repoRoot, ['config', '--get-all', `remote.${originalName}.pushurl`]),
    runGit(ctx.repoRoot, ['remote', 'get-url', '--push', '--', originalName])
  ])

  if (existingFetchGetUrlRes.exitCode !== 0 && existingFetchConfigRes.exitCode !== 0) {
    return {
      ok: false,
      error: existingFetchGetUrlRes.stderr.trim() || `Remote not found: ${originalName}`
    }
  }

  const existingFetchRaw =
    existingFetchConfigRes.exitCode === 0 && existingFetchConfigRes.stdout.trim()
      ? existingFetchConfigRes.stdout.trim()
      : existingFetchGetUrlRes.stdout.trim()
  const existingFetchResolved =
    existingFetchGetUrlRes.exitCode === 0 && existingFetchGetUrlRes.stdout.trim()
      ? existingFetchGetUrlRes.stdout.trim()
      : existingFetchRaw

  const existingPushConfiguredValues =
    existingPushConfigRes.exitCode === 0
      ? existingPushConfigRes.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : []
  const existingPushRaw = existingPushConfiguredValues[0] ?? ''
  const existingPushResolved =
    existingPushGetUrlRes.exitCode === 0 && existingPushGetUrlRes.stdout.trim()
      ? existingPushGetUrlRes.stdout.trim()
      : existingPushRaw || existingFetchResolved

  const parsedExistingFetchRaw = parseGitRemoteUrl(existingFetchRaw)
  const parsedExistingFetchResolved = parseGitRemoteUrl(existingFetchResolved)
  const parsedExistingPushRaw = existingPushRaw ? parseGitRemoteUrl(existingPushRaw) : null
  const parsedExistingPushResolved = parseGitRemoteUrl(existingPushResolved)

  let renamed = false
  let fetchUpdated = false
  const rollback = async (): Promise<void> => {
    if (fetchUpdated) {
      await runGit(ctx.repoRoot, ['remote', 'set-url', '--', name, existingFetchRaw])
    }
    if (renamed) {
      await runGit(ctx.repoRoot, ['remote', 'rename', '--', name, originalName])
    }
  }

  if (originalName !== name) {
    const renameRes = await runGit(ctx.repoRoot, ['remote', 'rename', '--', originalName, name])
    if (renameRes.exitCode !== 0) {
      return { ok: false, error: renameRes.stderr.trim() || 'Failed to rename remote' }
    }
    renamed = true
  }

  const fetchUnchanged =
    fetchUrl === existingFetchRaw ||
    fetchUrl === parsedExistingFetchRaw.safeUrl ||
    fetchUrl === existingFetchResolved ||
    fetchUrl === parsedExistingFetchResolved.safeUrl
  if (!fetchUnchanged) {
    const setFetchRes = await runGit(ctx.repoRoot, ['remote', 'set-url', '--', name, fetchUrl])
    if (setFetchRes.exitCode !== 0) {
      await rollback()
      return { ok: false, error: setFetchRes.stderr.trim() || 'Failed to update remote URL' }
    }
    fetchUpdated = true
  }

  if (request.pushUrl !== undefined) {
    if (!rawPushUrl) {
      // Clearing pushUrl removes explicit `remote.<name>.pushurl` overrides so Git inherits fetchUrl,
      // while avoiding accidental removal of a credentialed pushurl whose redacted URL matched fetchUrl.
      const preserveCredentialedPushMatchingFetch =
        Boolean(parsedExistingPushRaw?.hasCredentials) &&
        fetchUnchanged &&
        (parsedExistingPushRaw!.safeUrl === parsedExistingFetchRaw.safeUrl ||
          parsedExistingPushResolved.safeUrl === parsedExistingFetchResolved.safeUrl)
      if (existingPushConfiguredValues.length > 0 && !preserveCredentialedPushMatchingFetch) {
        const unsetRes = await runGit(ctx.repoRoot, [
          'config',
          '--unset-all',
          `remote.${name}.pushurl`
        ])
        if (unsetRes.exitCode !== 0 && unsetRes.exitCode !== 5) {
          await rollback()
          return {
            ok: false,
            error: unsetRes.stderr.trim() || 'Failed to clear remote push URL'
          }
        }
      }
    } else {
      const pushMatchesFetch =
        rawPushUrl === fetchUrl ||
        (fetchUnchanged &&
          (rawPushUrl === existingFetchRaw ||
            rawPushUrl === parsedExistingFetchRaw.safeUrl ||
            rawPushUrl === existingFetchResolved ||
            rawPushUrl === parsedExistingFetchResolved.safeUrl))
      const pushUnchanged =
        Boolean(existingPushRaw) &&
        (rawPushUrl === existingPushRaw ||
          rawPushUrl === parsedExistingPushRaw?.safeUrl ||
          rawPushUrl === existingPushResolved ||
          rawPushUrl === parsedExistingPushResolved.safeUrl)

      if (!(pushMatchesFetch && existingPushConfiguredValues.length === 0) && !pushUnchanged) {
        const setPushRes = await runGit(ctx.repoRoot, [
          'remote',
          'set-url',
          '--push',
          '--',
          name,
          rawPushUrl
        ])
        if (setPushRes.exitCode !== 0) {
          await rollback()
          return {
            ok: false,
            error: setPushRes.stderr.trim() || 'Failed to update remote push URL'
          }
        }
      }
    }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: name, status }
}

export async function removeWorkspaceGitRemote(
  request: WorkspaceGitRemoveRemoteRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const name = request.name?.trim()
  if (!name || !isValidRemoteName(name)) {
    return { ok: false, error: 'Invalid remote name' }
  }

  const res = await runGit(ctx.repoRoot, ['remote', 'remove', '--', name])
  if (res.exitCode !== 0) {
    // Also support cleaning up stale remote-tracking refs (`refs/remotes/<name>/*`) whose
    // remote config entry was already removed from `.git/config`, while protecting any refs
    // owned by another configured remote (e.g. `foo/bar`).
    if (/no such remote/i.test(res.stderr)) {
      const remotesRes = await runGit(ctx.repoRoot, ['remote'])
      if (remotesRes.exitCode !== 0) {
        return { ok: false, error: res.stderr.trim() || 'Failed to remove remote' }
      }
      const configuredRemotes = remotesRes.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      const staleRefsRes = await runGit(ctx.repoRoot, [
        'for-each-ref',
        '--format=%(refname)',
        `refs/remotes/${name}`
      ])
      const prefix = `refs/remotes/${name}/`
      const staleRefs = staleRefsRes.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((ref) => {
          if (!ref.startsWith(prefix)) return false
          return !configuredRemotes.some(
            (configured) =>
              ref === `refs/remotes/${configured}` || ref.startsWith(`refs/remotes/${configured}/`)
          )
        })
      if (staleRefsRes.exitCode === 0 && staleRefs.length > 0) {
        for (const ref of staleRefs) {
          const delRes = await runGit(ctx.repoRoot, ['update-ref', '--no-deref', '-d', ref])
          if (delRes.exitCode !== 0) {
            return { ok: false, error: delRes.stderr.trim() || `Failed to prune ${ref}` }
          }
        }
        const status = await readStatusForRepo(ctx)
        return { ok: true, summary: name, status }
      }
    }
    return { ok: false, error: res.stderr.trim() || 'Failed to remove remote' }
  }

  const status = await readStatusForRepo(ctx)
  return { ok: true, summary: name, status }
}

export async function fetchWorkspaceGit(
  request: WorkspaceGitFetchRequest
): Promise<WorkspaceGitMutationResult> {
  const ctx = await resolveRepoContext(request)
  if (!ctx.ok) {
    return { ok: false, error: ctx.error || 'Not a git repository' }
  }

  const remote = request.remote?.trim()
  if (remote && !isValidRemoteName(remote)) {
    return { ok: false, error: 'Invalid remote name' }
  }

  const args = remote ? ['fetch', '--prune', '--', remote] : ['fetch', '--prune']
  const res = await runGit(ctx.repoRoot, args, REMOTE_GIT_TIMEOUT_MS)
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
