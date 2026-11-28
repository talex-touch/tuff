import type { IntelligenceInvokeOptions } from '@talex-touch/tuff-intelligence'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../../utils/app-root-path'
import {
  getAdditionalAllowedLocalFileRoots,
  getAllowedLocalFileRoots,
  isAllowedLocalFilePath
} from '../../../utils/local-file-policy'
import { isCredentialPath } from '../../conversation/file-review-fs'
import { readPluginInvocation } from '../intelligence-invoke-purpose'

export const MAX_VISION_IMAGE_FILE_BYTES = 20 * 1024 * 1024

export interface VerifiedVisionImageFile {
  buffer: Buffer
  mimeType: string
  extension: string
}

interface DetectedImageType {
  mimeType: string
  extension: string
}

export function detectImageSignature(buffer: Buffer): DetectedImageType | null {
  if (buffer.byteLength < 4) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' }
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }

  // GIF: GIF87a / GIF89a
  if (buffer.byteLength >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii')
    if (header === 'GIF87a' || header === 'GIF89a') {
      return { mimeType: 'image/gif', extension: 'gif' }
    }
  }

  // WebP: RIFF....WEBP
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' }
  }

  // BMP: BM
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { mimeType: 'image/bmp', extension: 'bmp' }
  }

  // TIFF: II*\0 or MM\0*
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return { mimeType: 'image/tiff', extension: 'tiff' }
  }

  // ICO: 00 00 01 00
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return { mimeType: 'image/x-icon', extension: 'ico' }
  }

  // ISO BMFF (AVIF / HEIC / HEIF): ....ftyp(avif|avis|heic|heix|hevc|hevx|mif1|msf1)
  if (buffer.byteLength >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis') {
      return { mimeType: 'image/avif', extension: 'avif' }
    }
    if (
      brand === 'heic' ||
      brand === 'heix' ||
      brand === 'hevc' ||
      brand === 'hevx' ||
      brand === 'mif1' ||
      brand === 'msf1'
    ) {
      return { mimeType: 'image/heic', extension: 'heic' }
    }
  }

  return null
}

function isPluginCaller(options?: IntelligenceInvokeOptions): boolean {
  if (!options) return false
  if (readPluginInvocation(options)) return true
  const caller = options.metadata?.caller
  return typeof caller === 'string' && caller.trim().startsWith('plugin:')
}

function resolveRuntimeRootSafe(): string | null {
  try {
    return resolveRuntimeRootPath(app)
  } catch {
    return null
  }
}

export async function readBoundedRegularFile(filePath: string, maxBytes: number): Promise<Buffer> {
  const flags =
    fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0) |
    (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0)
  const handle = await open(filePath, flags)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      throw new Error('VISION_IMAGE_NOT_REGULAR_FILE')
    }
    if (stats.size <= 0) {
      throw new Error('VISION_IMAGE_EMPTY')
    }
    if (stats.size > maxBytes) {
      throw new Error('VISION_IMAGE_TOO_LARGE')
    }

    const chunks: Buffer[] = []
    let total = 0
    const chunkSize = Math.min(64 * 1024, maxBytes + 1)
    const scratch = Buffer.allocUnsafe(chunkSize)
    while (true) {
      const { bytesRead } = await handle.read(scratch, 0, scratch.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) {
        throw new Error('VISION_IMAGE_TOO_LARGE')
      }
      chunks.push(Buffer.from(scratch.subarray(0, bytesRead)))
    }
    if (total === 0) {
      throw new Error('VISION_IMAGE_EMPTY')
    }
    return chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, total)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Safely reads a local vision image file for host-owned intelligence invocations.
 * Plugins are never permitted to pass `source.type === 'file'` (they must pass inline data URLs
 * or base64 they already hold). Host callers are still restricted to allowed local roots,
 * non-credential regular files (opened with `O_NOFOLLOW`), bounded byte size, and verified image
 * magic headers so arbitrary files cannot be exfiltrated to remote LLM endpoints.
 */
export async function readSafeVisionImageFile(
  filePath: string,
  options?: IntelligenceInvokeOptions
): Promise<VerifiedVisionImageFile> {
  if (isPluginCaller(options)) {
    throw new Error('VISION_FILE_SOURCE_FORBIDDEN')
  }

  if (typeof filePath !== 'string' || !filePath.trim() || filePath.includes('\0')) {
    throw new Error('VISION_FILE_PATH_INVALID')
  }
  const normalized = path.resolve(filePath)
  if (!path.isAbsolute(normalized)) {
    throw new Error('VISION_FILE_PATH_INVALID')
  }

  const linkInfo = await lstat(normalized)
  if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
    throw new Error('VISION_FILE_SOURCE_FORBIDDEN')
  }

  const canonical = await realpath(normalized)
  const allowedRoots = [...getAllowedLocalFileRoots(), ...getAdditionalAllowedLocalFileRoots()]
  if (!isAllowedLocalFilePath(canonical, allowedRoots)) {
    throw new Error('VISION_FILE_SOURCE_FORBIDDEN')
  }

  const relativeName = path.basename(canonical)
  if (isCredentialPath(relativeName, canonical, resolveRuntimeRootSafe())) {
    throw new Error('VISION_FILE_SOURCE_FORBIDDEN')
  }

  const buffer = await readBoundedRegularFile(canonical, MAX_VISION_IMAGE_FILE_BYTES)
  const signature = detectImageSignature(buffer)
  if (!signature) {
    throw new Error('VISION_IMAGE_INVALID_FORMAT')
  }

  return {
    buffer,
    mimeType: signature.mimeType,
    extension: signature.extension
  }
}
