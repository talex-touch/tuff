import type { LocalAiCliProviderId } from '@talex-touch/utils/transport/events/local-ai-cli'
import { constants, type Dirent } from 'node:fs'
import { lstat, open, opendir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const MAX_FILES_PER_PROVIDER = 500
const MAX_DIRECTORY_ENTRIES = 2_000
const MAX_DIRECTORIES_PER_PROVIDER = 512
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_PREFIX_BYTES = 512 * 1024
const MAX_TAIL_BYTES = 64 * 1024
const MAX_DEPTH = 3
const UUID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
export interface NativeSessionDiscoveryRoots {
  pi: string
  'oh-my-pi': string
  claude: string
  codex: string
}

export interface DiscoveredNativeSessionCandidate {
  provider: LocalAiCliProviderId
  nativeSessionId: string
  projectRoot: string
  title: string
  expectedHeadId: string | null
  createdAt: number
  updatedAt: number
}

export interface NativeSessionDiscoveryResult {
  candidates: DiscoveredNativeSessionCandidate[]
  skipped: number
  incomplete: boolean
}

interface StableJsonlFile {
  filePath: string
  prefixLines: string[]
  tailLines: string[]
  modifiedAt: number
}

interface ProviderArchive {
  provider: LocalAiCliProviderId
  root: string
  maxDepth: number
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('LOCAL_AI_CLI_DISCOVERY_CANCELLED')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function nestedString(value: unknown, keys: readonly string[]): string | undefined {
  let current = value
  for (const key of keys) {
    const record = asRecord(current)
    if (!record) return undefined
    current = record[key]
  }
  return stringValue(current)
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line))
  } catch {
    return null
  }
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => {
      const block = asRecord(item)
      return (block?.type === 'text' ||
        block?.type === 'input_text' ||
        block?.type === 'output_text') &&
        typeof block.text === 'string'
        ? block.text
        : ''
    })
    .filter(Boolean)
    .join('\n')
}

function boundedTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const firstLine = value
    .split(/\r?\n/u)
    .find((line) => line.trim())
    ?.replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return firstLine ? Array.from(firstLine).slice(0, 120).join('') : fallback
}

function timestampMs(value: unknown, fallback: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function canonicalDirectory(directory: string): Promise<string | null> {
  try {
    const details = await lstat(directory)
    if (!details.isDirectory() || details.isSymbolicLink()) return null
    return await realpath(directory)
  } catch (error) {
    const code =
      error && typeof error === 'object' ? (error as NodeJS.ErrnoException).code : undefined
    if (code === 'ENOENT') return null
    throw error
  }
}

async function readDirectoryBounded(
  directory: string
): Promise<{ entries: Dirent[]; incomplete: boolean }> {
  const handle = await opendir(directory)
  const entries: Dirent[] = []
  try {
    for await (const entry of handle) {
      entries.push(entry)
      if (entries.length > MAX_DIRECTORY_ENTRIES) break
    }
  } finally {
    try {
      await handle.close()
    } catch {
      // `for await` closes a fully consumed Dir; explicit close only covers early budget exit.
    }
  }
  return {
    entries: entries.slice(0, MAX_DIRECTORY_ENTRIES),
    incomplete: entries.length > MAX_DIRECTORY_ENTRIES
  }
}

async function collectJsonlFiles(
  root: string,
  maxDepth: number,
  signal?: AbortSignal,
  fileNameIncludes?: string
): Promise<{ files: string[]; incomplete: boolean }> {
  const files: string[] = []
  const pending = [{ directory: root, depth: 0 }]
  let directories = 0
  let incomplete = false

  while (pending.length > 0 && files.length < MAX_FILES_PER_PROVIDER) {
    assertActive(signal)
    if (directories >= MAX_DIRECTORIES_PER_PROVIDER) {
      incomplete = true
      break
    }
    const current = pending.pop()!
    directories += 1
    let listing: { entries: Dirent[]; incomplete: boolean }
    try {
      listing = await readDirectoryBounded(current.directory)
    } catch {
      incomplete = true
      continue
    }
    incomplete ||= listing.incomplete
    for (const entry of listing.entries) {
      assertActive(signal)
      if (entry.isSymbolicLink()) continue
      const target = path.join(current.directory, entry.name)
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) pending.push({ directory: target, depth: current.depth + 1 })
        continue
      }
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.jsonl') ||
        (fileNameIncludes && !entry.name.includes(fileNameIncludes))
      )
        continue
      files.push(target)
      if (files.length >= MAX_FILES_PER_PROVIDER) {
        incomplete = true
        break
      }
    }
  }
  if (pending.length > 0) incomplete = true
  return { files, incomplete }
}

function completePrefixLines(bytes: Buffer, fullFile: boolean): string[] {
  let length = bytes.length
  if (!fullFile) {
    const newline = bytes.lastIndexOf(0x0a)
    if (newline < 0) return []
    length = newline + 1
  }
  return bytes
    .subarray(0, length)
    .toString('utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim())
}

function completeTailLines(bytes: Buffer, startsAtZero: boolean, fullFile: boolean): string[] {
  let start = 0
  if (!startsAtZero) {
    const newline = bytes.indexOf(0x0a)
    if (newline < 0) return []
    start = newline + 1
  }
  let end = bytes.length
  if (!fullFile && bytes.at(-1) !== 0x0a) {
    const newline = bytes.lastIndexOf(0x0a)
    if (newline < start) return []
    end = newline + 1
  }
  return bytes
    .subarray(start, end)
    .toString('utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim())
}

async function readStableJsonl(
  filePath: string,
  root: string,
  signal?: AbortSignal,
  allowLarge = false
): Promise<StableJsonlFile | null> {
  assertActive(signal)
  let before
  try {
    before = await lstat(filePath)
  } catch {
    return null
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size < 1 ||
    before.size > Number.MAX_SAFE_INTEGER ||
    (!allowLarge && before.size > MAX_FILE_BYTES)
  ) {
    return null
  }
  const canonicalPath = await realpath(filePath).catch(() => '')
  if (!canonicalPath || !isContained(root, canonicalPath)) return null

  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const handle = await open(filePath, constants.O_RDONLY | noFollow).catch(() => null)
  if (!handle) return null
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size
    ) {
      return null
    }
    const prefixLength = Math.min(opened.size, MAX_PREFIX_BYTES)
    const prefix = Buffer.allocUnsafe(prefixLength)
    const prefixRead = await handle.read(prefix, 0, prefixLength, 0)
    const tailStart = Math.max(0, opened.size - MAX_TAIL_BYTES)
    const tail = Buffer.allocUnsafe(opened.size - tailStart)
    const tailRead = await handle.read(tail, 0, tail.length, tailStart)
    assertActive(signal)
    const after = await handle.stat()
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs
    )
      return null
    return {
      filePath: canonicalPath,
      prefixLines: completePrefixLines(
        prefix.subarray(0, prefixRead.bytesRead),
        prefixRead.bytesRead === opened.size
      ),
      tailLines: completeTailLines(
        tail.subarray(0, tailRead.bytesRead),
        tailStart === 0,
        tailStart + tailRead.bytesRead === opened.size
      ),
      modifiedAt: opened.mtimeMs
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

function firstUserText(
  lines: readonly string[],
  provider: LocalAiCliProviderId
): string | undefined {
  for (const line of lines) {
    const record = parseJsonLine(line)
    if (!record) continue
    if (provider === 'codex') {
      const payload = asRecord(record.payload)
      const role = payload?.role ?? record.role
      if (record.type !== 'response_item' || payload?.type !== 'message' || role !== 'user')
        continue
      const text = contentText(payload.content).trim()
      if (
        text &&
        !text.startsWith('<') &&
        !text.startsWith('# AGENTS.md') &&
        !text.startsWith('# Context from my IDE setup') &&
        !text.startsWith('You are Codex')
      ) {
        return text
      }
      continue
    }
    if (provider === 'claude') {
      if (record.type !== 'user' || record.isSidechain === true) continue
      const message = asRecord(record.message)
      const text = contentText(message?.content).trim()
      if (text && !text.startsWith('<')) return text
      continue
    }
    if (record.type !== 'message') continue
    const message = asRecord(record.message)
    if (message?.role !== 'user') continue
    const text = contentText(message.content).trim()
    if (text) return text
  }
  return undefined
}

async function canonicalCandidateRoot(
  value: unknown,
  expectedRoot: string
): Promise<string | null> {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) return null
  try {
    const canonical = await realpath(value)
    const details = await stat(canonical)
    return details.isDirectory() && canonical === expectedRoot ? canonical : null
  } catch {
    return null
  }
}

async function parsePiLikeCandidate(
  provider: 'pi' | 'oh-my-pi',
  file: StableJsonlFile,
  projectRoot: string
): Promise<DiscoveredNativeSessionCandidate | null> {
  let header: Record<string, unknown> | null = null
  for (const line of file.prefixLines) {
    const record = parseJsonLine(line)
    if (record?.type === 'session') {
      header = record
      break
    }
  }
  if (
    !header ||
    header.version !== 3 ||
    typeof header.id !== 'string' ||
    !/^[A-Za-z0-9-]{1,128}$/u.test(header.id)
  ) {
    return null
  }
  const canonicalRoot = await canonicalCandidateRoot(header.cwd, projectRoot)
  if (!canonicalRoot) return null

  let title = stringValue(header.title) ?? stringValue(header.name)
  for (const line of file.prefixLines) {
    const record = parseJsonLine(line)
    if (!record) continue
    if (record.type === 'title' || record.type === 'title_change') {
      title = stringValue(record.title) ?? title
    }
    if (record.type === 'session_info') title = stringValue(record.name) ?? title
  }
  title ??= firstUserText(file.prefixLines, provider)
  const fallback = `${provider === 'pi' ? 'Pi' : 'OMP'} · ${path.basename(projectRoot) || projectRoot}`

  let expectedHeadId: string | null = null
  for (const line of file.tailLines) {
    const record = parseJsonLine(line)
    if (record?.type !== 'session' && typeof record?.id === 'string') expectedHeadId = record.id
  }
  return {
    provider,
    nativeSessionId: header.id,
    projectRoot: canonicalRoot,
    title: boundedTitle(title, fallback),
    expectedHeadId: provider === 'pi' ? expectedHeadId : null,
    createdAt: timestampMs(header.timestamp, file.modifiedAt),
    updatedAt: file.modifiedAt
  }
}

async function parseClaudeCandidate(
  file: StableJsonlFile,
  projectRoot: string
): Promise<DiscoveredNativeSessionCandidate | null> {
  const fileId = UUID_PATTERN.exec(path.basename(file.filePath))?.[1]
  if (!fileId) return null
  let cwd: string | undefined
  let title: string | undefined
  let createdAt = file.modifiedAt
  for (const line of file.prefixLines) {
    const record = parseJsonLine(line)
    if (!record) continue
    const sessionId = stringValue(record.sessionId) ?? stringValue(record.session_id)
    if (sessionId && sessionId !== fileId) return null
    cwd ??= stringValue(record.cwd)
    createdAt = Math.min(createdAt, timestampMs(record.timestamp, file.modifiedAt))
    if (record.type === 'ai-title')
      title = stringValue(record.aiTitle) ?? stringValue(record.title) ?? title
  }
  const canonicalRoot = await canonicalCandidateRoot(cwd, projectRoot)
  if (!canonicalRoot) return null
  title ??= firstUserText(file.prefixLines, 'claude')
  return {
    provider: 'claude',
    nativeSessionId: fileId,
    projectRoot: canonicalRoot,
    title: boundedTitle(title, `Claude · ${path.basename(projectRoot) || projectRoot}`),
    expectedHeadId: null,
    createdAt,
    updatedAt: file.modifiedAt
  }
}

async function parseCodexCandidate(
  file: StableJsonlFile,
  projectRoot: string
): Promise<DiscoveredNativeSessionCandidate | null> {
  let sessionId: string | undefined
  let cwd: string | undefined
  let createdAt = file.modifiedAt
  for (const line of file.prefixLines) {
    const record = parseJsonLine(line)
    if (record?.type !== 'session_meta') continue
    sessionId =
      nestedString(record, ['payload', 'id']) ?? nestedString(record, ['payload', 'session_id'])
    cwd = nestedString(record, ['payload', 'cwd'])
    createdAt = timestampMs(
      nestedString(record, ['payload', 'timestamp']) ?? record.timestamp,
      file.modifiedAt
    )
    break
  }
  if (!sessionId || !/^[A-Za-z0-9-]{1,128}$/u.test(sessionId)) return null
  const fileId = UUID_PATTERN.exec(path.basename(file.filePath))?.[1]
  if (fileId && fileId !== sessionId) return null
  const canonicalRoot = await canonicalCandidateRoot(cwd, projectRoot)
  if (!canonicalRoot) return null
  const title = firstUserText(file.prefixLines, 'codex')
  return {
    provider: 'codex',
    nativeSessionId: sessionId,
    projectRoot: canonicalRoot,
    title: boundedTitle(title, `Codex · ${path.basename(projectRoot) || projectRoot}`),
    expectedHeadId: null,
    createdAt,
    updatedAt: file.modifiedAt
  }
}

export function resolveNativeSessionDiscoveryRoots(
  homeDirectory = homedir(),
  environment: NodeJS.ProcessEnv = process.env
): NativeSessionDiscoveryRoots {
  const piAgentDir = environment.PI_CODING_AGENT_DIR || path.join(homeDirectory, '.pi', 'agent')
  return {
    pi: environment.PI_CODING_AGENT_SESSION_DIR || path.join(piAgentDir, 'sessions'),
    'oh-my-pi': path.join(
      environment.TUFF_OMP_AGENT_DIR || path.join(homeDirectory, '.omp', 'agent'),
      'sessions'
    ),
    claude: path.join(
      environment.CLAUDE_CONFIG_DIR || path.join(homeDirectory, '.claude'),
      'projects'
    ),
    codex: path.join(environment.CODEX_HOME || path.join(homeDirectory, '.codex'), 'sessions')
  }
}
export async function findPiNativeSessionFile(
  nativeSessionId: string,
  sessionRoot = resolveNativeSessionDiscoveryRoots().pi,
  signal?: AbortSignal
): Promise<string | null> {
  if (!/^[A-Za-z0-9-]{1,128}$/u.test(nativeSessionId)) {
    throw new Error('LOCAL_AI_CLI_SESSION_INVALID')
  }
  assertActive(signal)
  let canonicalRoot: string | null
  let collection: { files: string[]; incomplete: boolean }
  try {
    canonicalRoot = await canonicalDirectory(sessionRoot)
    if (!canonicalRoot) return null
    collection = await collectJsonlFiles(canonicalRoot, 1, signal, nativeSessionId)
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCAL_AI_CLI_DISCOVERY_CANCELLED') throw error
    throw new Error('NATIVE_SESSION_MISSING')
  }
  const matches: string[] = []
  for (const filePath of collection.files) {
    if (!path.basename(filePath).includes(nativeSessionId)) continue
    const file = await readStableJsonl(filePath, canonicalRoot, signal, true)
    if (!file) continue
    const header = file.prefixLines.map(parseJsonLine).find((record) => record?.type === 'session')
    if (header?.id === nativeSessionId) matches.push(file.filePath)
  }
  if (matches.length > 1) throw new Error('NATIVE_SESSION_CONFLICT')
  return matches[0] ?? null
}

export async function scanNativeSessionsForProject(
  projectRoot: string,
  options: {
    roots?: NativeSessionDiscoveryRoots
    signal?: AbortSignal
  } = {}
): Promise<NativeSessionDiscoveryResult> {
  assertActive(options.signal)
  const canonicalProjectRoot = await canonicalDirectory(projectRoot)
  if (!canonicalProjectRoot || canonicalProjectRoot !== projectRoot)
    throw new Error('WORKSPACE_INVALID')
  const roots = options.roots ?? resolveNativeSessionDiscoveryRoots()
  const archives: ProviderArchive[] = [
    { provider: 'pi', root: roots.pi, maxDepth: 1 },
    { provider: 'oh-my-pi', root: roots['oh-my-pi'], maxDepth: 1 },
    { provider: 'claude', root: roots.claude, maxDepth: 1 },
    { provider: 'codex', root: roots.codex, maxDepth: MAX_DEPTH }
  ]
  const candidates: DiscoveredNativeSessionCandidate[] = []
  let skipped = 0
  let incomplete = false

  for (const archive of archives) {
    assertActive(options.signal)
    let canonicalRoot: string | null
    try {
      canonicalRoot = await canonicalDirectory(archive.root)
    } catch {
      incomplete = true
      continue
    }
    if (!canonicalRoot) continue
    let collection: { files: string[]; incomplete: boolean }
    try {
      collection = await collectJsonlFiles(canonicalRoot, archive.maxDepth, options.signal)
    } catch (error) {
      if (error instanceof Error && error.message === 'LOCAL_AI_CLI_DISCOVERY_CANCELLED')
        throw error
      incomplete = true
      continue
    }
    incomplete ||= collection.incomplete
    for (const filePath of collection.files) {
      assertActive(options.signal)
      const file = await readStableJsonl(filePath, canonicalRoot, options.signal)
      if (!file) {
        skipped += 1
        continue
      }
      let candidate: DiscoveredNativeSessionCandidate | null
      if (archive.provider === 'pi' || archive.provider === 'oh-my-pi') {
        candidate = await parsePiLikeCandidate(archive.provider, file, canonicalProjectRoot)
      } else if (archive.provider === 'claude') {
        candidate = await parseClaudeCandidate(file, canonicalProjectRoot)
      } else {
        candidate = await parseCodexCandidate(file, canonicalProjectRoot)
      }
      if (candidate) candidates.push(candidate)
      else skipped += 1
    }
  }

  const deduplicated = new Map<string, DiscoveredNativeSessionCandidate>()
  for (const candidate of candidates.sort((left, right) => right.updatedAt - left.updatedAt)) {
    const key = JSON.stringify([
      candidate.provider,
      candidate.projectRoot,
      candidate.nativeSessionId
    ])
    if (deduplicated.has(key)) {
      skipped += 1
      continue
    }
    deduplicated.set(key, candidate)
  }
  return { candidates: [...deduplicated.values()], skipped, incomplete }
}
