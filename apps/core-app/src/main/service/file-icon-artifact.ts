import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/**
 * Bounded file-icon artifact store.
 *
 * The single owner of PNG validation, content-hash naming and atomic writes for generated file
 * icons. Callers hand it bytes they already hold in memory (a bounded staging read or an Electron
 * `NativeImage`); it never opens an unbounded file and never deletes anything it did not create in
 * the same call.
 *
 * Bytes are accepted only after a full chunk-structure walk and a bounded real decode, but the
 * artifact written to disk is always the caller's original encoding — never a re-encode.
 */

export const FILE_ICON_MAX_BYTES = 1024 * 1024
export const FILE_ICON_MAX_DIMENSION = 256

export const FILE_ICON_ERROR_INVALID_PNG = 'FILE_ICON_INVALID_PNG'
export const FILE_ICON_ERROR_TOO_LARGE = 'FILE_ICON_TOO_LARGE'
export const FILE_ICON_ERROR_INVALID_CACHE_DIRECTORY = 'FILE_ICON_INVALID_CACHE_DIRECTORY'
export const FILE_ICON_ERROR_WRITE_VERIFICATION_FAILED = 'FILE_ICON_WRITE_VERIFICATION_FAILED'

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_SIGNATURE_BYTES = 8
const PNG_CHUNK_HEADER_BYTES = 8
const PNG_CHUNK_TRAILER_BYTES = 4
const PNG_IHDR_DATA_BYTES = 13
const PNG_MINIMUM_BYTES =
  PNG_SIGNATURE_BYTES +
  PNG_CHUNK_HEADER_BYTES +
  PNG_IHDR_DATA_BYTES +
  PNG_CHUNK_TRAILER_BYTES +
  PNG_CHUNK_HEADER_BYTES +
  PNG_CHUNK_TRAILER_BYTES

export interface FileIconPngInfo {
  width: number
  height: number
  bytes: number
}

export interface FileIconArtifactPersistResult {
  path: string
  bytes: number
  /** False when an identical content-hash artifact already existed and was reused. */
  created: boolean
}

function createFileIconError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code?: string }
  error.code = code
  return error
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * Walks the complete PNG chunk structure: signature, IHDR first with 13 data bytes, at least one
 * IDAT, and a zero-length IEND terminator. Returns null for anything else or for dimensions outside
 * {@link FILE_ICON_MAX_DIMENSION}.
 */
export function readFileIconPngDimensions(
  bytes: Uint8Array
): { width: number; height: number } | null {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < PNG_MINIMUM_BYTES) {
    return null
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return null
    }
  }

  const view = asBuffer(bytes)
  let offset = PNG_SIGNATURE_BYTES
  let dimensions: { width: number; height: number } | null = null
  let hasImageData = false

  while (offset + PNG_CHUNK_HEADER_BYTES + PNG_CHUNK_TRAILER_BYTES <= bytes.byteLength) {
    const dataLength = view.readUInt32BE(offset)
    const chunkType = view.toString('latin1', offset + 4, offset + 8)
    const nextOffset = offset + PNG_CHUNK_HEADER_BYTES + dataLength + PNG_CHUNK_TRAILER_BYTES
    if (nextOffset > bytes.byteLength) {
      return null
    }

    if (!dimensions) {
      if (chunkType !== 'IHDR' || dataLength !== PNG_IHDR_DATA_BYTES) {
        return null
      }
      const width = view.readUInt32BE(offset + PNG_CHUNK_HEADER_BYTES)
      const height = view.readUInt32BE(offset + PNG_CHUNK_HEADER_BYTES + 4)
      if (
        width <= 0 ||
        height <= 0 ||
        width > FILE_ICON_MAX_DIMENSION ||
        height > FILE_ICON_MAX_DIMENSION
      ) {
        return null
      }
      dimensions = { width, height }
    } else if (chunkType === 'IDAT') {
      hasImageData = true
    } else if (chunkType === 'IEND') {
      return dataLength === 0 && hasImageData ? dimensions : null
    }

    offset = nextOffset
  }

  return null
}

/**
 * Throws unless the bytes are a bounded, structurally valid PNG.
 */
export function assertFileIconPng(bytes: Uint8Array): FileIconPngInfo {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw createFileIconError(FILE_ICON_ERROR_INVALID_PNG, 'File icon output is empty')
  }
  if (bytes.byteLength > FILE_ICON_MAX_BYTES) {
    throw createFileIconError(
      FILE_ICON_ERROR_TOO_LARGE,
      `File icon output exceeds ${FILE_ICON_MAX_BYTES} bytes`
    )
  }

  const dimensions = readFileIconPngDimensions(bytes)
  if (!dimensions) {
    throw createFileIconError(
      FILE_ICON_ERROR_INVALID_PNG,
      `File icon output is not a structurally valid ${FILE_ICON_MAX_DIMENSION}px-bounded PNG`
    )
  }

  return { ...dimensions, bytes: bytes.byteLength }
}

/**
 * Reads a generated icon file with a bounded allocation: the file size is checked before any
 * buffer is reserved and the read is capped at that size.
 */
export async function readBoundedFileIconBytes(filePath: string): Promise<Uint8Array | null> {
  const handle = await fs
    .open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    .catch(() => null)
  if (!handle) return null
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size <= 0 || before.size > FILE_ICON_MAX_BYTES) return null
    const buffer = Buffer.allocUnsafe(before.size)
    let offset = 0
    while (offset < before.size) {
      const { bytesRead } = await handle.read(buffer, offset, before.size - offset, offset)
      if (bytesRead === 0) return null
      offset += bytesRead
    }
    const after = await handle.stat()
    // Atomic same-hash replacement may unlink this open inode and change ctime
    // without changing its data. Byte equality is verified by the artifact owner.
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) return null
    return buffer
  } catch {
    return null
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Bounded real decode through the existing sharp dependency: pixel count is capped before any
 * allocation and the decoded pixels are discarded. The caller's PNG bytes are never re-encoded.
 */
async function assertDecodableFileIconPng(bytes: Uint8Array): Promise<void> {
  try {
    // Runtime-only: sharp is an external native dependency, so a static import would pull it (and
    // its platform binaries) into every bundle that references this module, including the icon
    // worker, which must stay lightweight and never decodes in-process.
    const { default: sharp } = await import('sharp')
    const decoded = await sharp(bytes, {
      limitInputPixels: FILE_ICON_MAX_DIMENSION * FILE_ICON_MAX_DIMENSION,
      animated: false
    })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = decoded.info
    if (
      width <= 0 ||
      height <= 0 ||
      width > FILE_ICON_MAX_DIMENSION ||
      height > FILE_ICON_MAX_DIMENSION
    ) {
      throw createFileIconError(
        FILE_ICON_ERROR_INVALID_PNG,
        `File icon output decoded to ${width}x${height}px`
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error as Error & { code?: string }).code === FILE_ICON_ERROR_INVALID_PNG
    ) {
      throw error
    }
    throw createFileIconError(
      FILE_ICON_ERROR_INVALID_PNG,
      `File icon output did not decode within ${FILE_ICON_MAX_DIMENSION}x${FILE_ICON_MAX_DIMENSION}px: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Validates the bytes, stores them under their content hash inside `cacheDirectory`, and returns
 * the verified absolute path together with whether this call created the artifact. Writes are
 * atomic and the bytes on disk are re-read before a path is handed out; only this call's own
 * temporary file is ever removed.
 */
export async function persistFileIconPngArtifact(
  bytes: Uint8Array,
  cacheDirectory: string
): Promise<FileIconArtifactPersistResult> {
  if (!cacheDirectory || !path.isAbsolute(cacheDirectory)) {
    throw createFileIconError(
      FILE_ICON_ERROR_INVALID_CACHE_DIRECTORY,
      'File icon cache directory must be an absolute path'
    )
  }

  assertFileIconPng(bytes)
  await assertDecodableFileIconPng(bytes)

  const source = asBuffer(bytes)
  const targetPath = path.join(
    cacheDirectory,
    `${createHash('sha256').update(bytes).digest('hex')}.png`
  )
  await fs.mkdir(cacheDirectory, { recursive: true })

  const existing = await readBoundedFileIconBytes(targetPath)
  if (existing && asBuffer(existing).equals(source)) {
    return { path: targetPath, bytes: source.byteLength, created: false }
  }

  const temporaryPath = path.join(cacheDirectory, `.tmp-${process.pid}-${randomUUID()}.png`)
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: 'wx' })
    await fs.rename(temporaryPath, targetPath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }

  const written = await readBoundedFileIconBytes(targetPath)
  if (!written || !asBuffer(written).equals(source)) {
    throw createFileIconError(
      FILE_ICON_ERROR_WRITE_VERIFICATION_FAILED,
      'File icon bytes on disk did not match the persisted PNG'
    )
  }

  return { path: targetPath, bytes: source.byteLength, created: true }
}

/**
 * Path-only form of {@link persistFileIconPngArtifact} for callers that only need the reference.
 */
export async function persistFileIconPng(
  bytes: Uint8Array,
  cacheDirectory: string
): Promise<string> {
  const result = await persistFileIconPngArtifact(bytes, cacheDirectory)
  return result.path
}
