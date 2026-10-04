import type { FileHandle } from 'node:fs/promises'
import { lstat, open, realpath } from 'node:fs/promises'

const MAX_PI_APPEND_BYTES = 1_048_576
const MAX_PI_HEADER_BYTES = 65_536

export interface PiSessionEntry {
  type: string
  id: string
  parentId: string | null
  message?: { role?: unknown }
}

export interface PiEntriesSnapshot {
  entries: PiSessionEntry[]
  leafId: string | null
}

export interface PiSessionFileCapture {
  path: string
  device: bigint
  inode: bigint
  size: number
  /** Bytes taken by the `session` header line, its newline included. */
  headerSize: number
}

function conflict(): never {
  throw new Error('NATIVE_SESSION_CONFLICT')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function parsePiStateResponse(
  value: unknown
): { sessionId: string; sessionFile: string } | null {
  const response = asRecord(value)
  const data = asRecord(response?.data)
  if (
    response?.type !== 'response' ||
    response.command !== 'get_state' ||
    response.success !== true ||
    typeof data?.sessionId !== 'string' ||
    typeof data.sessionFile !== 'string'
  ) {
    return null
  }
  return { sessionId: data.sessionId, sessionFile: data.sessionFile }
}

export function parsePiEntriesResponse(value: unknown): PiEntriesSnapshot | null {
  const response = asRecord(value)
  const data = asRecord(response?.data)
  if (
    response?.type !== 'response' ||
    response.command !== 'get_entries' ||
    response.success !== true ||
    !Array.isArray(data?.entries) ||
    (data.leafId !== null && typeof data.leafId !== 'string')
  ) {
    return null
  }
  const entries: PiSessionEntry[] = []
  for (const candidate of data.entries) {
    const entry = asRecord(candidate)
    if (
      !entry ||
      typeof entry.type !== 'string' ||
      typeof entry.id !== 'string' ||
      (entry.parentId !== null && typeof entry.parentId !== 'string')
    ) {
      return null
    }
    const message = asRecord(entry.message)
    entries.push({
      type: entry.type,
      id: entry.id,
      parentId: entry.parentId,
      ...(message ? { message } : {})
    })
  }
  return { entries, leafId: data.leafId as string | null }
}

async function readExact(handle: FileHandle, position: number, length: number) {
  const bytes = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const result = await handle.read(bytes, offset, length - offset, position + offset)
    if (result.bytesRead <= 0) conflict()
    offset += result.bytesRead
  }
  return bytes
}

export async function capturePiSessionFile(
  sessionFile: string,
  nativeSessionId: string,
  projectRoot: string
): Promise<PiSessionFileCapture> {
  const canonicalPath = await realpath(sessionFile).catch(() => conflict())
  const handle = await open(canonicalPath, 'r').catch(() => conflict())
  try {
    const details = await handle.stat({ bigint: true })
    if (!details.isFile() || details.size < 1n || details.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      conflict()
    }
    const headerLength = Number(
      details.size < BigInt(MAX_PI_HEADER_BYTES) ? details.size : BigInt(MAX_PI_HEADER_BYTES)
    )
    const headerBytes = await readExact(handle, 0, headerLength)
    const newline = headerBytes.indexOf(0x0a)
    if (newline < 1) conflict()
    let header: Record<string, unknown>
    try {
      const parsed = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(headerBytes.subarray(0, newline))
      )
      const record = asRecord(parsed)
      if (!record) conflict()
      header = record
    } catch {
      conflict()
    }
    if (
      header.type !== 'session' ||
      header.id !== nativeSessionId ||
      typeof header.cwd !== 'string'
    ) {
      conflict()
    }
    const headerRoot = await realpath(header.cwd).catch(() => conflict())
    if (headerRoot !== projectRoot) conflict()
    return {
      path: canonicalPath,
      device: details.dev,
      inode: details.ino,
      size: Number(details.size),
      headerSize: newline + 1
    }
  } finally {
    await handle.close()
  }
}

/**
 * Whether pi has yet to write a session file. pi (0.84.3) keeps a new session in memory and writes
 * the whole file with its first assistant reply, so before a new session's first prompt there is
 * nothing on disk. Only a plain absence counts: anything else at the path is captured, and refused,
 * as it is.
 */
export async function isPiSessionFileUnwritten(sessionFile: string): Promise<boolean> {
  try {
    await lstat(sessionFile)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
  }
}

function parseAppendedEntries(bytes: Buffer): PiSessionEntry[] {
  if (bytes.at(-1) !== 0x0a) conflict()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    conflict()
  }
  const entries: PiSessionEntry[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      conflict()
    }
    const entry = asRecord(value)
    if (
      !entry ||
      entry.type === 'session' ||
      typeof entry.type !== 'string' ||
      typeof entry.id !== 'string' ||
      (entry.parentId !== null && typeof entry.parentId !== 'string')
    ) {
      conflict()
    }
    const message = asRecord(entry.message)
    entries.push({
      type: entry.type,
      id: entry.id,
      parentId: entry.parentId,
      ...(message ? { message } : {})
    })
  }
  return entries
}

async function readAppendedEntries(capture: PiSessionFileCapture): Promise<PiSessionEntry[]> {
  const handle = await open(capture.path, 'r').catch(() => conflict())
  try {
    const beforeRead = await handle.stat({ bigint: true })
    if (beforeRead.size > BigInt(Number.MAX_SAFE_INTEGER)) conflict()
    const appendedSize = Number(beforeRead.size) - capture.size
    if (
      beforeRead.dev !== capture.device ||
      beforeRead.ino !== capture.inode ||
      appendedSize <= 0 ||
      appendedSize > MAX_PI_APPEND_BYTES
    ) {
      conflict()
    }
    const bytes = await readExact(handle, capture.size, appendedSize)
    const afterRead = await handle.stat({ bigint: true })
    if (
      afterRead.size !== beforeRead.size ||
      afterRead.dev !== beforeRead.dev ||
      afterRead.ino !== beforeRead.ino
    ) {
      conflict()
    }
    return parseAppendedEntries(bytes)
  } finally {
    await handle.close()
  }
}

export async function readPiSessionFileHead(capture: PiSessionFileCapture): Promise<string | null> {
  const handle = await open(capture.path, 'r').catch(() => conflict())
  try {
    const beforeRead = await handle.stat({ bigint: true })
    if (
      beforeRead.dev !== capture.device ||
      beforeRead.ino !== capture.inode ||
      beforeRead.size !== BigInt(capture.size)
    ) {
      conflict()
    }
    const length = Math.min(capture.size, MAX_PI_APPEND_BYTES)
    const start = capture.size - length
    const bytes = await readExact(handle, start, length)
    const afterRead = await handle.stat({ bigint: true })
    if (
      afterRead.size !== beforeRead.size ||
      afterRead.dev !== beforeRead.dev ||
      afterRead.ino !== beforeRead.ino ||
      bytes.at(-1) !== 0x0a
    ) {
      conflict()
    }
    let from = 0
    if (start > 0) {
      const newline = bytes.indexOf(0x0a)
      if (newline < 0) conflict()
      from = newline + 1
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(from))
    } catch {
      conflict()
    }
    let head: string | null = null
    for (const line of text.split('\n')) {
      if (!line) continue
      let record: Record<string, unknown> | null
      try {
        record = asRecord(JSON.parse(line))
      } catch {
        conflict()
      }
      if (!record || (record.type !== 'session' && typeof record.id !== 'string')) conflict()
      if (record.type !== 'session') head = record.id as string
    }
    return head
  } finally {
    await handle.close()
  }
}

export async function verifyPiLinearFileAppend(input: {
  capture: PiSessionFileCapture
  capturedHead: string | null
}): Promise<string> {
  const entries = await readAppendedEntries(input.capture)
  let parentId = input.capturedHead
  let userMessages = 0
  let assistantMessages = 0
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id) || entry.parentId !== parentId) conflict()
    seen.add(entry.id)
    parentId = entry.id
    if (entry.type === 'message' && entry.message?.role === 'user') userMessages += 1
    if (entry.type === 'message' && entry.message?.role === 'assistant') assistantMessages += 1
  }
  if (!parentId || userMessages !== 1 || assistantMessages < 1) conflict()
  return parentId
}

export async function verifyPiSessionAppend(input: {
  capture: PiSessionFileCapture
  capturedHead: string | null
  beforeEntryIds: ReadonlySet<string>
  post: PiEntriesSnapshot
}): Promise<string> {
  const appendedEntries = await readAppendedEntries(input.capture)
  const appendedIds = new Set<string>()
  for (const entry of appendedEntries) {
    if (appendedIds.has(entry.id)) conflict()
    appendedIds.add(entry.id)
  }

  const newEntries = input.post.entries.filter((entry) => !input.beforeEntryIds.has(entry.id))
  if (newEntries.length === 0 || newEntries.some((entry) => !appendedIds.has(entry.id))) conflict()

  const directMessageChildren = newEntries.filter(
    (entry) => entry.type === 'message' && entry.parentId === input.capturedHead
  )
  if (directMessageChildren.length !== 1) conflict()
  const userEntry = directMessageChildren[0]!
  if (userEntry.message?.role !== 'user') conflict()

  const assistantEntries = newEntries.filter(
    (entry) =>
      entry.type === 'message' &&
      entry.message?.role === 'assistant' &&
      entry.parentId === userEntry.id
  )
  if (assistantEntries.length !== 1) conflict()
  if (!input.post.leafId || !appendedIds.has(input.post.leafId)) conflict()
  return input.post.leafId
}

/**
 * Verifies the file of a new session that pi wrote during this run. There was nothing to capture
 * before the prompt — pi (0.84.3) writes a new session's file whole with its first assistant reply
 * — so the file is checked from its header on: it must be this session's, in this workspace, and
 * every entry after the header accounted for. First come the entries `get_entries` reported before
 * the prompt, in that order; then this run's, one parent chain on from that captured head, opening
 * with the one user message and holding at least one assistant reply; the last of them is the head
 * `get_entries` reports now, and those are exactly the entries it reports as new.
 */
export async function verifyPiSessionFirstWrite(input: {
  sessionFile: string
  nativeSessionId: string
  projectRoot: string
  before: PiEntriesSnapshot
  post: PiEntriesSnapshot
}): Promise<string> {
  const file = await capturePiSessionFile(
    input.sessionFile,
    input.nativeSessionId,
    input.projectRoot
  )
  const entries = await readAppendedEntries({ ...file, size: file.headerSize })
  const before = input.before.entries
  const seen = new Set<string>()
  let parentId: string | null = null
  for (const [index, entry] of entries.entries()) {
    const reported = before[index]
    if (
      seen.has(entry.id) ||
      entry.parentId !== parentId ||
      (reported && (reported.id !== entry.id || reported.type !== entry.type))
    ) {
      conflict()
    }
    seen.add(entry.id)
    parentId = entry.id
  }
  const capturedHead = before.at(-1)?.id ?? null
  if (input.before.leafId !== capturedHead) conflict()

  const run = entries.slice(before.length)
  const userEntry = run[0]
  if (userEntry?.type !== 'message' || userEntry.message?.role !== 'user') conflict()
  let userMessages = 0
  let assistantMessages = 0
  for (const entry of run) {
    if (entry.type === 'message' && entry.message?.role === 'user') userMessages += 1
    if (entry.type === 'message' && entry.message?.role === 'assistant') assistantMessages += 1
  }
  if (userMessages !== 1 || assistantMessages < 1) conflict()

  const head = run.at(-1)!.id
  const beforeIds = new Set(before.map((entry) => entry.id))
  const reportedNew = input.post.entries.filter((entry) => !beforeIds.has(entry.id))
  if (
    input.post.leafId !== head ||
    reportedNew.length !== run.length ||
    reportedNew.some((entry, index) => entry.id !== run[index]!.id)
  ) {
    conflict()
  }
  return head
}
