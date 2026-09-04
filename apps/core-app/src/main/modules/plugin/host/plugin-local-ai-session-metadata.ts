import { constants, type Dirent, type Stats } from 'node:fs'
import fsp, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { types as utilTypes } from 'node:util'
import { PluginHostCapabilityError } from './plugin-host-capabilities'
import type { PluginAiSessionSourceEntry } from './plugin-ai-sessions-capabilities'

import { hasControlCharacter } from './plugin-host-text-validation'
export interface LocalAiSessionMetadataReaderOptions {
  readonly homeDirectory: string
  readonly now?: () => number
  readonly filesystem?: Partial<LocalAiSessionFilesystem>
}

export interface LocalAiSessionFilesystem {
  lstat(filePath: string): Promise<Stats>
  realpath(filePath: string): Promise<string>
  readdir(directory: string): Promise<Dirent[]>
  open(filePath: string, flags: number): Promise<FileHandle>
}

export interface LocalAiSessionMetadataSnapshot {
  readonly entries: readonly PluginAiSessionSourceEntry[]
  readonly incomplete: boolean
}

export type LocalAiSessionMetadataReader = (
  signal: AbortSignal
) => Promise<LocalAiSessionMetadataSnapshot>

interface CandidateFile {
  readonly platform: 'claude' | 'codex'
  readonly filePath: string
  readonly sourceId: string
  readonly modifiedAt: number
  readonly size: number
}

interface CandidateCollection {
  readonly candidates: CandidateFile[]
  readonly incomplete: boolean
}

interface BoundedDirectoryEntries {
  readonly entries: Dirent[]
  readonly incomplete: boolean
}

interface ScanBudget {
  directories: number
  dirents: number
  stats: number
  pending: number
  exhausted: boolean
}

const MAX_FILES_PER_SOURCE = 500
const MAX_RETURNED_FILES = 500
const MAX_DIRECTORY_ENTRIES = 2_000
const MAX_HEADER_BYTES = 64 * 1024
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_DEPTH = 5
const MAX_SCANNED_DIRECTORIES = 512
const MAX_SCANNED_DIRENTS = 20_000
const MAX_SCANNED_STATS = 2_000
const MAX_PENDING_DIRECTORIES = 2_000
const CACHE_TTL_MS = 10_000
const ACTIVE_WINDOW_MS = 10 * 60_000
const UUID_FILE_PATTERN =
  /(?:^|[-_])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.jsonl)?$/i

const defaultFilesystem: LocalAiSessionFilesystem = Object.freeze({
  lstat: (filePath: string) => fsp.lstat(filePath),
  realpath: (filePath: string) => fsp.realpath(filePath),
  readdir: async (directory: string) => {
    const handle = await fsp.opendir(directory)
    const entries: Dirent[] = []
    try {
      for await (const entry of handle) {
        entries.push(entry)
        if (entries.length > MAX_DIRECTORY_ENTRIES) break
      }
    } finally {
      await handle.close().catch(() => undefined)
    }
    return entries
  },
  open: (filePath: string, flags: number) => fsp.open(filePath, flags)
})

function invalid(): never {
  throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

function safeProjectBasename(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return fallback
  const normalized = value.replace(/[\\/]+$/, '')
  const basename = path.basename(normalized).trim()
  if (
    !basename ||
    Buffer.byteLength(basename, 'utf8') > 96 ||
    basename.includes('/') ||
    basename.includes('\\') ||
    hasControlCharacter(basename)
  ) {
    return fallback
  }
  return basename
}

function readNestedString(record: unknown, keys: readonly string[]): string | undefined {
  let current = record
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return undefined
    current = descriptor.value
  }
  return typeof current === 'string' ? current : undefined
}

async function readProjectMetadata(
  filesystem: LocalAiSessionFilesystem,
  candidate: CandidateFile,
  canonicalRoot: string,
  signal: AbortSignal
): Promise<string> {
  assertActive(signal)
  let handle: FileHandle | undefined
  try {
    const before = await filesystem.lstat(candidate.filePath)
    if (before.isSymbolicLink() || !before.isFile() || before.size > MAX_FILE_BYTES) {
      return candidate.platform === 'claude' ? 'Claude' : 'Codex'
    }
    const canonical = await filesystem.realpath(candidate.filePath)
    const relative = path.relative(canonicalRoot, canonical)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return candidate.platform === 'claude' ? 'Claude' : 'Codex'
    }
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    handle = await filesystem.open(candidate.filePath, constants.O_RDONLY | noFollow)
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      return candidate.platform === 'claude' ? 'Claude' : 'Codex'
    }
    const buffer = Buffer.allocUnsafe(Math.min(MAX_HEADER_BYTES, Math.max(1, opened.size)))
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
    assertActive(signal)
    const newline = buffer.subarray(0, bytesRead).indexOf(0x0a)
    const line = buffer.subarray(0, newline >= 0 ? newline : bytesRead).toString('utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return candidate.platform === 'claude' ? 'Claude' : 'Codex'
    }
    const cwd =
      readNestedString(parsed, ['cwd']) ??
      readNestedString(parsed, ['payload', 'cwd']) ??
      readNestedString(parsed, ['session_meta', 'cwd']) ??
      readNestedString(parsed, ['payload', 'session_meta', 'cwd'])
    return safeProjectBasename(cwd, candidate.platform === 'claude' ? 'Claude' : 'Codex')
  } catch {
    assertActive(signal)
    return candidate.platform === 'claude' ? 'Claude' : 'Codex'
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function consumeStatBudget(budget: ScanBudget): boolean {
  if (budget.stats >= MAX_SCANNED_STATS) {
    budget.exhausted = true
    return false
  }
  budget.stats += 1
  return true
}

async function readDirectoryBounded(
  filesystem: LocalAiSessionFilesystem,
  directory: string,
  budget: ScanBudget
): Promise<BoundedDirectoryEntries> {
  if (budget.directories >= MAX_SCANNED_DIRECTORIES || budget.dirents >= MAX_SCANNED_DIRENTS) {
    budget.exhausted = true
    return Object.freeze({ entries: [], incomplete: true })
  }
  budget.directories += 1
  const entries = await filesystem.readdir(directory)
  const remaining = MAX_SCANNED_DIRENTS - budget.dirents
  const count = Math.min(entries.length, MAX_DIRECTORY_ENTRIES, remaining)
  budget.dirents += count
  if (count < entries.length && remaining <= count) budget.exhausted = true
  return Object.freeze({
    entries: entries.slice(0, count),
    incomplete: count < entries.length
  })
}

async function collectClaudeCandidates(
  filesystem: LocalAiSessionFilesystem,
  canonicalRoot: string,
  signal: AbortSignal,
  budget: ScanBudget
): Promise<CandidateCollection> {
  const candidates: CandidateFile[] = []
  let incomplete = false
  let projectEntries: BoundedDirectoryEntries
  try {
    projectEntries = await readDirectoryBounded(filesystem, canonicalRoot, budget)
    incomplete ||= projectEntries.incomplete
  } catch {
    return Object.freeze({ candidates, incomplete: true })
  }
  for (const projectEntry of projectEntries.entries) {
    if (budget.exhausted) return Object.freeze({ candidates, incomplete: true })
    assertActive(signal)
    if (!projectEntry.isDirectory() || projectEntry.isSymbolicLink()) continue
    const projectDirectory = path.join(canonicalRoot, projectEntry.name)
    let sessionEntries: BoundedDirectoryEntries
    try {
      sessionEntries = await readDirectoryBounded(filesystem, projectDirectory, budget)
      incomplete ||= sessionEntries.incomplete
      if (budget.exhausted) return Object.freeze({ candidates, incomplete: true })
    } catch {
      incomplete = true
      continue
    }
    for (const entry of sessionEntries.entries) {
      if (candidates.length >= MAX_FILES_PER_SOURCE) {
        return Object.freeze({ candidates, incomplete: true })
      }
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.jsonl')) continue
      const match = UUID_FILE_PATTERN.exec(entry.name)
      if (!match) continue
      const filePath = path.join(projectDirectory, entry.name)
      if (!consumeStatBudget(budget)) return Object.freeze({ candidates, incomplete: true })
      try {
        const stats = await filesystem.lstat(filePath)
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_FILE_BYTES) continue
        candidates.push({
          platform: 'claude',
          filePath,
          sourceId: match[1]!,
          modifiedAt: stats.mtimeMs,
          size: stats.size
        })
      } catch {
        // A concurrently removed session is not an index failure.
      }
    }
  }
  return Object.freeze({ candidates, incomplete })
}

async function collectCodexCandidates(
  filesystem: LocalAiSessionFilesystem,
  canonicalRoot: string,
  signal: AbortSignal,
  budget: ScanBudget
): Promise<CandidateCollection> {
  const candidates: CandidateFile[] = []
  const pending: Array<{ directory: string; depth: number }> = [
    { directory: canonicalRoot, depth: 0 }
  ]
  budget.pending += 1
  let incomplete = false
  while (pending.length > 0 && candidates.length < MAX_FILES_PER_SOURCE) {
    if (budget.exhausted) {
      incomplete = true
      break
    }
    assertActive(signal)
    const current = pending.pop()!
    let bounded: BoundedDirectoryEntries
    try {
      bounded = await readDirectoryBounded(filesystem, current.directory, budget)
      incomplete ||= bounded.incomplete
      if (budget.exhausted) break
    } catch {
      incomplete = true
      continue
    }
    for (const entry of bounded.entries) {
      if (entry.isSymbolicLink()) continue
      const target = path.join(current.directory, entry.name)
      if (entry.isDirectory()) {
        if (current.depth < MAX_DEPTH && budget.pending < MAX_PENDING_DIRECTORIES) {
          pending.push({ directory: target, depth: current.depth + 1 })
          budget.pending += 1
        } else {
          incomplete = true
          if (budget.pending >= MAX_PENDING_DIRECTORIES) budget.exhausted = true
        }
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const match = UUID_FILE_PATTERN.exec(entry.name)
      if (!match) continue
      if (!consumeStatBudget(budget)) {
        incomplete = true
        break
      }
      try {
        const stats = await filesystem.lstat(target)
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_FILE_BYTES) continue
        candidates.push({
          platform: 'codex',
          filePath: target,
          sourceId: match[1]!,
          modifiedAt: stats.mtimeMs,
          size: stats.size
        })
      } catch {
        // A concurrently removed session is not an index failure.
      }
      if (candidates.length >= MAX_FILES_PER_SOURCE) {
        incomplete = true
        break
      }
    }
  }
  if (pending.length > 0) incomplete = true
  return Object.freeze({ candidates, incomplete })
}

function canonicalDirectory(
  filesystem: LocalAiSessionFilesystem,
  directory: string
): Promise<string | null> {
  return (async () => {
    try {
      const stats = await filesystem.lstat(directory)
      if (!stats.isDirectory() || stats.isSymbolicLink()) return null
      return await filesystem.realpath(directory)
    } catch (error) {
      const code =
        error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
      if (code === 'ENOENT') return null
      throw new Error('index-unavailable')
    }
  })()
}

function isContainedDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function createLocalAiSessionMetadataReader(
  rawOptions: LocalAiSessionMetadataReaderOptions
): LocalAiSessionMetadataReader {
  if (
    !rawOptions ||
    typeof rawOptions !== 'object' ||
    utilTypes.isProxy(rawOptions) ||
    typeof rawOptions.homeDirectory !== 'string' ||
    !path.isAbsolute(rawOptions.homeDirectory) ||
    rawOptions.homeDirectory.includes('\0') ||
    (rawOptions.now !== undefined && typeof rawOptions.now !== 'function')
  ) {
    invalid()
  }
  const filesystem = Object.freeze({ ...defaultFilesystem, ...(rawOptions.filesystem ?? {}) })
  const now = rawOptions.now ?? Date.now
  let cache: {
    readonly expiresAt: number
    readonly snapshot: LocalAiSessionMetadataSnapshot
  } | null = null

  return async (signal) => {
    assertActive(signal)
    const timestamp = now()
    if (cache && cache.expiresAt > timestamp) return cache.snapshot
    const canonicalHome = await canonicalDirectory(filesystem, rawOptions.homeDirectory)
    if (!canonicalHome) {
      return Object.freeze({ entries: Object.freeze([]), incomplete: false })
    }
    const claudeRootCandidate = await canonicalDirectory(
      filesystem,
      path.join(canonicalHome, '.claude', 'projects')
    )
    const codexRootCandidate = await canonicalDirectory(
      filesystem,
      path.join(canonicalHome, '.codex', 'sessions')
    )
    const claudeRoot =
      claudeRootCandidate && isContainedDirectory(canonicalHome, claudeRootCandidate)
        ? claudeRootCandidate
        : null
    const codexRoot =
      codexRootCandidate && isContainedDirectory(canonicalHome, codexRootCandidate)
        ? codexRootCandidate
        : null
    const budget: ScanBudget = {
      directories: 0,
      dirents: 0,
      stats: 0,
      pending: 0,
      exhausted: false
    }
    const emptyCollection = (): CandidateCollection =>
      Object.freeze({ candidates: [], incomplete: false })
    const [claude, codex] = await Promise.all([
      claudeRoot
        ? collectClaudeCandidates(filesystem, claudeRoot, signal, budget)
        : Promise.resolve(emptyCollection()),
      codexRoot
        ? collectCodexCandidates(filesystem, codexRoot, signal, budget)
        : Promise.resolve(emptyCollection())
    ])
    assertActive(signal)
    const seen = new Set<string>()
    const ordered: CandidateFile[] = []
    for (const candidate of [...claude.candidates, ...codex.candidates].sort(
      (left, right) => right.modifiedAt - left.modifiedAt
    )) {
      const key = `${candidate.platform}\0${candidate.sourceId}`
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push(candidate)
    }
    const incomplete = claude.incomplete || codex.incomplete || ordered.length > MAX_RETURNED_FILES
    const candidates = ordered.slice(0, MAX_RETURNED_FILES)
    const entries: PluginAiSessionSourceEntry[] = []
    for (const candidate of candidates) {
      assertActive(signal)
      const root = candidate.platform === 'claude' ? claudeRoot : codexRoot
      if (!root) continue
      const project = await readProjectMetadata(filesystem, candidate, root, signal)
      entries.push(
        Object.freeze({
          platform: candidate.platform,
          project,
          updatedAt: new Date(candidate.modifiedAt).toISOString(),
          state: timestamp - candidate.modifiedAt <= ACTIVE_WINDOW_MS ? 'active' : 'completed',
          turnCount: null,
          sourceId: candidate.sourceId
        })
      )
    }
    assertActive(signal)
    const snapshot = Object.freeze({
      entries: Object.freeze(entries),
      incomplete
    })
    cache = Object.freeze({ expiresAt: timestamp + CACHE_TTL_MS, snapshot })
    return snapshot
  }
}
