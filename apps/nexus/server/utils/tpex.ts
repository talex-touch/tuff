import type { TpexMetadata } from '@talex-touch/utils/plugin/providers'
import type { Buffer } from 'node:buffer'

export type { TpexMetadata }

export interface TpexExtractedMetadata extends TpexMetadata {
  iconBuffer?: Buffer | null
  iconFileName?: string | null
  iconMimeType?: string | null
}

const TAR_BLOCK_SIZE = 512

// Allowed icon extensions (SVG strongly recommended)
const ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'] as const
const ICON_MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function isReadmeFile(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith('readme.md') || lower.endsWith('readme')
}

function isManifestFile(name: string) {
  return name.toLowerCase().endsWith('manifest.json')
}

function isIconFile(name: string, manifestIconPath?: string): { isIcon: boolean, extension: string | null } {
  const lower = name.toLowerCase()
  const baseName = lower.split('/').pop() ?? ''

  // Check if this matches the manifest icon path
  if (manifestIconPath) {
    const manifestIconLower = manifestIconPath.toLowerCase()
    if (lower.endsWith(manifestIconLower) || baseName === manifestIconLower.split('/').pop()) {
      const ext = ICON_EXTENSIONS.find(e => baseName.endsWith(e))
      return { isIcon: !!ext, extension: ext ?? null }
    }
  }

  // Fallback: look for common icon file patterns
  const iconPatterns = ['icon.svg', 'logo.svg', 'icon.png', 'logo.png']
  for (const pattern of iconPatterns) {
    if (baseName === pattern || lower.endsWith(`/${pattern}`)) {
      const ext = ICON_EXTENSIONS.find(e => baseName.endsWith(e))
      return { isIcon: true, extension: ext ?? null }
    }
  }

  return { isIcon: false, extension: null }
}

function readHeaderString(block: Buffer, start: number, length: number) {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim()
}

function readHeaderOctal(block: Buffer, start: number, length: number): number {
  const raw = readHeaderString(block, start, length)
  if (!raw.length)
    return 0
  const value = parseInt(raw, 8)
  return Number.isFinite(value) ? value : 0
}

function isEmptyBlock(block: Buffer) {
  for (const byte of block) {
    if (byte !== 0)
      return false
  }
  return true
}

export async function extractTpexMetadata(buffer: Buffer): Promise<TpexExtractedMetadata> {
  let readmeMarkdown: string | null = null
  let manifest: Record<string, unknown> | null = null
  let iconBuffer: Buffer | null = null
  let iconFileName: string | null = null
  let iconMimeType: string | null = null
  let manifestIconPath: string | undefined

  // First pass: find manifest to get icon path
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header))
      break

    const name = readHeaderString(header, 0, 100)
    const size = readHeaderOctal(header, 124, 12)

    if (!name || size < 0)
      break

    const fileEnd = offset + size
    if (fileEnd > buffer.length)
      break

    const fileBuffer = buffer.subarray(offset, fileEnd)

    if (isManifestFile(name)) {
      try {
        manifest = JSON.parse(fileBuffer.toString('utf8')) as Record<string, unknown>
        if (typeof manifest.icon === 'string') {
          manifestIconPath = manifest.icon
        }
      }
      catch {
        manifest = null
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset = fileEnd + padding

    if (manifest)
      break
  }

  // Second pass: extract all files
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE

    if (isEmptyBlock(header))
      break

    const name = readHeaderString(header, 0, 100)
    const size = readHeaderOctal(header, 124, 12)

    if (!name || size < 0)
      break

    const fileEnd = offset + size
    if (fileEnd > buffer.length)
      break

    const fileBuffer = buffer.subarray(offset, fileEnd)

    if (!readmeMarkdown && isReadmeFile(name)) {
      try {
        readmeMarkdown = fileBuffer.toString('utf8')
      }
      catch {
        readmeMarkdown = null
      }
    }

    if (!manifest && isManifestFile(name)) {
      try {
        manifest = JSON.parse(fileBuffer.toString('utf8')) as Record<string, unknown>
      }
      catch {
        manifest = null
      }
    }

    // Extract icon file
    if (!iconBuffer) {
      const { isIcon, extension } = isIconFile(name, manifestIconPath)
      if (isIcon && extension) {
        // Create a proper copy of the buffer data to ensure it's independent
        // and has byteOffset of 0 for R2 compatibility
        iconBuffer = Buffer.alloc(fileBuffer.length)
        fileBuffer.copy(iconBuffer)
        iconFileName = name.split('/').pop() ?? `icon${extension}`
        iconMimeType = ICON_MIME_TYPES[extension] ?? 'image/svg+xml'
      }
    }

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset = fileEnd + padding

    if (readmeMarkdown && manifest && iconBuffer)
      break
  }

  return {
    readmeMarkdown,
    manifest,
    iconBuffer,
    iconFileName,
    iconMimeType,
  }
}
