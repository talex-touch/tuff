import type { StoredLocalAiCliSession } from './session-store'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, open, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { PI_SESSION_PROTOCOL_VERSION } from '../ai/providers/pi-cli-runtime'
import { findPiNativeSessionFile } from './native-session-discovery'
import { nativeSessionLeaseRegistry } from './native-session-lease'
import { capturePiSessionFile, readPiSessionFileHead } from './pi-native-session'

const MAX_NATIVE_FORK_BYTES = 64 * 1024 * 1024
const MAX_NATIVE_ENTRIES = 100_000
const headerSchema = z
  .object({
    type: z.literal('session'),
    version: z.literal(PI_SESSION_PROTOCOL_VERSION),
    id: z.string().min(1),
    cwd: z.string().min(1)
  })
  .passthrough()
const entrySchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
    parentId: z.string().min(1).nullable()
  })
  .passthrough()

interface StableNativeSnapshot {
  bytes: Buffer
  device: bigint
  inode: bigint
  size: bigint
  modified: bigint
  changed: bigint
  digest: string
  lines: string[]
  header: z.infer<typeof headerSchema>
  entries: Array<z.infer<typeof entrySchema>>
}

export interface PreparedPiNativeFork {
  nativeSessionId: string
  expectedHeadId: string | null
  /** The private canonical file path is never returned by the public workspace SDK. */
  sessionFile: string
  verifySource: () => Promise<void>
  cleanup: () => Promise<void>
  release: () => void
}

function unsafe(): never {
  throw new Error('WORKSPACE_FORK_NATIVE_UNSAFE')
}

async function readStableSnapshot(
  file: string,
  sessionId: string,
  root: string
): Promise<StableNativeSnapshot> {
  const canonical = await realpath(file)
  if (canonical !== file) unsafe()
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || before.size < 1n || before.size > BigInt(MAX_NATIVE_FORK_BYTES))
      unsafe()
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      bytes.length !== Number(before.size)
    )
      unsafe()
    if (bytes.at(-1) !== 0x0a) unsafe()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const lines = text.slice(0, -1).split('\n')
    if (
      !lines.length ||
      lines.length > MAX_NATIVE_ENTRIES + 1 ||
      lines.some((line) => !line.trim())
    )
      unsafe()
    const header = headerSchema.parse(JSON.parse(lines[0]!))
    if (header.id !== sessionId || (await realpath(header.cwd)) !== root) unsafe()
    const entries: StableNativeSnapshot['entries'] = []
    const ids = new Set<string>()
    for (const line of lines.slice(1)) {
      const entry = entrySchema.parse(JSON.parse(line))
      if (
        entry.type === 'session' ||
        ids.has(entry.id) ||
        (entry.parentId !== null && !ids.has(entry.parentId))
      )
        unsafe()
      if (
        entry.firstKeptEntryId !== undefined &&
        (typeof entry.firstKeptEntryId !== 'string' || !ids.has(entry.firstKeptEntryId))
      )
        unsafe()
      if (
        entry.type === 'message' &&
        entry.message &&
        typeof entry.message === 'object' &&
        'role' in entry.message &&
        entry.message.role === 'assistant' &&
        'stopReason' in entry.message &&
        entry.message.stopReason === 'pending'
      )
        unsafe()
      ids.add(entry.id)
      entries.push(entry)
    }
    return {
      bytes,
      device: before.dev,
      inode: before.ino,
      size: before.size,
      modified: before.mtimeNs,
      changed: before.ctimeNs,
      digest: createHash('sha256').update(bytes).digest('hex'),
      lines,
      header,
      entries
    }
  } finally {
    await handle.close()
  }
}

async function verifySnapshot(file: string, snapshot: StableNativeSnapshot): Promise<void> {
  if ((await realpath(file)) !== file) unsafe()
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.dev !== snapshot.device ||
      before.ino !== snapshot.inode ||
      before.size !== snapshot.size ||
      before.mtimeNs !== snapshot.modified ||
      before.ctimeNs !== snapshot.changed
    )
      unsafe()
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let position = 0
    while (position < Number(snapshot.size)) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, Number(snapshot.size) - position),
        position
      )
      if (!bytesRead) unsafe()
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const after = await handle.stat({ bigint: true })
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      hash.digest('hex') !== snapshot.digest
    )
      unsafe()
  } finally {
    await handle.close()
  }
}

/** A static source-specific data operation: no CLI, model, extension or alternate Provider auth. */
export async function preparePiNativeFork(
  pointer: StoredLocalAiCliSession,
  canonicalRoot: string,
  nativeAnchor?: string
): Promise<PreparedPiNativeFork> {
  if (
    pointer.provider !== 'pi' ||
    pointer.state !== 'available' ||
    pointer.projectRoot !== canonicalRoot
  )
    unsafe()
  let release: (() => void) | undefined
  let temporary: string | undefined
  let published: string | undefined
  try {
    release = nativeSessionLeaseRegistry.acquire({
      provider: pointer.provider,
      projectRoot: canonicalRoot,
      nativeSessionId: pointer.nativeSessionId
    })
    const file = await findPiNativeSessionFile(pointer.nativeSessionId)
    if (!file) unsafe()
    const capture = await capturePiSessionFile(file, pointer.nativeSessionId, canonicalRoot)
    if ((await readPiSessionFileHead(capture)) !== pointer.expectedHeadId) unsafe()
    const snapshot = await readStableSnapshot(capture.path, pointer.nativeSessionId, canonicalRoot)
    const sourceHead = snapshot.entries.at(-1)?.id ?? null
    if (sourceHead !== pointer.expectedHeadId) unsafe()
    let through = snapshot.entries.length
    if (nativeAnchor) {
      const index = snapshot.entries.findIndex((entry) => entry.id === nativeAnchor)
      const entry = snapshot.entries[index]
      if (
        index < 0 ||
        entry?.type !== 'message' ||
        !entry.message ||
        typeof entry.message !== 'object' ||
        !('role' in entry.message) ||
        entry.message.role !== 'assistant' ||
        !('stopReason' in entry.message) ||
        !['stop', 'length', 'toolUse'].includes(String(entry.message.stopReason))
      )
        unsafe()
      through = index + 1
    }
    const nativeSessionId = randomUUID()
    const childHeader = {
      ...snapshot.header,
      id: nativeSessionId,
      timestamp: new Date().toISOString(),
      parentSession: capture.path
    }
    // V3 entry ids are scoped to their session file. Keeping them preserves all
    // unknown legal reference fields without guessing and rewriting user content.
    const contents =
      JSON.stringify(childHeader) +
      '\n' +
      snapshot.lines.slice(1, through + 1).join('\n') +
      (through ? '\n' : '')
    const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}_${nativeSessionId}.jsonl`
    const target = path.join(path.dirname(capture.path), filename)
    temporary = target + `.tmp-${randomUUID()}`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await verifySnapshot(capture.path, snapshot)
    // Hard-link publication is complete and no-overwrite; never rename over an
    // existing user's session. Failure is closed on filesystems without this primitive.
    await link(temporary, target)
    published = target
    await unlink(temporary)
    temporary = undefined
    const child = await readStableSnapshot(target, nativeSessionId, canonicalRoot)
    const expectedHeadId = child.entries.at(-1)?.id ?? null
    if (expectedHeadId !== (snapshot.entries[through - 1]?.id ?? null)) unsafe()
    await verifySnapshot(capture.path, snapshot)
    let owned = true
    return {
      nativeSessionId,
      expectedHeadId,
      sessionFile: target,
      verifySource: () => verifySnapshot(capture.path, snapshot),
      cleanup: async () => {
        if (owned) {
          await unlink(target)
          owned = false
        }
      },
      release
    }
  } catch (error) {
    if (temporary) await unlink(temporary).catch(() => undefined)
    if (published) await unlink(published).catch(() => undefined)
    release?.()
    if (error instanceof Error && error.message === 'NATIVE_SESSION_BUSY')
      throw new Error('WORKSPACE_FORK_BUSY')
    throw new Error('WORKSPACE_FORK_NATIVE_UNSAFE')
  }
}
