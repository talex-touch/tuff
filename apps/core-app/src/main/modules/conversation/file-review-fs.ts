/**
 * Filesystem primitives for conversation file review.
 *
 * Everything here works on canonical absolute paths that the review service has already confined
 * to a project root. Reads are bounded (16 MiB snapshot, 512 KiB preview), hashes stream, and every
 * read checks that the file it read is the file still at the path (`dev`/`ino`/`size`/`mtime`).
 */

import type { FileReviewReason } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { ReviewPreviewSide } from '@talex-touch/pi-desktop-reuse/review'
import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  decodeReviewText,
  REVIEW_MAX_DIFF_BYTES,
  REVIEW_MAX_SNAPSHOT_BYTES
} from '@talex-touch/pi-desktop-reuse/review'
import { containsCredentialLikeText } from '../ai/sensitive-text'

/** Serializes Main's own mutations per canonical path, across every conversation and rollback. */
export class PathLockRegistry {
  private readonly tails = new Map<string, Promise<void>>()

  /** Acquire every key in sorted order (no lock-order inversion), run, then release all. */
  async withLocks<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const sorted = Array.from(new Set(keys)).sort()
    const releases: Array<() => void> = []
    try {
      for (const key of sorted) releases.push(await this.acquire(key))
      return await task()
    } finally {
      for (const release of releases.reverse()) release()
    }
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const { promise: current, resolve: release } = Promise.withResolvers<void>()
    const tail = previous.then(() => current)
    this.tails.set(key, tail)
    await previous
    return () => {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}

/** The legacy (unreviewed) file tool path rule: absolute as given, else against cwd. */
export function resolveToolPath(filePath: string, workingDirectory?: string): string {
  if (path.isAbsolute(filePath)) return filePath
  return path.resolve(workingDirectory || process.cwd(), filePath)
}

export type ConfinementResult = 'ok' | 'outside' | 'symlink' | 'not_file'

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Project-relative path with `/` separators, or null when `absolute` is not strictly inside. */
export function relativeInside(root: string, absolute: string): string | null {
  const relative = path.relative(root, absolute)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null
  }
  return relative.split(path.sep).join('/')
}

/** Rebuild a stored project-relative path; rejects any traversal or absolute segment. */
export function joinStoredRelative(root: string, relative: string): string | null {
  const parts = relative.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\')))
    return null
  const absolute = path.join(root, ...parts)
  return relativeInside(root, absolute) === relative ? absolute : null
}

/**
 * Root must still be its own canonical directory; every existing component under it must be a
 * real directory (no symlink), and an existing leaf must be a regular file.
 */
export async function checkConfinement(root: string, absolute: string): Promise<ConfinementResult> {
  try {
    const rootStat = await fs.lstat(root)
    if (!rootStat.isDirectory() || (await fs.realpath(root)) !== root) return 'symlink'
  } catch {
    return 'outside'
  }
  const relative = relativeInside(root, absolute)
  if (relative === null) return 'outside'
  const parts = relative.split('/')
  let current = root
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]!)
    let details: Stats
    try {
      details = await fs.lstat(current)
    } catch (error) {
      if (isMissing(error)) return 'ok'
      throw error
    }
    if (details.isSymbolicLink()) return 'symlink'
    const leaf = index === parts.length - 1
    if (leaf) return details.isFile() ? 'ok' : 'not_file'
    if (!details.isDirectory()) return 'not_file'
  }
  return 'ok'
}

const CREDENTIAL_DIRECTORY_NAMES: Record<string, true> = {
  '.ssh': true,
  '.aws': true,
  '.azure': true,
  '.gnupg': true,
  '.kube': true,
  '.docker': true,
  '.pi': true,
  '.codex': true,
  '.claude': true,
  '.gemini': true
}

const CREDENTIAL_FILE_NAME =
  /^\.env(?:\..*)?$|^\.?(?:npmrc|pypirc|netrc|pgpass|htpasswd|git-credentials)$|credential|secret|oauth|^auth\.json$|^token\.json$|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$|\.(?:pem|key|p12|pfx|keystore|jks|kdbx)$/i

/**
 * Credential and native auth files never enter a snapshot or a diff (A4), judged on the
 * project-relative path; app data under the runtime root counts as well.
 */
export function isCredentialPath(
  relative: string,
  absolute: string,
  runtimeRoot: string | null
): boolean {
  if (runtimeRoot && (absolute === runtimeRoot || relativeInside(runtimeRoot, absolute) !== null))
    return true
  const parts = relative.split('/')
  const name = parts[parts.length - 1] ?? ''
  if (CREDENTIAL_FILE_NAME.test(name)) return true
  return parts
    .slice(0, -1)
    .some((part) => Object.hasOwn(CREDENTIAL_DIRECTORY_NAMES, part.toLowerCase()))
}

const CREDENTIAL_SCAN_WINDOW = 32 * 1024
const CREDENTIAL_SCAN_OVERLAP = 1024

/** Bounded windows keep the shared classifier below its own "too long, assume secret" cutoff. */
export function containsCredentialContent(text: string): boolean {
  if (text.length <= CREDENTIAL_SCAN_WINDOW) return containsCredentialLikeText(text)
  for (
    let start = 0;
    start < text.length;
    start += CREDENTIAL_SCAN_WINDOW - CREDENTIAL_SCAN_OVERLAP
  ) {
    if (containsCredentialLikeText(text.slice(start, start + CREDENTIAL_SCAN_WINDOW))) return true
  }
  return false
}

function sameFile(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

export interface CapturedFileState {
  /** null: the capture failed and existence is unknown. */
  exists: boolean | null
  hash?: string
  size?: number
  mode?: number
  /** Full content when the file is a regular file within the snapshot bound and was read stably. */
  content?: Buffer
  preview?: ReviewPreviewSide
  reason?: FileReviewReason
}

async function readStable(handle: FileHandle, expected: Stats): Promise<Buffer | null> {
  const buffer = Buffer.allocUnsafe(expected.size + 1)
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  if (offset !== expected.size) return null
  return buffer.subarray(0, offset)
}

async function hashStable(handle: FileHandle): Promise<string> {
  const hash = createHash('sha256')
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  let position = 0
  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
    if (bytesRead === 0) break
    hash.update(chunk.subarray(0, bytesRead))
    position += bytesRead
  }
  return hash.digest('hex')
}

/**
 * Capture one path. `keepContent` reads up to the snapshot bound into memory; otherwise only a
 * preview-sized prefix is kept and the hash streams. Never throws: failures become `exists: null`
 * (or `exists: true` without a hash when the file changed under the read).
 */
export async function captureFileState(
  absolute: string,
  keepContent: boolean
): Promise<CapturedFileState> {
  let linkStat: Stats
  try {
    linkStat = await fs.lstat(absolute)
  } catch (error) {
    if (isMissing(error)) return { exists: false, preview: { kind: 'absent' } }
    return { exists: null, reason: 'capture_failed' }
  }
  if (!linkStat.isFile()) return { exists: true, reason: 'capture_failed' }

  let handle: FileHandle | undefined
  try {
    handle = await fs.open(absolute, 'r')
    const before = await handle.stat()
    if (!sameFile(before, linkStat)) return { exists: true, reason: 'capture_failed' }
    const size = before.size
    const mode = before.mode & 0o7777
    const readFully =
      size <= REVIEW_MAX_SNAPSHOT_BYTES && (keepContent || size <= REVIEW_MAX_DIFF_BYTES)
    let content: Buffer | null = null
    let hash: string
    if (readFully) {
      content = await readStable(handle, before)
      if (!content) return { exists: true, size, reason: 'capture_failed' }
      hash = createHash('sha256').update(content).digest('hex')
    } else {
      hash = await hashStable(handle)
    }
    const after = await handle.stat()
    const pathAfter = await fs.lstat(absolute)
    if (!sameFile(before, after) || !sameFile(before, pathAfter)) {
      return { exists: true, size, reason: 'capture_failed' }
    }
    const state: CapturedFileState = {
      exists: true,
      hash,
      size,
      mode,
      preview:
        content && size <= REVIEW_MAX_DIFF_BYTES
          ? { kind: 'content', bytes: content }
          : { kind: 'oversize' }
    }
    if (size > REVIEW_MAX_SNAPSHOT_BYTES) state.reason = 'too_large'
    else if (keepContent && content) state.content = content
    return state
  } catch {
    return { exists: true, reason: 'capture_failed' }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Hash-only current state for rollback verification; streams regardless of size. */
export async function currentFileState(
  absolute: string
): Promise<{ exists: boolean | null; hash?: string }> {
  let linkStat: Stats
  try {
    linkStat = await fs.lstat(absolute)
  } catch (error) {
    return isMissing(error) ? { exists: false } : { exists: null }
  }
  if (!linkStat.isFile()) return { exists: true }
  let handle: FileHandle | undefined
  try {
    handle = await fs.open(absolute, 'r')
    const before = await handle.stat()
    const hash = await hashStable(handle)
    const after = await handle.stat()
    const pathAfter = await fs.lstat(absolute)
    if (!sameFile(linkStat, before) || !sameFile(before, after) || !sameFile(before, pathAfter)) {
      return { exists: true }
    }
    return { exists: true, hash }
  } catch {
    return { exists: null }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Snapshot is unusable as review evidence: binary, or credential-like text. */
export function classifySnapshotContent(content: Buffer): FileReviewReason | undefined {
  const text = decodeReviewText(content)
  if (text === null) return 'binary'
  if (containsCredentialContent(text)) return 'sensitive_content'
  return undefined
}

/** Restore bytes atomically: exclusive temp file in the same directory, then rename over target. */
export async function writeFileAtomically(
  target: string,
  content: Buffer,
  mode: number | undefined
): Promise<void> {
  const directory = path.dirname(target)
  await fs.mkdir(directory, { recursive: true })
  const temporary = path.join(directory, `.${path.basename(target)}.tuff-review-${randomUUID()}`)
  let handle: FileHandle | undefined
  try {
    handle = await fs.open(temporary, 'wx', mode ?? 0o644)
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    handle = undefined
    if (mode !== undefined) await fs.chmod(temporary, mode)
    await fs.rename(temporary, target)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await fs.unlink(temporary).catch(() => undefined)
    throw error
  }
}
