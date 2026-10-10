import type { WorkspaceAttachmentRef } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { IntelligenceMessageAttachment } from '@talex-touch/utils/types/intelligence'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, open, readdir, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { toTfileUrl } from '@talex-touch/utils/network'
import { app } from 'electron'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}
/**
 * A voice message's recording: the composer's kept clip, a WAV of 16-bit mono PCM capped where
 * the voice service caps a session's audio (10MB of PCM) plus its 44-byte header.
 */
const AUDIO_MIME = 'audio/wav'
const WAV_HEADER_BYTES = 44
const MAX_AUDIO_BYTES = 10 * 1024 * 1024 + WAV_HEADER_BYTES
const ASSET_EXTENSIONS: Record<string, string> = { ...IMAGE_EXTENSIONS, [AUDIO_MIME]: 'wav' }
const ASSET_FILE = /^[a-f0-9-]{36}\.(?:png|jpg|webp|gif|wav)$/

function maxBytesOf(mimeType: string): number {
  return mimeType === AUDIO_MIME ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
}

/** The only audio this store takes: a canonical PCM WAV header, one channel, 16 bits. */
function isPcm16MonoWav(bytes: Buffer): boolean {
  if (bytes.length <= WAV_HEADER_BYTES) return false
  return (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WAVE' &&
    bytes.toString('ascii', 12, 16) === 'fmt ' &&
    bytes.readUInt16LE(20) === 1 &&
    bytes.readUInt16LE(22) === 1 &&
    bytes.readUInt32LE(24) > 0 &&
    bytes.readUInt16LE(34) === 16 &&
    bytes.toString('ascii', 36, 40) === 'data' &&
    WAV_HEADER_BYTES + bytes.readUInt32LE(40) <= bytes.length
  )
}

export interface StoredWorkspaceAttachment {
  id: string
  conversationId: string
  relativePath: string
  mimeType: string
  name: string | null
  size: number
  createdAt: number
}

/** One owner for materialized attachment copies, never an original user file path. */
export class WorkspaceAttachmentStore {
  private root: string | undefined

  constructor(private readonly rootPath?: string) {}

  private async ensureRoot(): Promise<string> {
    if (this.root) return this.root
    const requested =
      this.rootPath ?? path.join(app.getPath('userData'), 'conversation-attachments')
    await mkdir(requested, { recursive: true, mode: 0o700 })
    const details = await lstat(requested)
    if (details.isSymbolicLink() || !details.isDirectory())
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    this.root = await realpath(requested)
    return this.root
  }

  private async ownerRoot(conversationId: string): Promise<string> {
    const root = await this.ensureRoot()
    const owner = path.join(root, createHash('sha256').update(conversationId).digest('hex'))
    await mkdir(owner, { recursive: true, mode: 0o700 })
    const details = await lstat(owner)
    if (details.isSymbolicLink() || !details.isDirectory() || (await realpath(owner)) !== owner) {
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    }
    return owner
  }

  private async ownedPath(record: StoredWorkspaceAttachment): Promise<string> {
    if (!ASSET_FILE.test(record.relativePath)) {
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    }
    return path.join(await this.ownerRoot(record.conversationId), record.relativePath)
  }

  async persist(
    conversationId: string,
    attachments: readonly IntelligenceMessageAttachment[]
  ): Promise<StoredWorkspaceAttachment[]> {
    if (attachments.length > 16) throw new Error('WORKSPACE_ATTACHMENT_INVALID')
    const records: StoredWorkspaceAttachment[] = []
    try {
      for (const attachment of attachments) {
        const match =
          typeof attachment.dataUrl === 'string' ? IMAGE_DATA_URL.exec(attachment.dataUrl) : null
        if (!match || match[2]!.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
          throw new Error('WORKSPACE_ATTACHMENT_INVALID')
        }
        const mimeType = match[1]!
        const bytes = Buffer.from(match[2]!, 'base64')
        if (
          !bytes.length ||
          bytes.length > MAX_IMAGE_BYTES ||
          bytes.toString('base64') !== match[2]
        ) {
          throw new Error('WORKSPACE_ATTACHMENT_INVALID')
        }
        const id = randomUUID()
        const record: StoredWorkspaceAttachment = {
          id,
          conversationId,
          relativePath: `${id}.${IMAGE_EXTENSIONS[mimeType]}`,
          mimeType,
          name: typeof attachment.name === 'string' ? attachment.name.slice(0, 256) : null,
          size: bytes.length,
          createdAt: Date.now()
        }
        const handle = await open(await this.ownedPath(record), 'wx', 0o600)
        records.push(record)
        try {
          await handle.writeFile(bytes)
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
      return records
    } catch (error) {
      await this.remove(records)
      throw error
    }
  }

  /**
   * Copies a voice message's recording into this conversation. `sourcePath` is the voice module's
   * own kept clip, resolved from its id in main and never taken from a caller; it is re-read here
   * anyway and must be a PCM WAV within the cap.
   */
  async persistAudio(
    conversationId: string,
    sourcePath: string
  ): Promise<StoredWorkspaceAttachment> {
    const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
    let bytes: Buffer
    try {
      const details = await source.stat()
      if (!details.isFile() || details.size > MAX_AUDIO_BYTES)
        throw new Error('WORKSPACE_ATTACHMENT_INVALID')
      bytes = await source.readFile()
    } finally {
      await source.close()
    }
    if (bytes.length > MAX_AUDIO_BYTES || !isPcm16MonoWav(bytes))
      throw new Error('WORKSPACE_ATTACHMENT_INVALID')
    const id = randomUUID()
    const record: StoredWorkspaceAttachment = {
      id,
      conversationId,
      relativePath: `${id}.wav`,
      mimeType: AUDIO_MIME,
      name: null,
      size: bytes.length,
      createdAt: Date.now()
    }
    const handle = await open(await this.ownedPath(record), 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } catch (error) {
      await handle.close()
      await this.remove([record])
      throw error
    }
    await handle.close()
    return record
  }

  async toModel(record: StoredWorkspaceAttachment): Promise<IntelligenceMessageAttachment> {
    // Audio is shown, never sent: its turn carries the transcript as text.
    if (!IMAGE_EXTENSIONS[record.mimeType]) throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    const file = await this.ownedPath(record)
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.size !== record.size || before.size > MAX_IMAGE_BYTES) {
        throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
      }
      const bytes = await handle.readFile()
      const after = await handle.stat()
      if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.mtimeMs !== after.mtimeMs ||
        after.size !== record.size
      ) {
        throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
      }
      return {
        type: 'image',
        dataUrl: `data:${record.mimeType};base64,${bytes.toString('base64')}`,
        ...(record.name ? { name: record.name } : {})
      }
    } finally {
      await handle.close()
    }
  }

  async publicRef(record: StoredWorkspaceAttachment): Promise<WorkspaceAttachmentRef> {
    const file = await this.ownedPath(record)
    const details = await lstat(file)
    if (!details.isFile() || details.isSymbolicLink() || details.size !== record.size) {
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    }
    const audio = record.mimeType === AUDIO_MIME
    const durationMs = audio ? await wavDurationMs(file, record.size) : undefined
    return {
      id: record.id,
      kind: audio ? 'audio' : 'image',
      mimeType: record.mimeType,
      size: record.size,
      ...(record.name ? { name: record.name } : {}),
      previewUrl: toTfileUrl(file),
      ...(durationMs === undefined ? {} : { durationMs })
    }
  }

  async clone(
    record: StoredWorkspaceAttachment,
    childConversationId: string
  ): Promise<StoredWorkspaceAttachment> {
    const source = await this.ownedPath(record)
    const details = await lstat(source)
    if (
      !details.isFile() ||
      details.isSymbolicLink() ||
      details.size !== record.size ||
      details.size > maxBytesOf(record.mimeType)
    ) {
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    }
    const id = randomUUID()
    const copy: StoredWorkspaceAttachment = {
      ...record,
      id,
      conversationId: childConversationId,
      relativePath: `${id}.${ASSET_EXTENSIONS[record.mimeType]}`,
      createdAt: Date.now()
    }
    const target = await this.ownedPath(copy)
    await copyFile(source, target, constants.COPYFILE_EXCL)
    const copied = await lstat(target)
    const sourceAfter = await lstat(source)
    if (
      !copied.isFile() ||
      copied.isSymbolicLink() ||
      copied.size !== record.size ||
      details.dev !== sourceAfter.dev ||
      details.ino !== sourceAfter.ino ||
      details.size !== sourceAfter.size ||
      details.mtimeMs !== sourceAfter.mtimeMs
    ) {
      await unlink(target).catch(() => undefined)
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    }
    return copy
  }

  async cleanupOwner(conversationId: string): Promise<void> {
    const root = await this.ensureRoot()
    const owner = path.join(root, createHash('sha256').update(conversationId).digest('hex'))
    const details = await lstat(owner).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
      throw error
    })
    if (!details) return
    if (!details.isDirectory() || details.isSymbolicLink() || (await realpath(owner)) !== owner)
      throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    for (const entry of await readdir(owner, { withFileTypes: true })) {
      if (!entry.isFile() || !ASSET_FILE.test(entry.name))
        throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
      await unlink(path.join(owner, entry.name))
    }
    await rmdir(owner)
  }

  async remove(records: readonly StoredWorkspaceAttachment[]): Promise<void> {
    for (const record of records) {
      const target = await this.ownedPath(record)
      try {
        const details = await lstat(target)
        if (!details.isFile() || details.isSymbolicLink())
          throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
        await unlink(target)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
  }
}

/** A stored WAV's length from its own byte rate; absent when the header cannot be read. */
async function wavDurationMs(file: string, size: number): Promise<number | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const header = Buffer.alloc(WAV_HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, WAV_HEADER_BYTES, 0)
    if (bytesRead < WAV_HEADER_BYTES) return undefined
    const byteRate = header.readUInt32LE(28)
    if (byteRate <= 0) return undefined
    return Math.round(((size - WAV_HEADER_BYTES) / byteRate) * 1000)
  } catch {
    return undefined
  } finally {
    await handle?.close()
  }
}
