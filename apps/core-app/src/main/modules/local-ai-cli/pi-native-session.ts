import type { FileHandle } from 'node:fs/promises'
import { open, realpath } from 'node:fs/promises'

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
      size: Number(details.size)
    }
  } finally {
    await handle.close()
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

export async function verifyPiSessionAppend(input: {
  capture: PiSessionFileCapture
  capturedHead: string | null
  beforeEntryIds: ReadonlySet<string>
  post: PiEntriesSnapshot
}): Promise<string> {
  const handle = await open(input.capture.path, 'r').catch(() => conflict())
  try {
    const beforeRead = await handle.stat({ bigint: true })
    if (beforeRead.size > BigInt(Number.MAX_SAFE_INTEGER)) conflict()
    const finalSize = Number(beforeRead.size)
    const appendedSize = finalSize - input.capture.size
    if (
      beforeRead.dev !== input.capture.device ||
      beforeRead.ino !== input.capture.inode ||
      appendedSize <= 0 ||
      appendedSize > MAX_PI_APPEND_BYTES
    ) {
      conflict()
    }
    const bytes = await readExact(handle, input.capture.size, appendedSize)
    const afterRead = await handle.stat({ bigint: true })
    if (
      afterRead.size !== beforeRead.size ||
      afterRead.dev !== beforeRead.dev ||
      afterRead.ino !== beforeRead.ino
    ) {
      conflict()
    }

    const appendedEntries = parseAppendedEntries(bytes)
    const appendedIds = new Set<string>()
    for (const entry of appendedEntries) {
      if (appendedIds.has(entry.id)) conflict()
      appendedIds.add(entry.id)
    }

    const newEntries = input.post.entries.filter((entry) => !input.beforeEntryIds.has(entry.id))
    if (newEntries.length === 0 || newEntries.some((entry) => !appendedIds.has(entry.id)))
      conflict()

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
  } finally {
    await handle.close()
  }
}
